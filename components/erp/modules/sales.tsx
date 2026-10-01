"use client";
import React, { useState } from "react";
import { useErp } from "../store";
import { Page, Card, Table, Badge, Btn, Rule, Tabs, InlineForm, Field } from "../ui";
import { item, cust, idr, fmt, poNet, gross, creditCheck, reservedFor, userName, cbm, listPrice, availableForCustomer } from "../logic";
import type { CustomerPO, ErpState, User, POLine } from "../types";

export function visibleCustomerIds(s: ErpState, u: User) {
  if (u.role === "Distributor") return [u.customerId!];
  if (u.role === "Account Executive") return s.customers.filter(c => c.aeId === u.id).map(c => c.id);
  return s.customers.map(c => c.id);
}
const internal = (u: User) => u.role !== "Distributor";

// ---------------- CRM ----------------
export function CRM() {
  const { s, user, run } = useErp();
  const stages = ["lead", "qualified", "quotation", "negotiation", "won", "lost"] as const;
  const leads = user.role === "Account Executive" ? s.leads.filter(l => l.owner === user.id) : s.leads;
  const dispatchedCtn = (aeId: string) => s.shipments.filter(sh => ["dispatched", "delivered", "completed"].includes(sh.status))
    .map(sh => s.pos.find(p => p.id === sh.poId)!).filter(p => cust(s, p.customerId).aeId === aeId)
    .reduce((a, p) => a + p.lines.reduce((b, l) => b + l.ctn, 0), 0);
  return (
    <Page title="CRM and sales targets" intro="Module 03. AEs see their assigned accounts only. Quotations never reduce warehouse stock; demand starts at PO acceptance.">
      <Card title="Pipeline" sub={user.role === "Account Executive" ? "Your accounts" : "All accounts"} right={<InlineForm fields={[{ name: "name", label: "New lead", width: 200 }, { name: "value", label: "Expected value (Rp)", type: "number", initial: 10000000 }]} submit="Add lead" onSubmit={v => run("addLead", v.name, Number(v.value))} />}>
        <div className="card-body">
          <div className="kanban">
            {stages.map(st => (
              <div className="kcol" key={st}>
                <h3>{st} ({leads.filter(l => l.stage === st).length})</h3>
                {leads.filter(l => l.stage === st).map(l => (
                  <div className="kcard" key={l.id}>
                    <strong>{l.name}</strong>
                    <div className="muted small">{idr(l.value)} · {userName(s, l.owner)}</div>
                    <div className="muted small">Follow up {l.followUp}</div>
                    <select className="input" style={{ marginTop: 6, width: "100%" }} value={l.stage} onChange={e => run("moveLead", l.id, e.target.value as typeof st)}>
                      {stages.map(x => <option key={x} value={x}>{x}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </Card>
      <Card title="Targets vs dispatched CTN" sub="Revenue and shipped CTN targets are tracked separately; zero target shows n/a">
        <Table rows={s.targets.filter(t => user.role !== "Account Executive" || t.aeId === user.id)} cols={[
          { h: "AE", r: t => userName(s, t.aeId) },
          { h: "Period", r: t => t.period },
          { h: "Target CTN", r: t => fmt(t.ctn), num: true },
          { h: "Dispatched CTN", r: t => fmt(dispatchedCtn(t.aeId)), num: true },
          { h: "Achievement", r: t => (t.ctn ? `${((dispatchedCtn(t.aeId) / t.ctn) * 100).toFixed(1)}%` : "n/a"), num: true },
          { h: "Revenue target", r: t => idr(t.revenue), num: true },
        ]} />
      </Card>
    </Page>
  );
}

// ---------------- Orders ----------------
function NewPO() {
  const { s, user, run } = useErp();
  const custIds = visibleCustomerIds(s, user);
  const fg = s.items.filter(i => i.type === "FG" && i.active);
  const [c, setC] = useState(custIds[0]);
  const [ref, setRef] = useState("");
  const [date, setDate] = useState(s.today);
  const [qty, setQty] = useState<Record<string, string>>({});
  const submit = () => {
    const lines: POLine[] = fg.map(i => ({ itemId: i.id, ctn: Number(qty[i.id] || 0) })).filter(l => l.ctn !== 0);
    if (run("createPO", c, ref, date, lines)) { setRef(""); setQty({}); }
  };
  return (
    <Card title="New customer PO" sub="Customer input is product, whole CTN and requested shipping date only" pad>
      <div className="form-row">
        <Field label="Customer">
          <select className="input" value={c} onChange={e => setC(e.target.value)} disabled={user.role === "Distributor"}>
            {custIds.map(id => <option key={id} value={id}>{cust(s, id).name}</option>)}
          </select>
        </Field>
        <Field label="Customer PO reference"><input className="input" value={ref} onChange={e => setRef(e.target.value)} placeholder="e.g. SJ/PO/2610/001" /></Field>
        <Field label="Requested ship date"><input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} /></Field>
        {fg.map(i => (
          <Field key={i.id} label={`${i.sku} (CTN)`}><input className="input" type="number" min={0} step={1} style={{ width: 100 }} value={qty[i.id] ?? ""} onChange={e => setQty({ ...qty, [i.id]: e.target.value })} /></Field>
        ))}
        <Btn kind="primary" onClick={submit}>Submit PO</Btn>
      </div>
    </Card>
  );
}

function PODetail({ po, onClose }: { po: CustomerPO; onClose: () => void }) {
  const { s, user, run } = useErp();
  const c = cust(s, po.customerId);
  const sh = s.shipments.find(x => x.poId === po.id);
  const cc = creditCheck(s, po.id);
  const [rev, setRev] = useState<Record<string, string>>(Object.fromEntries(po.lines.map(l => [l.itemId, String(l.ctn)])));
  const [reason, setReason] = useState("");
  const showInternal = internal(user);
  return (
    <Card title={<>PO {po.id} <Badge v={po.status} /></>} sub={`${c.name} · ref ${po.ref} · requested ${po.requestedDate} · version ${po.version}`} right={<Btn onClick={onClose}>Close</Btn>}>
      <div className="card-body">
        <Table rows={po.lines} cols={[
          { h: "SKU", r: l => item(s, l.itemId).sku },
          { h: "Product", r: l => item(s, l.itemId).name },
          { h: "CTN", r: l => fmt(l.ctn), num: true },
          ...(showInternal ? [
            { h: "Locked price", r: (l: POLine) => (l.price ? idr(l.price) : <span className="muted">list {idr(listPrice(s, l.itemId))}</span>), num: true },
            { h: "Line value", r: (l: POLine) => idr(l.ctn * (l.price ?? listPrice(s, l.itemId))), num: true },
            { h: "Reserved", r: (l: POLine) => fmt(reservedFor(s, po.id, l.itemId)), num: true },
          ] : []),
        ]} />
        {showInternal && (
          <div className="grid cols-3" style={{ marginTop: 14 }}>
            <div><div className="muted small">Net value</div><strong>{idr(poNet(s, po.lines))}</strong> <span className="muted small">(+VAT {idr(gross(s, poNet(s, po.lines)))})</span></div>
            <div><div className="muted small">Credit exposure incl. this PO</div><strong>{idr(cc.exposure)}</strong> of {idr(cc.limit)} {cc.ok ? <Badge v="within limit" tone="ok" /> : <Badge v="over policy" tone="warn" />}</div>
            <div><div className="muted small">Max overdue</div><strong>{cc.overdue} days</strong> <span className="muted small">(hold above {s.settings.overdueHoldDays})</span></div>
          </div>
        )}
        {po.creditNote && showInternal && <Rule>Credit: {po.creditNote}</Rule>}
        {sh && <p className="small">Shipment {sh.id}: <Badge v={sh.status} /> confirmed {sh.confirmed}</p>}
        {po.history.length > 0 && showInternal && (
          <p className="small muted">Previous versions: {po.history.map(h => `v${h.version} (${h.lines.map(l => `${item(s, l.itemId).sku} ${l.ctn}`).join(", ")})`).join("; ")}</p>
        )}
        {user.role !== "Executive Viewer" && (
          <div className="row-actions" style={{ marginTop: 12 }}>
            {["submitted", "under review", "credit hold"].includes(po.status) && <Btn kind="primary" onClick={() => run("acceptPO", po.id)}>Check credit and accept</Btn>}
            {["submitted", "under review", "credit hold"].includes(po.status) && <Btn kind="danger" onClick={() => run("rejectPO", po.id)}>Reject</Btn>}
            {po.status === "accepted" && sh && !["dispatched", "delivered", "completed"].includes(sh.status) && <Btn kind="danger" onClick={() => run("cancelPO", po.id)}>Cancel order (cascade)</Btn>}
          </div>
        )}
        {po.status === "credit hold" && !po.holdReleasedBy && showInternal && (
          <div style={{ marginTop: 12 }}>
            <InlineForm fields={[{ name: "r", label: "Release reason", width: 280 }]} submit="Release credit hold" onSubmit={v => run("releaseHold", po.id, v.r)} />
            <p className="muted small">Sales Manager may release up to {idr(s.settings.salesMgrCreditLimit)} over limit; overdue holds and larger amounts need the Finance Manager. The requester cannot release their own hold.</p>
          </div>
        )}
        {po.status === "accepted" && sh && !["dispatched", "delivered", "completed", "cancelled"].includes(sh.status) && ["Distributor", "Sales Admin"].includes(user.role) && (
          <div style={{ marginTop: 14 }}>
            <strong className="small">Request a revision</strong>
            <div className="form-row" style={{ marginTop: 6 }}>
              {s.items.filter(i => i.type === "FG").map(i => (
                <Field key={i.id} label={`${i.sku} CTN`}><input className="input" type="number" style={{ width: 90 }} value={rev[i.id] ?? ""} onChange={e => setRev({ ...rev, [i.id]: e.target.value })} /></Field>
              ))}
              <Field label="Reason"><input className="input" value={reason} onChange={e => setReason(e.target.value)} style={{ width: 220 }} /></Field>
              <Btn onClick={() => run("submitRevision", po.id, s.items.filter(i => i.type === "FG").map(i => ({ itemId: i.id, ctn: Number(rev[i.id] || 0) })), reason)}>Submit revision</Btn>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

export function Orders() {
  const { s, user, run } = useErp();
  const ids = visibleCustomerIds(s, user);
  const pos = s.pos.filter(p => ids.includes(p.customerId));
  const [open, setOpen] = useState<string | null>(null);
  const openPo = pos.find(p => p.id === open);
  const revs = s.revisions.filter(r => pos.some(p => p.id === r.poId));
  return (
    <Page title={user.role === "Distributor" ? "My purchase orders" : "Customer orders and revisions"} intro="Module 04. One PO equals one shipment. Prices lock on the accepted version; acceptance runs the credit check and may place the PO on credit hold. Acceptance posts no stock or accounting.">
      {["Distributor", "Sales Admin"].includes(user.role) && <NewPO />}
      {openPo && <PODetail key={openPo.id + openPo.version + openPo.status} po={openPo} onClose={() => setOpen(null)} />}
      <Card title="Purchase orders" sub={`${pos.length} orders`}>
        <Table rows={pos} keyOf={p => p.id} cols={[
          { h: "PO", r: p => <a href="#" onClick={e => { e.preventDefault(); setOpen(p.id); }}>{p.id}</a> },
          { h: "Customer", r: p => cust(s, p.customerId).name },
          { h: "Reference", r: p => p.ref },
          { h: "Lines", r: p => p.lines.map(l => `${item(s, l.itemId).sku} × ${l.ctn}`).join(", ") },
          { h: "Requested", r: p => p.requestedDate },
          ...(internal(user) ? [{ h: "Net value", r: (p: CustomerPO) => idr(poNet(s, p.lines)), num: true }] : []),
          { h: "Status", r: p => <Badge v={p.status} /> },
          { h: "", r: p => <Btn small onClick={() => setOpen(p.id)}>Open</Btn> },
        ]} />
      </Card>
      <Card title="Revision queue" sub="AE approves after Sales Admin and PPIC impact review; accepted revisions keep version history and re-reserve atomically">
        <Table rows={revs} empty="No revisions." cols={[
          { h: "Revision", r: r => r.id },
          { h: "PO", r: r => r.poId },
          { h: "Requested lines", r: r => r.lines.filter(l => l.ctn > 0).map(l => `${item(s, l.itemId).sku} × ${l.ctn}`).join(", ") },
          { h: "Reason", r: r => r.reason },
          { h: "PPIC impact", r: r => r.lines.map(l => { const po = s.pos.find(p => p.id === r.poId)!; const old = po.lines.find(x => x.itemId === l.itemId)?.ctn ?? 0; const delta = l.ctn - old; if (!delta) return null; const av = availableForCustomer(s, l.itemId, cust(s, po.customerId).minShelfPct, po.id); return `${item(s, l.itemId).sku} ${delta > 0 ? "+" : ""}${delta} (available ${av})`; }).filter(Boolean).join("; ") || "no change" },
          { h: "Status", r: r => <Badge v={r.status} /> },
          { h: "", r: r => r.status === "submitted" && user.role !== "Distributor" ? <div className="row-actions"><Btn small kind="primary" onClick={() => run("decideRevision", r.id, true)}>Accept</Btn><Btn small onClick={() => run("decideRevision", r.id, false)}>Reject</Btn></div> : null },
        ]} />
      </Card>
    </Page>
  );
}

// ---------------- Shipments ----------------
export function Shipments() {
  const { s, user, run } = useErp();
  const ids = visibleCustomerIds(s, user);
  const rows = s.shipments.filter(sh => ids.includes(s.pos.find(p => p.id === sh.poId)!.customerId));
  const customerSafe = (st: string) => (["confirmed", "ready", "pending confirmation"].includes(st) ? "scheduled" : st);
  return (
    <Page title="Shipment commitments" intro="Module 05. Database uniqueness enforces one shipment per PO. Ready requires hard reserved, released stock meeting the customer shelf life rule for every line. The first confirmed date is kept for on time reporting.">
      <Card title="Shipments">
        <Table rows={rows} keyOf={r => r.id} cols={[
          { h: "Shipment", r: r => r.id },
          { h: "PO", r: r => r.poId },
          { h: "Customer", r: r => cust(s, s.pos.find(p => p.id === r.poId)!.customerId).name },
          { h: "CTN", r: r => fmt(s.pos.find(p => p.id === r.poId)!.lines.reduce((a, l) => a + l.ctn, 0)), num: true },
          { h: "CBM", r: r => s.pos.find(p => p.id === r.poId)!.lines.reduce((a, l) => a + l.ctn * cbm(item(s, l.itemId)), 0).toFixed(3), num: true },
          { h: "First confirmed", r: r => r.firstConfirmed },
          { h: "Current confirmed", r: r => r.confirmed },
          { h: "Status", r: r => <Badge v={user.role === "Distributor" ? customerSafe(r.status) : r.status} /> },
          ...(user.role === "Sales Admin" ? [{ h: "Revise date", r: (r: typeof rows[number]) => ["confirmed", "ready"].includes(r.status) ? <InlineForm fields={[{ name: "d", label: "New date", type: "date", initial: r.confirmed }, { name: "why", label: "Internal reason", width: 150 }]} submit="Revise" kind={undefined} onSubmit={v => run("reviseDate", r.id, v.d, v.why)} /> : null }] : []),
        ]} />
      </Card>
      {internal(user) && (
        <Card title="Date change log" sub="Internal only; customer delay explanations are published by the AE">
          <Table rows={s.shipments.flatMap(sh => sh.dateChanges.map(d => ({ sh: sh.id, ...d })))} empty="No commitment changes." cols={[
            { h: "Shipment", r: r => r.sh }, { h: "From", r: r => r.from }, { h: "To", r: r => r.to }, { h: "Reason", r: r => r.reason }, { h: "By", r: r => userName(s, r.by) },
          ]} />
        </Card>
      )}
    </Page>
  );
}

export { Tabs };
