/**
 * Register (or update) an owner's reminder contact.
 *
 *   npm run reminder:add -- --estate 0xESTATE --email owner@example.com
 *   npm run reminder:add -- --owner 0xOWNER  --email owner@example.com --leads 50,15
 *   npm run reminder:add -- --list
 *
 * Matching is by estate id first, then owner address (see reminders.ts). Writes to the same
 * REMINDERS_STORE the keeper reads, so a contact added here takes effect on the keeper's next tick.
 */
import { loadStore, parseLeads, saveStore, storePath, type ReminderContact } from "./reminders";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function main(): void {
  const store = loadStore();

  if (process.argv.includes("--list")) {
    if (store.contacts.length === 0) {
      console.log(`No reminder contacts in ${storePath()}.`);
      return;
    }
    console.log(`Reminder contacts (${storePath()}):`);
    for (const c of store.contacts) {
      const key = c.estateId ?? c.owner ?? "(no key)";
      const leads = c.leadsPct ? ` leads=${c.leadsPct.join("/")}%` : "";
      console.log(`  ${c.email}  →  ${key}${leads}`);
    }
    return;
  }

  const estateId = arg("estate");
  const owner = arg("owner");
  const email = arg("email");
  const leadsPct = parseLeads(arg("leads"));

  if (!email || (!estateId && !owner)) {
    console.error(
      "Usage: reminder:add --email <addr> (--estate <id> | --owner <addr>) [--leads 50,15]\n" +
        "       reminder:add --list",
    );
    process.exit(1);
  }

  const contact: ReminderContact = { email };
  if (estateId) contact.estateId = estateId;
  if (owner) contact.owner = owner;
  if (leadsPct) contact.leadsPct = leadsPct;

  // Upsert on the same match key.
  const i = store.contacts.findIndex((c) =>
    estateId
      ? c.estateId?.toLowerCase() === estateId.toLowerCase()
      : c.owner?.toLowerCase() === owner!.toLowerCase(),
  );
  if (i >= 0) store.contacts[i] = contact;
  else store.contacts.push(contact);

  saveStore(store);
  console.log(
    `${i >= 0 ? "Updated" : "Added"} reminder: ${email} → ${estateId ?? owner} (${storePath()})`,
  );
}

main();
