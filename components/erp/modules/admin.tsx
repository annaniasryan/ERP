"use client";
import React from "react";
import { useErp } from "../store";
import { Page, Card, Table, Badge, Btn, Rule, Tabs, InlineForm } from "../ui";
import { idr, fmt, userName, activePriceList, item, cbm, MODULE_ACCESS } from "../logic";
import type { Role } from "../types";

const ROLES: Role[] = ["Super Admin", "Executive Viewer", "Sales Admin", "Account Executive", "Sales Manager", "PPIC", "Head Production", "Warehouse", "Warehouse Manager", "Purchasing", "Purchasing Manager", "Quality Officer", "Shipment Division", "Finance AR", "Finance AP", "Finance Accountant", "Finance Manager", "HR Payroll Officer", "Maintenance Officer", "Employee", "Distributor"];

export function Admin() {
  const { s, user, run } = useErp();
  const ro = user.role === "Executive Viewer" && false;
  return (
    <Page title="Administration and access" intro="Module 01. Role and record scope are enforced on every action. Sensitive roles (Super Admin, Finance, HR/Payroll) need a Security Approver; self grants never activate. Audit records actor, time, record and detail and cannot be edited.">
      <Tabs tabs={["Users and grants", "Decision register", "Audit log", "Access matrix", "Settings"]}>
        {t => t === "Users and grants" ? (
          <>
            <Card title="Request a role grant" sub="Super Admin requests; Finance Manager or HR approves sensitive grants" pad>
              <InlineForm fields={[
                { name: "u", label: "User", options: s.users.map(x => ({ v: x.id, l: x.name })), initial: s.users[0].id, width: 200 },
                { name: "r", label: "Role", options: ROLES.map(r => ({ v: r, l: r })), initial: "Finance Manager", width: 200 },
              ]} submit="Request grant" onSubmit={v => run("requestGrant", v.u, v.r as Role)} />
            </Card>
            <Card title="Role grant requests">
              <Table rows={s.grants} empty="No grant requests yet. Try granting Finance Manager to Ryan (Super Admin) — it stays requested." cols={[
                { h: "Request", r: g => g.id }, { h: "User", r: g => userName(s, g.userId) }, { h: "Role", r: g => g.role },
                { h: "Requested by", r: g => userName(s, g.requestedBy) }, { h: "Approved by", r: g => userName(s, g.approvedBy) || "—" }, { h: "Status", r: g => <Badge v={g.status} /> },
                { h: "", r: g => (g.status === "requested" && !ro ? <div className="row-actions"><Btn small kind="primary" onClick={() => run("decideGrant", g.id, true)}>Approve</Btn><Btn small onClick={() => run("decideGrant", g.id, false)}>Reject</Btn></div> : null) },
              ]} />
            </Card>
            <Card title="Users">
              <Table rows={s.users} cols={[{ h: "ID", r: x => x.id }, { h: "Name", r: x => x.name }, { h: "Role", r: x => x.role }, { h: "Scope", r: x => (x.customerId ? `Customer ${s.customers.find(c => c.id === x.customerId)?.name}` : x.employeeId ? `Employee ${x.employeeId}` : "Internal") }]} />
            </Card>
          </>
        ) : t === "Decision register" ? (
          <Card title="Decision register (spec section 30)" sub="Build defaults apply until the owner confirms or changes them">
            <Table rows={s.decisions} cols={[
              { h: "ID", r: d => d.id }, { h: "Decision", r: d => d.decision }, { h: "Default", r: d => <span className="small">{d.def}</span> }, { h: "Owner", r: d => d.owner }, { h: "By", r: d => d.phase },
              { h: "Status", r: d => <>{<Badge v={d.status} />}{d.note && <div className="small muted">{d.note}</div>}</> },
              { h: "", r: d => (d.status === "default" ? <InlineForm fields={[{ name: "n", label: "Note", width: 140 }]} submit="Confirm" kind={undefined} onSubmit={v => run("setDecision", d.id, "confirmed", v.n)} /> : null) },
            ]} />
          </Card>
        ) : t === "Audit log" ? (
          <Card title="Audit log" sub="Newest first">
            <Table rows={s.audit.slice(0, 200)} empty="No activity yet. Actions you take appear here." cols={[
              { h: "Time", r: a => new Date(a.ts).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }) }, { h: "Actor", r: a => a.actor }, { h: "Action", r: a => a.action },
              { h: "Record", r: a => a.record }, { h: "Detail", r: a => <span className="small">{a.detail}</span> },
            ]} />
          </Card>
        ) : t === "Access matrix" ? (
          <Card title="Module access by role">
            <Table rows={Object.entries(MODULE_ACCESS)} cols={[{ h: "Module", r: r => r[0] }, { h: "Roles with access", r: r => <span className="small">{r[1].join(", ")}</span> }]} />
          </Card>
        ) : (
          <Card title="Demo settings" pad>
            <p>Business date: <strong>{s.today}</strong> (timestamps stored in UTC, displayed in Asia/Jakarta).</p>
            <InlineForm fields={[{ name: "d", label: "Advance business date to", type: "date", initial: s.today }]} submit="Set date" onSubmit={v => run("setToday", v.d)} />
            <Rule>Advancing the date lets you test expiry, overdue invoices, shelf life and period rollover. Only Super Admin can change it.</Rule>
            <Table rows={Object.entries(s.settings)} cols={[{ h: "Setting", r: r => r[0] }, { h: "Value", r: r => (r[0].includes("Limit") ? idr(r[1]) : String(r[1])) }]} />
          </Card>
        )}
      </Tabs>
    </Page>
  );
}

