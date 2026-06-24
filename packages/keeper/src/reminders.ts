/**
 * Bequest reminders — autonomous "you forgot to check in" nudges.
 *
 * The dead-man's switch arms an estate once `now >= last_active + inactivity`. A real owner who is
 * simply busy (not dead) would lose control of their estate just for forgetting to press the
 * "Still Alive" button. This module closes that gap: as an ACTIVE estate approaches its inactivity
 * deadline, the keeper emails the owner — well before it arms — so they can heartbeat in time.
 *
 * Design notes:
 *   - Email addresses are NOT on-chain (privacy). Owners register a contact off-chain; the keeper
 *     matches it to an estate by `estateId` (preferred) or `owner` address. See `addReminder.ts`.
 *   - Reminders fire at lead thresholds expressed as a percent of the inactivity window REMAINING,
 *     so they scale to any window (a 30-day switch and a 1-hour demo both get the same cadence).
 *   - State is per `last_active_ms` cycle: a fresh heartbeat resets the cycle, so the owner gets a
 *     new set of reminders next time. Within a cycle each threshold fires at most once (no spam).
 *   - No new dependencies: email goes out via Resend's HTTP API using global `fetch`. With no
 *     `RESEND_API_KEY` the send is logged instead of sent, so demos and tests run dry.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";

export interface ReminderContact {
  /** Preferred match key: the estate this contact owns. */
  estateId?: string;
  /** Fallback match key: the owner's Sui address (matches any estate they own). */
  owner?: string;
  /** Where to send the reminder. */
  email: string;
  /** Optional per-contact lead thresholds (percent of window remaining); overrides the default. */
  leadsPct?: number[];
}

interface SentRecord {
  /** The `last_active_ms` cycle these reminders belong to. A new heartbeat starts a new cycle. */
  cycle: number;
  /** Lead thresholds (percent) already emailed in this cycle. */
  fired: number[];
}

export interface ReminderStore {
  contacts: ReminderContact[];
  /** Per-estate send state, keyed by estateId. */
  sent: Record<string, SentRecord>;
}

const EMPTY_STORE: ReminderStore = { contacts: [], sent: {} };

export function storePath(): string {
  return process.env.REMINDERS_STORE ?? "reminders.json";
}

/** Default lead thresholds, as percent of the inactivity window remaining. */
export function defaultLeadsPct(): number[] {
  return parseLeads(process.env.REMINDER_LEADS_PCT) ?? [50, 15];
}

export function parseLeads(raw: string | undefined): number[] | undefined {
  if (!raw) return undefined;
  const leads = raw
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0 && n <= 100);
  return leads.length ? Array.from(new Set(leads)).sort((a, b) => b - a) : undefined;
}

export function loadStore(path = storePath()): ReminderStore {
  if (!existsSync(path)) return { contacts: [], sent: {} };
  try {
    const raw = readFileSync(path, "utf8").trim();
    if (!raw) return { contacts: [], sent: {} };
    const parsed = JSON.parse(raw) as Partial<ReminderStore>;
    return {
      contacts: Array.isArray(parsed.contacts) ? parsed.contacts : [],
      sent: parsed.sent && typeof parsed.sent === "object" ? parsed.sent : {},
    };
  } catch {
    console.error(`[reminder] could not parse ${path}; starting empty`);
    return { contacts: [], sent: {} };
  }
}

export function saveStore(store: ReminderStore, path = storePath()): void {
  writeFileSync(path, JSON.stringify(store, null, 2) + "\n");
}

/** Match an estate to a registered contact: exact estateId wins over an owner-address match. */
export function findContact(
  store: ReminderStore,
  estateId: string,
  owner: string,
): ReminderContact | undefined {
  const byEstate = store.contacts.find((c) => c.estateId?.toLowerCase() === estateId.toLowerCase());
  if (byEstate) return byEstate;
  return store.contacts.find((c) => c.owner?.toLowerCase() === owner.toLowerCase());
}

/**
 * Pure decision: which lead thresholds should fire right now.
 *
 * Returns the unfired thresholds whose "percent remaining" mark has been crossed, most-urgent
 * (smallest percent) first. Empty when the estate is already due (the keeper arms it) or no
 * threshold has been crossed yet.
 */
export function dueThresholds(opts: {
  now: number;
  lastActive: number;
  inactivity: number;
  leadsPct: number[];
  fired: number[];
}): number[] {
  const { now, lastActive, inactivity, leadsPct, fired } = opts;
  if (inactivity <= 0) return [];
  const msLeft = lastActive + inactivity - now;
  if (msLeft <= 0) return []; // past the deadline — arming, not reminding
  const pctLeft = (msLeft / inactivity) * 100;
  return leadsPct
    .filter((p) => pctLeft <= p && !fired.includes(p))
    .sort((a, b) => a - b);
}

