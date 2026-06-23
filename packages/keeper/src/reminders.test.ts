/**
 * Unit tests for the reminder decision logic. Run: `npm test` (node --test via tsx).
 * These cover the pure scheduling rules; email delivery is exercised in dry-run mode by the keeper.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  dueThresholds,
  findContact,
  formatDuration,
  parseLeads,
  type ReminderStore,
} from "./reminders";

const WINDOW = 100_000; // inactivity window in ms
const T0 = 1_000_000; // lastActive

test("no reminder early in the window", () => {
  // 5% elapsed → 95% left, below the 50% threshold trigger.
  const due = dueThresholds({
    now: T0 + WINDOW * 0.05,
    lastActive: T0,
    inactivity: WINDOW,
    leadsPct: [50, 15],
    fired: [],
  });
  assert.deepEqual(due, []);
});

test("fires the 50% threshold once crossed", () => {
  const due = dueThresholds({
    now: T0 + WINDOW * 0.6, // 40% left ≤ 50
    lastActive: T0,
    inactivity: WINDOW,
    leadsPct: [50, 15],
    fired: [],
  });
  assert.deepEqual(due, [50]);
});

test("does not refire an already-sent threshold", () => {
  const due = dueThresholds({
    now: T0 + WINDOW * 0.6,
    lastActive: T0,
    inactivity: WINDOW,
    leadsPct: [50, 15],
    fired: [50],
  });
  assert.deepEqual(due, []);
});

test("backlog returns crossed thresholds most-urgent first", () => {
  // 10% left: both 50 and 15 crossed, neither fired.
  const due = dueThresholds({
    now: T0 + WINDOW * 0.9,
    lastActive: T0,
    inactivity: WINDOW,
    leadsPct: [50, 15],
    fired: [],
  });
  assert.deepEqual(due, [15, 50]);
});

test("no reminder once past the deadline (keeper arms instead)", () => {
  const due = dueThresholds({
    now: T0 + WINDOW + 1,
    lastActive: T0,
    inactivity: WINDOW,
    leadsPct: [50, 15],
    fired: [],
  });
  assert.deepEqual(due, []);
});

test("zero/invalid inactivity never reminds", () => {
  assert.deepEqual(
    dueThresholds({ now: T0, lastActive: T0, inactivity: 0, leadsPct: [50], fired: [] }),
    [],
  );
});

test("parseLeads cleans, dedups, sorts desc, drops out-of-range", () => {
  assert.deepEqual(parseLeads("15, 50, 50, 200, -3, 80"), [80, 50, 15]);
  assert.equal(parseLeads(""), undefined);
  assert.equal(parseLeads(undefined), undefined);
});

test("findContact prefers estateId over owner address", () => {
  const store: ReminderStore = {
    contacts: [
      { owner: "0xowner", email: "owner@x.com" },
      { estateId: "0xEST", email: "estate@x.com" },
    ],
    sent: {},
  };
  assert.equal(findContact(store, "0xest", "0xOWNER")?.email, "estate@x.com");
  assert.equal(findContact(store, "0xother", "0xowner")?.email, "owner@x.com");
  assert.equal(findContact(store, "0xnone", "0xnobody"), undefined);
});

test("formatDuration is human and non-negative", () => {
  assert.equal(formatDuration(-5), "0 minutes");
  assert.equal(formatDuration(60_000), "1 minute");
  assert.equal(formatDuration(3_600_000), "1 hour");
  assert.equal(formatDuration(2 * 86_400_000), "2 days");
});
