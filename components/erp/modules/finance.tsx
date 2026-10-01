"use client";
import React, { useState } from "react";
import { useErp } from "../store";
import { Page, Card, Table, Badge, Btn, Rule, Tabs, InlineForm, Stat } from "../ui";
import { item, cust, idr, fmt, daysBetween, trialBalance, closeChecklist, userName, physicalOnHand, openAR } from "../logic";
import type { Invoice } from "../types";

const agingBucket = (days: number) => (days <= 0 ? "Current" : days <= 30 ? "1–30" : days <= 60 ? "31–60" : days <= 90 ? "61–90" : "90+");

export function AR() {
  const { s, user, run } = useErp();
  const ro = user.role === "Executive Viewer";
  const billable = s.shipments.filter(sh => ["dispatched", "delivered"].includes(sh.status) && !s.invoices.some(i => i.shipmentId === sh.id));
  const outstanding = (i: Invoice) => i.net + i.vat - i.paid;
  const open = s.invoices.filter(i => i.status !== "draft" && i.status !== "paid");
  const buckets = ["Current", "1–30", "31–60", "61–90", "90+"];
  return (
    <Page title="Customer billing and receivables" intro="Module 14. Invoices come from actual dispatch at the prices locked on the accepted PO. A dispatch can be invoiced once. Receipts reduce the balance without changing revenue; overpayment stays as unapplied credit. Tax invoices are simulated here (DJP e-invoicing in production).">
      <Card title="Ready to invoice" sub="Dispatches where control has transferred">
        <Table rows={billable} empty="Nothing waiting to invoice." cols={[
          { h: "Shipment", r: r => r.id }, { h: "PO", r: r => r.poId }, { h: "Customer", r: r => cust(s, s.pos.find(p => p.id === r.poId)!.customerId).name },
          { h: "Dispatched", r: r => r.dispatchDate }, { h: "Status", r: r => <Badge v={r.status} /> },
          { h: "", r: r => ro ? null : <Btn small kind="primary" onClick={() => run("createInvoice", r.id)}>Draft invoice</Btn> },
        ]} />
      </Card>
      <Card title="Invoices">
        <Table rows={s.invoices} keyOf={i => i.id} cols={[
          { h: "Invoice", r: i => i.id }, { h: "Customer", r: i => cust(s, i.customerId).name }, { h: "Date", r: i => i.date }, { h: "Due", r: i => i.due },
          { h: "Net", r: i => idr(i.net), num: true }, { h: "VAT", r: i => idr(i.vat), num: true }, { h: "Outstanding", r: i => idr(outstanding(i)), num: true },
          { h: "Tax invoice", r: i => <>{<Badge v={i.taxInvoice} />} <span className="mono">{i.taxNo}</span></> },
          { h: "Status", r: i => <Badge v={i.status} /> },
          { h: "", r: i => ro ? null : <div className="row-actions">
            {i.status === "draft" && <Btn small kind="primary" onClick={() => run("postInvoice", i.id)}>Post</Btn>}
            {i.status !== "draft" && i.taxInvoice !== "approved" && <Btn small onClick={() => run("submitTaxInvoice", i.id)}>Submit tax invoice</Btn>}
            {["posted", "partly paid"].includes(i.status) && <InlineForm fields={[{ name: "a", label: "Receipt", type: "number", initial: outstanding(i), width: 120 }]} submit="Allocate" onSubmit={v => run("receivePayment", i.id, Number(v.a))} />}
          </div> },
        ]} />
      </Card>
      <div className="grid cols-2">
        <Card title="AR aging" sub={`As of ${s.today}`}>
          <Table rows={s.customers} cols={[
            { h: "Customer", r: c => c.name },
            ...buckets.map(b => ({ h: b, r: (c: typeof s.customers[number]) => fmt(open.filter(i => i.customerId === c.id && agingBucket(daysBetween(i.due, s.today)) === b).reduce((a, i) => a + outstanding(i), 0)), num: true })),
          ]} />
        </Card>
        <Card title="Credit exposure">
          <Table rows={s.customers} cols={[
            { h: "Customer", r: c => c.name }, { h: "Limit", r: c => idr(c.creditLimit), num: true }, { h: "Open AR", r: c => idr(openAR(s, c.id)), num: true },
            { h: "Headroom", r: c => idr(c.creditLimit - openAR(s, c.id)), num: true },
          ]} />
        </Card>
      </div>
    </Page>
  );
}