export function formatDuration(ms: number): string {
  if (ms < 0) ms = 0;
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"}`;
  const hours = Math.round(ms / 3_600_000);
  if (hours < 48) return `${hours} hour${hours === 1 ? "" : "s"}`;
  const days = Math.round(ms / 86_400_000);
  return `${days} day${days === 1 ? "" : "s"}`;
}

export function reminderEmail(opts: {
  estateId: string;
  msLeft: number;
}): { subject: string; html: string; text: string } {
  const left = formatDuration(opts.msLeft);
  const tag = opts.estateId.slice(0, 10) + "…";
  const appUrl = process.env.APP_URL?.replace(/\/$/, "");
  const link = appUrl ? `${appUrl}/estates` : null;
  const cta = link
    ? `<p><a href="${link}" style="background:#111;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">I'm still here — check in</a></p>`
    : `<p>Open Bequest and press <b>Still Alive</b> to check in.</p>`;
  const subject = `⏰ Bequest: check in within ${left} or your estate will arm`;
  const html =
    `<div style="font-family:system-ui,sans-serif;max-width:520px">` +
    `<h2>Time to check in</h2>` +
    `<p>Your Bequest estate <code>${tag}</code> hasn't seen activity recently. ` +
    `If you don't press <b>Still Alive</b> within about <b>${left}</b>, the dead-man's switch ` +
    `will arm and begin handing your estate to your heirs.</p>` +
    cta +
    `<p style="color:#666;font-size:13px">If this is expected (you've set things up to pass on), no action is needed.</p>` +
    `</div>`;
  const text =
    `Time to check in.\n\nYour Bequest estate ${tag} hasn't seen activity recently. ` +
    `If you don't press "Still Alive" within about ${left}, the dead-man's switch will arm ` +
    `and begin handing your estate to your heirs.\n` +
    (link ? `Check in: ${link}\n` : `Open Bequest and press "Still Alive".\n`);
  return { subject, html, text };
}

export type SendResult = "sent" | "logged" | "error";

/** Send via Resend HTTP API. With no RESEND_API_KEY, log the intent instead (dry-run). */
export async function sendReminderEmail(
  to: string,
  msg: { subject: string; html: string; text: string },
): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.REMINDER_FROM ?? "Bequest <onboarding@resend.dev>";
  if (!key) {
    console.log(`  [reminder:dry-run] would email ${to} — "${msg.subject}"`);
    return "logged";
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, subject: msg.subject, html: msg.html, text: msg.text }),
    });
    if (!res.ok) {
      console.error(`  [reminder] Resend ${res.status}: ${await res.text()}`);
      return "error";
    }
    return "sent";
  } catch (e) {
    console.error("  [reminder] send failed:", e instanceof Error ? e.message : e);
    return "error";
  }
}

/**
 * Check one ACTIVE estate and send a reminder if a lead threshold has been crossed. Mutates
 * `store.sent`. Returns a one-line log message when it acted, else null. The caller persists the
 * store after the tick.
 */
export async function checkReminder(
  store: ReminderStore,
  estate: { estateId: string; owner: string; lastActive: number; inactivity: number },
  now: number,
): Promise<string | null> {
  const contact = findContact(store, estate.estateId, estate.owner);
  if (!contact) return null;

  // Reset the cycle when the owner has heartbeated since we last recorded state.
  const prev = store.sent[estate.estateId];
  const fired = prev && prev.cycle === estate.lastActive ? prev.fired : [];

  const leads = contact.leadsPct ?? defaultLeadsPct();
  const due = dueThresholds({
    now,
    lastActive: estate.lastActive,
    inactivity: estate.inactivity,
    leadsPct: leads,
    fired,
  });
  if (due.length === 0) {
    // Keep state in sync with the current cycle even when nothing fires.
    store.sent[estate.estateId] = { cycle: estate.lastActive, fired };
    return null;
  }

  const msLeft = estate.lastActive + estate.inactivity - now;
  const result = await sendReminderEmail(contact.email, reminderEmail({ estateId: estate.estateId, msLeft }));

  // On a hard send error, don't mark fired — retry next tick. Otherwise record all crossed
  // thresholds so a single email covers a backlog without re-sending.
  const nowFired = result === "error" ? fired : Array.from(new Set([...fired, ...due]));
  store.sent[estate.estateId] = { cycle: estate.lastActive, fired: nowFired };

  if (result === "error") return null;
  const verb = result === "sent" ? "emailed" : "would email (dry-run)";
  return `${verb} ${contact.email} — ${formatDuration(msLeft)} left (thresholds ${due.join("/")}%)`;
}
