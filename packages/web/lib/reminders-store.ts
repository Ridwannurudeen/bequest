/**
 * Server-side reminder contact store for the web app.
 *
 * Reads/writes the SAME JSON shape and file the keeper consumes (see
 * `packages/keeper/src/reminders.ts`), so an email an owner enters in the UI is picked up by the
 * keeper on its next tick. Point both at one file via the `REMINDERS_STORE` env (an absolute path
 * when the web app and keeper run on different working directories).
 *
 * This is the local/demo backend. For web-on-Vercel, swap these fs calls for a shared store
 * (Vercel KV / Postgres) — the rest of the feature is storage-agnostic.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";

export interface ReminderContact {
  estateId?: string;
  owner?: string;
  email: string;
  leadsPct?: number[];
}

interface SentRecord {
  cycle: number;
  fired: number[];
}

export interface ReminderStore {
  contacts: ReminderContact[];
  sent: Record<string, SentRecord>;
}

export function storePath(): string {
  return process.env.REMINDERS_STORE ?? "reminders.json";
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
    return { contacts: [], sent: {} };
  }
}

export function saveStore(store: ReminderStore, path = storePath()): void {
  writeFileSync(path, JSON.stringify(store, null, 2) + "\n");
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function parseLeads(raw: string | undefined): number[] | undefined {
  if (!raw) return undefined;
  const leads = raw
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0 && n <= 100);
  return leads.length ? Array.from(new Set(leads)).sort((a, b) => b - a) : undefined;
}

/** Find a contact for an estate: exact estateId wins over an owner-address match. */
export function findContact(
  store: ReminderStore,
  estateId: string,
  owner: string,
): ReminderContact | undefined {
  const byEstate = store.contacts.find((c) => c.estateId?.toLowerCase() === estateId.toLowerCase());
  if (byEstate) return byEstate;
  return store.contacts.find((c) => c.owner?.toLowerCase() === owner.toLowerCase());
}

/** Upsert a contact keyed by estateId. Returns whether it was added or updated. */
export function upsertContact(
  store: ReminderStore,
  contact: ReminderContact,
): "added" | "updated" {
  const i = store.contacts.findIndex(
    (c) => c.estateId?.toLowerCase() === contact.estateId?.toLowerCase(),
  );
  if (i >= 0) {
    store.contacts[i] = contact;
    return "updated";
  }
  store.contacts.push(contact);
  return "added";
}