export function AP() {
  const { s, user, run } = useErp();
  const ro = user.role === "Executive Viewer";
  const unbilled = s.receipts.filter(r => !r.billed);
  return (
    <Page title="Payables and treasury" intro={`Module 15. Duplicate supplier invoices are blocked (supplier + reference). Three-way match tolerance ${s.settings.matchTolerancePct}%. Payment maker and approver must differ; unverified bank details block payment; a failed payment leaves bills unpaid.`}>
      <Card title="Receipts awaiting supplier bill">
        <Table rows={unbilled} empty="No unbilled receipts. Post a goods receipt first." cols={[
          { h: "Receipt", r: r => r.id }, { h: "Supplier", r: r => s.suppliers.find(x => x.id === s.supplierPOs.find(p => p.id === r.supplierPoId)!.supplierId)!.name },
          { h: "Material", r: r => item(s, r.itemId).sku }, { h: "Receipt value", r: r => idr((r.qty - r.rejected) * r.unitCost), num: true },
          { h: "Capture bill", r: r => ro ? null : <InlineForm fields={[{ name: "ref", label: "Supplier invoice no.", width: 130 }, { name: "a", label: "Amount (excl. VAT)", type: "number", initial: (r.qty - r.rejected) * r.unitCost, width: 120 }]} submit="Capture" onSubmit={v => run("createBill", r.id, v.ref, Number(v.a))} /> },
        ]} />
      </Card>
      <Card title="Supplier bills">
        <Table rows={s.bills} empty="No bills yet." cols={[
          { h: "Bill", r: b => b.id }, { h: "Supplier", r: b => s.suppliers.find(x => x.id === b.supplierId)!.name }, { h: "Ref", r: b => b.ref },
          { h: "Amount", r: b => idr(b.amount), num: true }, { h: "VAT", r: b => idr(b.vat), num: true }, { h: "Match", r: b => <span className="small">{b.match}</span> },
          { h: "Due", r: b => b.due }, { h: "Status", r: b => <Badge v={b.status} /> },
          { h: "", r: b => ro ? null : <div className="row-actions">
            {b.status === "match review" && <Btn small onClick={() => run("approveBillException", b.id)}>Approve exception</Btn>}
            {b.status === "approved" && <Btn small kind="primary" onClick={() => run("postBill", b.id)}>Post</Btn>}
            {b.status === "posted" && <Btn small onClick={() => run("proposePayment", b.id)}>Propose payment</Btn>}
          </div> },
        ]} />
      </Card>
      <Card title="Payments">
        <Table rows={s.payments} empty="No payments proposed." cols={[
          { h: "Payment", r: p => p.id }, { h: "Bills", r: p => p.billIds.join(", ") }, { h: "Amount", r: p => idr(p.amount), num: true },
          { h: "Maker", r: p => userName(s, p.maker) }, { h: "Approver", r: p => userName(s, p.approver) || "—" }, { h: "Status", r: p => <Badge v={p.status} /> },
          { h: "", r: p => ro ? null : <div className="row-actions">
            {p.status === "proposed" && <Btn small kind="primary" onClick={() => run("approvePayment", p.id)}>Approve</Btn>}
            {p.status === "approved" && <><Btn small kind="primary" onClick={() => run("releasePayment", p.id, false)}>Release (bank confirms)</Btn><Btn small kind="danger" onClick={() => run("releasePayment", p.id, true)}>Simulate bank failure</Btn></>}
          </div> },
        ]} />
      </Card>
      <Card title="Supplier bank verification">
        <Table rows={s.suppliers} cols={[{ h: "Supplier", r: x => x.name }, { h: "Terms", r: x => `${x.termsDays} days` }, { h: "Bank details", r: x => <Badge v={x.bankVerified ? "verified" : "unverified"} tone={x.bankVerified ? "ok" : "warn"} /> }]} />
      </Card>
    </Page>
  );
}