export function Master() {
  const { s, run } = useErp();
  const pl = activePriceList(s);
  return (
    <Page title="Shared master data" intro="Module 02. Codes are unique and referenced records are never deleted. Released documents snapshot prices, addresses and carton data so later master edits do not rewrite history. Price list and credit changes need approval by someone other than the editor.">
      <Tabs tabs={["Items", "Customers", "Suppliers", "Price lists"]}>
        {t => t === "Items" ? (
          <Card title="Items" sub="PPIC owns item definitions and planning parameters">
            <Table rows={s.items} keyOf={i => i.id} cols={[
              { h: "SKU", r: i => i.sku }, { h: "Name", r: i => i.name }, { h: "Type", r: i => i.type }, { h: "Unit", r: i => i.unit },
              { h: "Carton (cm)", r: i => (i.dims ? `${i.dims.l}×${i.dims.w}×${i.dims.h}` : "—") }, { h: "CBM/CTN", r: i => (i.dims ? cbm(i).toFixed(3) : "—"), num: true },
              { h: "Shelf life", r: i => `${i.shelfLifeDays} d`, num: true }, { h: "Safety", r: i => fmt(i.safetyStock), num: true },
              { h: "MOQ / mult.", r: i => `${fmt(i.moq)} / ${fmt(i.multiple)}`, num: true }, { h: "Lead", r: i => `${i.leadTimeDays} d`, num: true },
              { h: "Edit safety stock", r: i => (i.type === "RM" ? <InlineForm fields={[{ name: "ss", label: "", type: "number", initial: i.safetyStock, width: 80 }]} submit="Save" kind={undefined} onSubmit={v => run("updateItem", i.id, { safetyStock: Number(v.ss) })} /> : null) },
            ]} />
          </Card>
        ) : t === "Customers" ? (
          <Card title="Customers" sub="Credit limit and shelf life changes are audited">
            <Table rows={s.customers} keyOf={c => c.id} cols={[
              { h: "Code", r: c => c.code }, { h: "Name", r: c => c.name }, { h: "AE", r: c => userName(s, c.aeId) }, { h: "NPWP", r: c => <span className="mono">{c.npwp}</span> },
              { h: "Terms", r: c => `${c.termsDays} d` }, { h: "Control at", r: c => c.deliveryTerms }, { h: "Min shelf", r: c => `${c.minShelfPct}%`, num: true },
              { h: "Credit limit", r: c => idr(c.creditLimit), num: true },
              { h: "Change limit", r: c => <InlineForm fields={[{ name: "l", label: "", type: "number", initial: c.creditLimit, width: 120 }]} submit="Save" kind={undefined} onSubmit={v => run("updateCustomer", c.id, { creditLimit: Number(v.l) })} /> },
            ]} />
          </Card>
        ) : t === "Suppliers" ? (
          <Card title="Suppliers">
            <Table rows={s.suppliers} cols={[{ h: "Supplier", r: x => x.name }, { h: "Currency", r: x => x.currency }, { h: "Terms", r: x => `${x.termsDays} d` }, { h: "Bank", r: x => <Badge v={x.bankVerified ? "verified" : "unverified"} tone={x.bankVerified ? "ok" : "warn"} /> }]} />
          </Card>
        ) : (
          <>
            <Card title="Draft a new price list" sub={`Based on active ${pl?.id}. Accepted POs keep their locked prices.`} pad>
              <InlineForm fields={[{ name: "e", label: "Effective date", type: "date", initial: s.today }, { name: "p", label: "Change %", type: "number", initial: 5, width: 80 }]} submit="Draft" onSubmit={v => run("draftPriceList", v.e, Number(v.p))} />
            </Card>
            <Card title="Price list versions">
              <Table rows={s.priceLists} keyOf={p => p.id} cols={[
                { h: "Version", r: p => p.id }, { h: "Effective", r: p => p.effective },
                { h: "Prices (per CTN)", r: p => p.lines.map(l => `${item(s, l.itemId).sku} ${idr(l.price)}`).join(" · ") },
                { h: "Approved by", r: p => userName(s, p.approvedBy) || "—" }, { h: "Status", r: p => <Badge v={p.status} /> },
                { h: "", r: p => (p.status === "draft" ? <Btn small kind="primary" onClick={() => run("approvePriceList", p.id)}>Approve</Btn> : null) },
              ]} />
            </Card>
          </>
        )}
      </Tabs>
    </Page>
  );
}
