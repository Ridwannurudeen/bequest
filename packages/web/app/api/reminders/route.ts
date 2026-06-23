import { NextResponse } from "next/server";
import {
  findContact,
  isValidEmail,
  loadStore,
  parseLeads,
  saveStore,
  upsertContact,
  type ReminderContact,
} from "../../../lib/reminders-store";

// fs-backed store needs the Node runtime.
export const runtime = "nodejs";

const ADDRESS = /^0x[0-9a-fA-F]{64}$/;

type Body = {
  estateId?: string;
  owner?: string;
  email?: string;
  leads?: string;
};

// GET /api/reminders?estateId=0x..&owner=0x..  -> the saved contact (for prefill), or null.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const estateId = url.searchParams.get("estateId") ?? "";
  const owner = url.searchParams.get("owner") ?? "";
  if (!ADDRESS.test(estateId)) {
    return NextResponse.json({ error: "A valid estateId is required." }, { status: 400 });
  }
  const contact = findContact(loadStore(), estateId, owner);
  return NextResponse.json({
    data: contact ? { email: contact.email, leadsPct: contact.leadsPct ?? null } : null,
  });
}

// POST /api/reminders  { estateId, owner, email, leads? } -> upsert the owner's reminder contact.
export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const estateId = body.estateId?.trim() ?? "";
  const owner = body.owner?.trim();
  const email = body.email?.trim() ?? "";

  if (!ADDRESS.test(estateId)) {
    return NextResponse.json({ error: "A valid estateId is required." }, { status: 400 });
  }
  if (!isValidEmail(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  const contact: ReminderContact = { estateId, email };
  if (owner && ADDRESS.test(owner)) contact.owner = owner;
  const leadsPct = parseLeads(body.leads);
  if (leadsPct) contact.leadsPct = leadsPct;

  try {
    const store = loadStore();
    const outcome = upsertContact(store, contact);
    saveStore(store);
    return NextResponse.json({ data: { status: outcome } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not save the reminder." },
      { status: 500 },
    );
  }
}