export function GL() {
  const { s, user, run } = useErp();
  const ro = user.role === "Executive Viewer";
  const [period, setPeriod] = useState(s.periods.find(p => p.status === "open")?.id ?? s.periods[0].id);
  const tb = trialBalance(s);
  const totalDr = tb.reduce((a, [, v]) => a + Math.max(0, v), 0);
  const totalCr = tb.reduce((a, [, v]) => a + Math.max(0, -v), 0);
  const pl = tb.filter(([a]) => a[0] >= "4");
  const profit = -pl.reduce((a, [, v]) => a + v, 0);
  const checks = closeChecklist(s, period);
  return (
    <Page title="Accounting and period close" intro="Module 16. Every journal balances; auto journals use unique source event keys so retries post once. Closed periods reject postings — late operational documents post to the first open period and are flagged. Revenue and COGS are recognised together at the control transfer event.">
      <div className="grid cols-4">
        <Stat label="Total debits" value={idr(totalDr)} />
        <Stat label="Total credits" value={idr(totalCr)} hint={totalDr === totalCr ? "Balanced" : "Out of balance"} />
        <Stat label="Profit to date (since cutover)" value={idr(profit)} />
        <Stat label="Journals" value={fmt(s.journals.length)} />
      </div>
      <div style={{ height: 16 }} />
      <Tabs tabs={["Trial balance", "Journals", "Period close"]}>
        {t => t === "Trial balance" ? (
          <Card>
            <Table rows={tb} cols={[{ h: "Account", r: r => r[0] }, { h: "Debit", r: r => (r[1] > 0 ? fmt(r[1]) : ""), num: true }, { h: "Credit", r: r => (r[1] < 0 ? fmt(-r[1]) : ""), num: true }]} />
          </Card>
        ) : t === "Journals" ? (
          <Card>
            <Table rows={s.journals.slice(0, 150)} keyOf={j => j.id} cols={[
              { h: "Journal", r: j => j.id }, { h: "Date", r: j => j.date }, { h: "Period", r: j => j.period }, { h: "Source", r: j => j.source }, { h: "Memo", r: j => j.memo },
              { h: "Lines", r: j => <div className="small">{j.lines.map((l, i) => <div key={i}>{l.account}: {l.dr ? `Dr ${fmt(l.dr)}` : `Cr ${fmt(l.cr)}`}</div>)}</div> },
              { h: "Event key", r: j => <span className="mono">{j.key}</span> },
            ]} />
          </Card>
        ) : (
          <Card title="Close checklist" right={<select className="input" value={period} onChange={e => setPeriod(e.target.value)}>{s.periods.map(p => <option key={p.id} value={p.id}>{p.id} ({p.status})</option>)}</select>} pad>
            {checks.map(c => <div className="check" key={c.label}><Badge v={c.ok ? "ok" : "blocked"} tone={c.ok ? "ok" : "err"} /> <div><strong>{c.label}</strong> <span className="muted small">{c.detail}</span></div></div>)}
            {!ro && <div className="row-actions" style={{ marginTop: 12 }}>
              {s.periods.find(p => p.id === period)!.status !== "closed" ? <Btn kind="primary" onClick={() => run("closePeriod", period)}>Close {period}</Btn> : <Btn onClick={() => run("reopenPeriod", period)}>Reopen {period} (approval)</Btn>}
            </div>}
            <Rule>Multi-currency: this demo company trades only in IDR, so FX revaluation has nothing to revalue. The spec rules (daily rates, month-end revaluation with auto-reversal, realized gains on settlement) apply once a foreign-currency supplier or customer is added.</Rule>
          </Card>
        )}
      </Tabs>
    </Page>
  );
}

export function Costing() {
  const { s } = useErp();
  const closed = s.workOrders.filter(w => w.totalOut > 0);
  return (
    <Page title="Costing and budgets" intro="Module 17. Moving weighted average by item, applied to every movement from Phase 2. Normal rejects (within BOM standard) stay in good output cost; abnormal rejects are expensed as production loss. FEFO picking is separate from valuation.">
      <Card title="Inventory valuation">
        <Table rows={s.items} cols={[
          { h: "SKU", r: i => i.sku }, { h: "Item", r: i => i.name }, { h: "On hand", r: i => `${fmt(physicalOnHand(s, i.id))} ${i.unit}`, num: true },
          { h: "Avg cost", r: i => idr(i.avgCost), num: true }, { h: "Value", r: i => idr(physicalOnHand(s, i.id) * i.avgCost), num: true },
        ]} />
      </Card>
      <Card title="Work order cost and reject variance">
        <Table rows={closed} empty="No production output recorded yet. Complete a work order in Production." cols={[
          { h: "WO", r: w => w.id }, { h: "Product", r: w => item(s, w.itemId).sku }, { h: "Material cost", r: w => idr(w.materialCost), num: true },
          { h: "Total / rejects", r: w => `${w.totalOut} / ${w.rejects}` },
          { h: "Std reject", r: w => `${s.boms.find(b => b.id === w.bomId)!.rejectStdPct}%`, num: true },
          { h: "Actual reject", r: w => `${((w.rejects / w.totalOut) * 100).toFixed(1)}%`, num: true },
          { h: "Abnormal loss expensed", r: w => idr(w.abnormalLoss), num: true },
          { h: "Cost per good CTN", r: w => idr((w.materialCost - w.abnormalLoss) / Math.max(1, w.totalOut - w.rejects)), num: true },
        ]} />
      </Card>
      <Card title="Shipment margin" sub="Uses posted COGS and net invoice revenue">
        <Table rows={s.shipments.filter(sh => s.journals.some(j => j.key === `rev-${sh.id}`))} empty="No recognised shipments yet." cols={[
          { h: "Shipment", r: sh => sh.id },
          { h: "Revenue", r: sh => idr(s.journals.find(j => j.key === `rev-${sh.id}`)!.lines.find(l => l.account === "4000 Revenue")!.cr), num: true },
          { h: "COGS", r: sh => idr(s.journals.find(j => j.key === `rev-${sh.id}`)!.lines.find(l => l.account === "5000 Cost of goods sold")!.dr), num: true },
          { h: "Gross margin", r: sh => { const j = s.journals.find(x => x.key === `rev-${sh.id}`)!; const r = j.lines.find(l => l.account === "4000 Revenue")!.cr; const c = j.lines.find(l => l.account === "5000 Cost of goods sold")!.dr; return `${idr(r - c)} (${((1 - c / r) * 100).toFixed(1)}%)`; }, num: true },
        ]} />
      </Card>
    </Page>
  );
}
