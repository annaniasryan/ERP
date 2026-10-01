# OrderFlow ERP prototype

A clickable prototype of all 20 modules in the **OrderFlow ERP Complete Module Specification v2.0**, built with Next.js for Vercel.

It is a working demo, not a production ERP. The business rules from the spec run in the app: credit holds, price lock, one shipment per PO, FEFO and shelf-life-aware reservations, MRP netting with MOQ and order multiples, quarantine and quality release, reject costing, revenue recognized at the control transfer event, balanced journals with idempotent event keys, three-way match, separation of duties and role grant control. Everything uses fictional demo data.

## Deploy on Vercel

1. Put this folder in a GitHub repository (for example with GitHub Desktop: *Add existing repository* → *Publish*).
2. In Vercel, click **Add New → Project**, import the repository and click **Deploy**. No settings are needed; Vercel detects Next.js.
3. The site works right away with **browser-only data**: each visitor gets their own copy, stored in their browser.
4. To share one dataset across users, add a database:
   - In the Vercel project, open **Storage → Create Database → Neon (Postgres)** and connect it to the project. This sets `DATABASE_URL` automatically.
   - Redeploy. The top bar badge changes from "Browser-only data" to "Saved to database". The table is created on first use (see `db/schema.sql`).
5. Recommended for a shared demo: add an environment variable `ERP_DEMO_PASSCODE` with a passcode of your choice, then redeploy. Visitors must enter it before they can see or change the shared data.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000. Copy `.env.example` to `.env.local` and fill in `DATABASE_URL` to use Neon locally.

## Using the demo

Use **Acting as** in the top bar to switch between users and roles. Each role sees only its modules and records, and actions are refused when a role or separation-of-duties rule forbids them. The dashboard lists tasks for the current role and a suggested walkthrough of the order-to-cash flow. **Reset demo data** (click twice) restores the starting data. Super Admin can advance the business date under Administration → Settings to test expiry, overdue invoices and period rollover.

## Structure

| Path | Purpose |
| --- | --- |
| `components/erp/types.ts` | Data model |
| `components/erp/seed.ts` | Demo company data and opening balances |
| `components/erp/logic.ts` | Business rules, permissions, MRP, posting rules, payroll |
| `components/erp/store.tsx` | State, persistence (Neon or browser storage), conflict handling |
| `components/erp/modules/*` | Screens for the 20 modules |
| `app/api/state/route.ts` | Neon persistence API with optimistic concurrency |

## Prototype limits

- All data is one JSON document. That's fine for demos, but a production build needs the relational schema in spec section 24, server-side rule enforcement and real authentication. The role switcher is not a login system.
- Tax invoices, bank payments and DJP submissions are simulated.
- PPh 21 (TER) and BPJS rates are illustrative. The payroll owner must validate them (spec section 28).
- Only IDR is used, so FX revaluation is described but has nothing to revalue.
- `next.config.mjs` skips type and lint errors during the build so a stray warning can't block a deploy. Remove those two lines for production.
