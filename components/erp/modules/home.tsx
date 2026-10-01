"use client";
import React from "react";
import { useErp } from "../store";
import { Page, Card, Table, Badge, Stat, Btn, download } from "../ui";
import { idr, fmt, pct, cust, item, daysBetween, physicalOnHand, remainingShelfPct, isExpired, can, MODULE_ACCESS, type ModuleKey } from "../logic";
import { visibleCustomerIds } from "./sales";
import type { ErpState, User } from "../types";

type Task = { text: string; module: ModuleKey; count: number };

export function tasksFor(s: ErpState, u: User): Task[] {
  const t: Task[] = [];
  const add = (roles: string[], text: string, module: ModuleKey, count: number) => { if (roles.includes(u.role) && count > 0) t.push({ text, module, count }); };
  add(["Sales Admin"], "Customer POs to review and accept", "orders", s.pos.filter(p => ["submitted", "under review"].includes(p.status)).length);
  add(["Sales Manager", "Finance Manager"], "POs on credit hold awaiting release", "orders", s.pos.filter(p => p.status === "credit hold" && !p.holdReleasedBy).length);
  add(["Sales Admin"], "Released credit holds to accept", "orders", s.pos.filter(p => p.status === "credit hold" && p.holdReleasedBy).length);
  add(["Account Executive"], "Customer revisions to review", "orders", s.revisions.filter(r => r.status === "submitted" && cust(s, s.pos.find(p => p.id === r.poId)!.customerId).aeId === u.id).length);
  add(["PPIC"], "Planned work orders to release", "production", s.workOrders.filter(w => w.status === "planned").length);
  add(["PPIC", "Purchasing Manager"], "Material requests to approve", "purchasing", s.requisitions.filter(r => r.status === "submitted" && r.requestedBy !== u.id).length);
  add(["Purchasing"], "Approved requests to order", "purchasing", s.requisitions.filter(r => r.status === "approved").length);
  add(["Purchasing Manager"], "Supplier POs to approve", "purchasing", s.supplierPOs.filter(p => p.status === "draft").length);
  add(["Warehouse"], "Work orders needing material issue", "production", s.workOrders.filter(w => w.status === "released").length);
  add(["Warehouse"], "Production output to receive", "production", s.workOrders.filter(w => w.status === "output submitted").length);
  add(["Warehouse"], "Supplier deliveries expected", "receiving", s.supplierPOs.filter(p => ["released", "partly received"].includes(p.status)).length);
  add(["Head Production"], "Work orders in production", "production", s.workOrders.filter(w => w.status === "in production").length);
  add(["Quality Officer"], "Lots waiting for inspection", "quality", s.lots.filter(l => l.status === "quarantine" && l.qty > 0).length);
  add(["Shipment Division", "PPIC"], "Confirmed shipments to make ready", "delivery", s.shipments.filter(x => x.status === "confirmed").length);
  add(["Shipment Division"], "Ready shipments to dispatch", "delivery", s.shipments.filter(x => x.status === "ready").length);
  add(["Shipment Division"], "Dispatched shipments awaiting proof of delivery", "delivery", s.shipments.filter(x => x.status === "dispatched").length);
  add(["Finance AR"], "Dispatches to invoice", "ar", s.shipments.filter(x => ["dispatched", "delivered"].includes(x.status) && !s.invoices.some(i => i.shipmentId === x.id)).length);
  add(["Finance AR"], "Draft invoices to post", "ar", s.invoices.filter(i => i.status === "draft").length);
  add(["Finance AP"], "Receipts awaiting supplier bill", "ap", s.receipts.filter(r => !r.billed).length);
  add(["Finance Manager"], "Payments to approve", "ap", s.payments.filter(p => p.status === "proposed").length);
  add(["Finance Manager"], "Bill match exceptions", "ap", s.bills.filter(b => b.status === "match review").length);
  add(["Finance Manager", "HR Payroll Officer"], "Role grants awaiting Security Approver", "admin", s.grants.filter(g => g.status === "requested").length);
  add(["Finance Manager"], "Payroll runs to approve", "hr", s.payrolls.filter(p => p.status === "calculated").length);
  add(["HR Payroll Officer"], "Leave requests to decide", "hr", s.leaves.filter(l => l.status === "submitted").length);
  add(["Warehouse Manager"], "Count adjustments to approve", "inventory", s.counts.filter(c => c.status === "counted" && c.by !== u.id).length);
  add(["Maintenance Officer"], "Open maintenance orders", "maintenance", s.maintOrders.filter(m => !["completed", "verified"].includes(m.status)).length);
  return t;
}

