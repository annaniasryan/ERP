import { neon } from "@neondatabase/serverless";

// Shared demo state stored as one JSON document with optimistic concurrency (rev).
// Without DATABASE_URL this route returns 404 and the app falls back to browser storage.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DB_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL || "";
const PASSCODE = process.env.ERP_DEMO_PASSCODE || "";

function authorized(req: Request) {
  return !PASSCODE || req.headers.get("x-erp-passcode") === PASSCODE;
}

async function db() {
  const sql = neon(DB_URL);
  await sql`create table if not exists erp_demo_state (id int primary key, rev int not null default 0, data jsonb not null, updated_at timestamptz not null default now())`;
  return sql;
}

export async function GET(req: Request) {
  if (!DB_URL) return Response.json({ error: "No database configured" }, { status: 404 });
  if (!authorized(req)) return Response.json({ error: "Passcode required" }, { status: 401 });
  try {
    const sql = await db();
    const rows = await sql`select rev, data from erp_demo_state where id = 1`;
    if (!rows.length) return Response.json({ rev: 0, data: null });
    return Response.json({ rev: rows[0].rev, data: rows[0].data });
  } catch (e) {
    return Response.json({ error: `Database error: ${(e as Error).message}` }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  if (!DB_URL) return Response.json({ error: "No database configured" }, { status: 404 });
  if (!authorized(req)) return Response.json({ error: "Passcode required" }, { status: 401 });
  let body: { rev?: number; data?: unknown };
  try { body = await req.json(); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!body || typeof body.rev !== "number" || !body.data || typeof body.data !== "object") {
    return Response.json({ error: "Expected { rev, data }" }, { status: 400 });
  }
  const json = JSON.stringify(body.data);
  if (json.length > 4_000_000) return Response.json({ error: "State too large; reset demo data" }, { status: 413 });
  try {
    const sql = await db();
    if (body.rev === 0) {
      const ins = await sql`insert into erp_demo_state (id, rev, data) values (1, 1, ${json}::jsonb) on conflict (id) do nothing returning rev`;
      if (ins.length) return Response.json({ rev: ins[0].rev });
    } else {
      const upd = await sql`update erp_demo_state set data = ${json}::jsonb, rev = rev + 1, updated_at = now() where id = 1 and rev = ${body.rev} returning rev`;
      if (upd.length) return Response.json({ rev: upd[0].rev });
    }
    const cur = await sql`select rev, data from erp_demo_state where id = 1`;
    return Response.json({ error: "Conflict", rev: cur[0]?.rev ?? 0, data: cur[0]?.data ?? null }, { status: 409 });
  } catch (e) {
    return Response.json({ error: `Database error: ${(e as Error).message}` }, { status: 500 });
  }
}