export function Dashboard({ go }: { go: (m: ModuleKey) => void }) {
  const { s, user } = useErp();
  if (user.role === "Distributor") {
    const ids = visibleCustomerIds(s, user);
    const pos = s.pos.filter(p => ids.includes(p.customerId));
    return (
      <Page title={`Welcome, ${cust(s, user.customerId!).name}`} intro="Your orders and shipment status. Internal stock, production and cost details are not shown in the customer portal.">
        <div className="grid cols-3">
          <Stat label="Open orders" value={pos.filter(p => !["rejected", "cancelled"].includes(p.status) && !["dispatched", "delivered", "completed"].includes(s.shipments.find(x => x.poId === p.id)?.status ?? "")).length} />
          <Stat label="Shipments in transit" value={s.shipments.filter(x => pos.some(p => p.id === x.poId) && x.status === "dispatched").length} />
          <Stat label="Delivered" value={s.shipments.filter(x => pos.some(p => p.id === x.poId) && ["delivered", "completed"].includes(x.status)).length} />
        </div>
        <div style={{ height: 16 }} />
        <Btn kind="primary" onClick={() => go("orders")}>Submit or view purchase orders</Btn>
      </Page>
    );
  }
  if (user.role === "Employee") {
    return <Page title="Welcome" intro="Employee self service: attendance, leave and your own payslips."><Btn kind="primary" onClick={() => go("hr")}>Open My HR</Btn></Page>;
  }
  const tasks = tasksFor(s, user);
  const dispatched = s.shipments.filter(x => x.dispatchDate);
  const onTimeFirst = dispatched.length ? dispatched.filter(x => x.dispatchDate! <= (x.firstConfirmed ?? "9999")).length / dispatched.length : null;
  const onTimeCur = dispatched.length ? dispatched.filter(x => x.dispatchDate! <= (x.confirmed ?? "9999")).length / dispatched.length : null;
  const accepted = s.pos.filter(p => ["accepted"].includes(p.status));
  const accCtn = accepted.reduce((a, p) => a + p.lines.reduce((b, l) => b + l.ctn, 0), 0);
  const dispCtn = accepted.filter(p => ["dispatched", "delivered", "completed"].includes(s.shipments.find(x => x.poId === p.id)?.status ?? "")).reduce((a, p) => a + p.lines.reduce((b, l) => b + l.ctn, 0), 0);
  const ar = s.invoices.filter(i => i.status !== "draft").reduce((a, i) => a + i.net + i.vat - i.paid, 0);
  const overdue = s.invoices.filter(i => !["draft", "paid"].includes(i.status) && i.due < s.today).reduce((a, i) => a + i.net + i.vat - i.paid, 0);
  const stockVal = s.items.reduce((a, i) => a + physicalOnHand(s, i.id) * i.avgCost, 0);
  const wos = s.workOrders.filter(w => w.totalOut > 0);
  const rejectRate = wos.length ? wos.reduce((a, w) => a + w.rejects, 0) / wos.reduce((a, w) => a + w.totalOut, 0) : null;
  const nearExpiry = s.lots.filter(l => l.qty > 0 && l.status === "released" && item(s, l.itemId).type === "FG" && (isExpired(s, l) || remainingShelfPct(s, l) < 0.3));
  const showFin = can(user, [...MODULE_ACCESS.ar, ...MODULE_ACCESS.gl]);
  return (
    <Page title="Dashboard" intro={`${user.name} · ${user.role} · business date ${s.today}`}>
      <div className="grid cols-4">
        <Stat label="Open customer POs" value={s.pos.filter(p => ["submitted", "under review", "credit hold"].includes(p.status)).length} hint={`${s.pos.filter(p => p.status === "credit hold").length} on credit hold`} />
        <Stat label="On-time dispatch (first date)" value={pct(onTimeFirst)} hint={`vs current date ${pct(onTimeCur)} · ${dispatched.length} dispatched`} />
        <Stat label="Order fulfilment (accepted cohort)" value={pct(accCtn ? dispCtn / accCtn : null)} hint={`${fmt(dispCtn)} of ${fmt(accCtn)} CTN`} />
        <Stat label="Reject rate" value={pct(rejectRate)} hint="reject CTN ÷ total output CTN" />
        {showFin && <Stat label="Accounts receivable" value={idr(ar)} hint={`${idr(overdue)} overdue`} />}
        {showFin && <Stat label="Inventory value" value={idr(stockVal)} hint="moving average" />}
        <Stat label="Lots in quarantine" value={s.lots.filter(l => l.status === "quarantine" && l.qty > 0).length} />
        <Stat label="FG lots near expiry" value={nearExpiry.length} hint="under 30% shelf life left" />
      </div>
      <div style={{ height: 16 }} />
      <div className="grid cols-2">
        <Card title="My tasks" sub={`Things waiting for a ${user.role}`}>
          <Table rows={tasks} empty="Nothing waiting for this role. Switch role in the top bar to follow the order-to-cash flow." cols={[
            { h: "Task", r: t => t.text }, { h: "Count", r: t => <Badge v={String(t.count)} tone="info" />, num: true },
            { h: "", r: t => <Btn small onClick={() => go(t.module)}>Open</Btn> },
          ]} />
        </Card>
        <Card title="Upcoming shipments" sub="Next 14 days">
          <Table rows={s.shipments.filter(x => ["confirmed", "ready"].includes(x.status) && x.confirmed && daysBetween(s.today, x.confirmed) <= 14)} empty="No shipments due." cols={[
            { h: "Shipment", r: x => x.id }, { h: "Customer", r: x => cust(s, s.pos.find(p => p.id === x.poId)!.customerId).name },
            { h: "Confirmed", r: x => x.confirmed }, { h: "Status", r: x => <Badge v={x.status} /> },
          ]} />
        </Card>
      </div>
      <Card title="Try the demo flow" pad>
        <ol className="small" style={{ margin: 0, paddingLeft: 18 }}>
          <li><strong>Sales Admin (Dewi)</strong>: accept PO-C-1041 and PO-C-1042 in Customer orders. Accepting PO-C-1043 puts it on credit hold (overdue invoice).</li>
          <li><strong>PPIC (Joko)</strong>: open MRP — two 100 CTN orders sharing 150 eligible CTN give 50 CTN net production. Apply, then release the work order.</li>
          <li><strong>Warehouse (Rudi)</strong> issues material, <strong>Head Production (Agus)</strong> records output, Rudi receives it to quarantine, <strong>Quality (Maya)</strong> releases the lot.</li>
          <li><strong>Shipment Division (Eko)</strong>: mark ready (FEFO, shelf-life aware), dispatch, record delivery. <strong>Finance AR (Fitri)</strong>: invoice, tax invoice, receipt.</li>
          <li>Try breaking rules: approve your own request, release your own credit hold, dispatch a held lot, grant yourself Finance Manager as Super Admin.</li>
        </ol>
      </Card>
    </Page>
  );
}

export function Reports() {
  const { s, user } = useErp();
  const meta = (name: string) => `${name} | exported ${new Date().toISOString()} | business date ${s.today} | timezone Asia/Jakarta | currency IDR | by ${user.name} (${user.role})`;
  const ids = visibleCustomerIds(s, user);
  const reports: { name: string; module: ModuleKey; rows: () => Record<string, unknown>[] }[] = [
    { name: "Customer orders", module: "orders", rows: () => s.pos.filter(p => ids.includes(p.customerId)).map(p => ({ po: p.id, customer: cust(s, p.customerId).name, ref: p.ref, status: p.status, ctn: p.lines.reduce((a, l) => a + l.ctn, 0), requested: p.requestedDate })) },
    { name: "Shipments", module: "shipments", rows: () => s.shipments.filter(x => ids.includes(s.pos.find(p => p.id === x.poId)!.customerId)).map(x => ({ shipment: x.id, po: x.poId, status: x.status, first_confirmed: x.firstConfirmed, confirmed: x.confirmed, dispatched: x.dispatchDate ?? "" })) },
    { name: "Stock by lot", module: "inventory", rows: () => s.lots.filter(l => l.qty > 0).map(l => ({ lot: l.lotNo, sku: item(s, l.itemId).sku, qty: l.qty, unit: item(s, l.itemId).unit, status: l.status, expiry: l.expiry })) },
    { name: "AR invoices", module: "ar", rows: () => s.invoices.map(i => ({ invoice: i.id, customer: cust(s, i.customerId).name, date: i.date, due: i.due, net: i.net, vat: i.vat, outstanding: i.net + i.vat - i.paid, status: i.status })) },
    { name: "Journals", module: "gl", rows: () => s.journals.flatMap(j => j.lines.map(l => ({ journal: j.id, date: j.date, period: j.period, source: j.source, account: l.account, debit: l.dr, credit: l.cr, key: j.key }))) },
    { name: "Payroll register", module: "hr", rows: () => s.payrolls.flatMap(p => p.results.map(r => ({ period: p.period, employee: r.employeeId, gross: r.gross, pph21: r.pph21, bpjs_employee: r.bpjsEmployee, net: r.net, status: p.status }))) },
  ];
  const allowed = reports.filter(r => can(user, MODULE_ACCESS[r.module]) && !(r.module === "hr" && user.role !== "HR Payroll Officer" && user.role !== "Finance Manager"));
  return (
    <Page title="Dashboards and reports" intro="Module 20. Exports use the same permissions as the screens and carry filters, unit, currency, timezone and run timestamp. Payroll exports are restricted.">
      <Card title="Export center">
        <Table rows={allowed} empty="No exports available for this role." cols={[
          { h: "Report", r: r => r.name }, { h: "Rows", r: r => r.rows().length, num: true },
          { h: "", r: r => <Btn small onClick={() => download(`${r.name.toLowerCase().replace(/ /g, "-")}.csv`, r.rows(), meta(r.name))}>Download CSV</Btn> },
        ]} />
        <p className="muted small" style={{ padding: "0 16px 12px" }}>{reports.length - allowed.length} report(s) hidden for your role.</p>
      </Card>
    </Page>
  );
}
