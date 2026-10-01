"use client";
import React, { useState } from "react";
import { useErp } from "../store";
import { Page, Card, Table, Badge, Btn, Rule, Tabs, InlineForm, Field } from "../ui";
import {
  item, cust, idr, fmt, releasedOnHand, physicalOnHand, reservedQty, atp, remainingShelfPct, isExpired, computeMrp,
  materialFor, userName, cbm, capacityHours,
} from "../logic";
import type { Lot, WorkOrder, Shipment } from "../types";

// ---------------- Inventory ----------------
export function Inventory() {
  const { s, user, run } = useErp();
  const lotStatus = (l: Lot) => (isExpired(s, l) ? "expired" : l.status);
  return (
    <Page title="Inventory and warehouse" intro="Module 06. Stock is derived from movements. Available to promise = released on hand − active reservations; quarantined, expired and rejected stock is excluded. FEFO picking. Cycle counts snapshot and reconcile; adjustments need Warehouse Manager approval."
      actions={user.role !== "Executive Viewer" ? <Btn onClick={() => run("shelfLifeJob")}>Run daily shelf life check</Btn> : undefined}>
      <Tabs tabs={["Balances", "Lots", "Movements", "Cycle counts"]}>
        {t => t === "Balances" ? (
          <Card>
            <Table rows={s.items} keyOf={i => i.id} cols={[
              { h: "SKU", r: i => i.sku }, { h: "Item", r: i => i.name }, { h: "Type", r: i => i.type }, { h: "Unit", r: i => i.unit },
              { h: "Physical", r: i => fmt(physicalOnHand(s, i.id)), num: true },
              { h: "Released", r: i => fmt(releasedOnHand(s, i.id)), num: true },
              { h: "Reserved", r: i => fmt(reservedQty(s, i.id)), num: true },
              { h: "ATP", r: i => <strong>{fmt(atp(s, i.id))}</strong>, num: true },
              { h: "Avg cost", r: i => idr(i.avgCost), num: true },
              { h: "Value", r: i => idr(physicalOnHand(s, i.id) * i.avgCost), num: true },
            ]} />
          </Card>
        ) : t === "Lots" ? (
          <Card>
            <Table rows={s.lots.filter(l => l.qty > 0)} keyOf={l => l.id} cols={[
              { h: "Lot", r: l => l.lotNo }, { h: "Item", r: l => item(s, l.itemId).sku }, { h: "Location", r: l => l.location },
              { h: "Qty", r: l => fmt(l.qty), num: true }, { h: "Expiry", r: l => l.expiry },
              { h: "Shelf life left", r: l => `${Math.round(remainingShelfPct(s, l) * 100)}%`, num: true },
              { h: "Hard reserved", r: l => fmt(s.reservations.filter(r => r.lotId === l.id).reduce((a, r) => a + r.qty, 0)), num: true },
              { h: "Status", r: l => <Badge v={lotStatus(l)} /> },
              { h: "Source", r: l => l.source },
            ]} />
          </Card>
        ) : t === "Movements" ? (
          <Card sub="Posted movements cannot be edited; corrections use linked reversals">
            <Table rows={s.movements.slice(0, 200)} keyOf={m => m.id} cols={[
              { h: "Date", r: m => m.date }, { h: "Type", r: m => m.type }, { h: "Item", r: m => item(s, m.itemId).sku },
              { h: "Lot", r: m => s.lots.find(l => l.id === m.lotId)?.lotNo ?? "" }, { h: "Qty", r: m => fmt(m.qty), num: true },
              { h: "Value", r: m => idr(m.value), num: true }, { h: "Source", r: m => m.ref }, { h: "Event key", r: m => <span className="mono">{m.key}</span> },
            ]} />
          </Card>
        ) : (
          <>
            <Card title="Enter cycle count" sub="Warehouse staff count; book quantity is snapshotted at entry" pad>
              <CountForm />
            </Card>
            <Card title="Counts">
              <Table rows={s.counts} empty="No counts yet." cols={[
                { h: "Count", r: c => c.id }, { h: "Lot", r: c => s.lots.find(l => l.id === c.lotId)!.lotNo },
                { h: "Book", r: c => fmt(c.book), num: true }, { h: "Counted", r: c => fmt(c.counted), num: true },
                { h: "Variance", r: c => fmt(c.counted - c.book), num: true }, { h: "Counted by", r: c => userName(s, c.by) },
                { h: "Status", r: c => <Badge v={c.status} /> },
                { h: "", r: c => c.status === "counted" ? <div className="row-actions"><Btn small kind="primary" onClick={() => run("approveCount", c.id, true)}>Approve</Btn><Btn small onClick={() => run("approveCount", c.id, false)}>Reject</Btn></div> : null },
              ]} />
            </Card>
          </>
        )}
      </Tabs>
    </Page>
  );
}
function CountForm() {
  const { s, run } = useErp();
  const lots = s.lots.filter(l => l.qty > 0 && l.status !== "rejected");
  return <InlineForm fields={[{ name: "lot", label: "Lot", options: lots.map(l => ({ v: l.id, l: `${l.lotNo} (${item(s, l.itemId).sku})` })), initial: lots[0]?.id, width: 260 }, { name: "q", label: "Counted qty", type: "number" }]} submit="Record count" onSubmit={v => run("countLot", v.lot, Number(v.q))} />;
}

// ---------------- BOM ----------------
export function BOM() {
  const { s } = useErp();
  const [ctn, setCtn] = useState(100);
  const [bomId, setBomId] = useState(s.boms[0].id);
  const req = materialFor(s, bomId, ctn);
  return (
    <Page title="BOM and production standards" intro="Module 07. MRP uses the approved effective version. Required material = planned CTN ÷ base CTN × component quantity × (1 + loss factor). The loss factor is held separately and not built into recipe quantities. Work orders keep their BOM version.">
      <div className="grid cols-2">
        <Card title="BOM versions">
          <Table rows={s.boms} keyOf={b => b.id} cols={[
            { h: "Product", r: b => item(s, b.itemId).sku }, { h: "Version", r: b => `v${b.version}` }, { h: "Base CTN", r: b => b.baseCtn, num: true },
            { h: "Loss", r: b => `${b.lossPct}%`, num: true }, { h: "Std reject", r: b => `${b.rejectStdPct}%`, num: true }, { h: "Rate CTN/h", r: b => b.lineRateCtnPerHour, num: true },
            { h: "Status", r: b => <Badge v={b.status} tone="ok" /> },
          ]} />
        </Card>
        <Card title="Material explosion" pad>
          <div className="form-row">
            <Field label="BOM"><select className="input" value={bomId} onChange={e => setBomId(e.target.value)}>{s.boms.map(b => <option key={b.id} value={b.id}>{item(s, b.itemId).sku} v{b.version}</option>)}</select></Field>
            <Field label="Planned CTN"><input className="input" type="number" value={ctn} onChange={e => setCtn(Math.max(0, Math.floor(Number(e.target.value))))} style={{ width: 100 }} /></Field>
          </div>
          <Table rows={req} cols={[
            { h: "Component", r: r => item(s, r.itemId).name },
            { h: "Required", r: r => `${fmt(r.qty)} ${item(s, r.itemId).unit}`, num: true },
            { h: "Released stock", r: r => fmt(releasedOnHand(s, r.itemId)), num: true },
            { h: "Enough?", r: r => (releasedOnHand(s, r.itemId) >= r.qty ? <Badge v="yes" tone="ok" /> : <Badge v="short" tone="err" />) },
          ]} />
        </Card>
      </div>
      <Card title="Components by version">
        <Table rows={s.boms.flatMap(b => b.lines.map(l => ({ b, l })))} cols={[
          { h: "BOM", r: r => `${item(s, r.b.itemId).sku} v${r.b.version}` }, { h: "Component", r: r => item(s, r.l.itemId).name },
          { h: "Qty per base", r: r => `${r.l.qty} ${item(s, r.l.itemId).unit}`, num: true },
        ]} />
      </Card>
    </Page>
  );
}

// ---------------- MRP ----------------
export function MRP() {
  const { s, user, run } = useErp();
  const m = computeMrp(s);
  return (
    <Page title="PPIC and MRP" intro="Module 08. Net FG = max(demand − allocated eligible stock − open production supply, 0). Planned orders not yet released are MRP output, not supply. Purchase proposal rounds up to MOQ, then to the order multiple."
      actions={user.role !== "Executive Viewer" ? <Btn kind="primary" onClick={() => run("applyMrp")}>Apply MRP proposals</Btn> : undefined}>
      <Card title="Finished goods net requirements">
        <Table rows={m.fg} empty="No open accepted demand." cols={[
          { h: "Product", r: r => item(s, r.itemId).sku },
          { h: "Demand", r: r => fmt(r.demand), num: true },
          { h: "Allocated stock", r: r => fmt(r.allocated), num: true },
          { h: "Open WO supply", r: r => fmt(r.openSupply), num: true },
          { h: "Already planned", r: r => fmt(r.planned), num: true },
          { h: "Net new production", r: r => <strong>{fmt(r.net)}</strong>, num: true },
          { h: "Allocation per PO", r: r => r.perPo.map(p => `${p.po}: ${p.allocated}/${p.ctn}`).join(" · ") },
          { h: "Earliest due", r: r => r.due },
        ]} />
      </Card>
      <Card title="Material requirements" sub="Late or cancelled supplier receipts are not counted as supply">
        <Table rows={m.rm} cols={[
          { h: "Material", r: r => item(s, r.itemId).name }, { h: "Unit", r: r => item(s, r.itemId).unit },
          { h: "Gross", r: r => fmt(r.gross), num: true }, { h: "Safety stock", r: r => fmt(r.safety), num: true },
          { h: "Released", r: r => fmt(r.available), num: true }, { h: "Incoming", r: r => fmt(r.incoming), num: true },
          { h: "Net need", r: r => fmt(r.net), num: true },
          { h: "MOQ / multiple", r: r => `${fmt(item(s, r.itemId).moq)} / ${fmt(item(s, r.itemId).multiple)}`, num: true },
          { h: "Proposal", r: r => (r.proposal ? <strong>{fmt(r.proposal)}</strong> : "—"), num: true },
        ]} />
      </Card>
      <Card title="Line capacity (month)" sub="Confirmed downtime from Maintenance reduces available hours">
        <Table rows={["Line 1", "Line 2"]} cols={[
          { h: "Line", r: l => l }, { h: "Base hours", r: l => capacityHours(s, l).base, num: true },
          { h: "Downtime", r: l => capacityHours(s, l).down, num: true }, { h: "Available", r: l => capacityHours(s, l).available, num: true },
          { h: "Load (planned + released WO hours)", r: l => fmt(s.workOrders.filter(w => w.line === l && ["planned", "released", "in production"].includes(w.status)).reduce((a, w) => a + w.planCtn / (s.boms.find(b => b.id === w.bomId)?.lineRateCtnPerHour ?? 20), 0)), num: true },
        ]} />
      </Card>
    </Page>
  );
}

// ---------------- Production ----------------
function WORow({ w }: { w: WorkOrder }) {
  const { s, run } = useErp();
  if (w.status === "planned") return <Btn small kind="primary" onClick={() => run("releaseWO", w.id)}>Release</Btn>;
  if (w.status === "released") return <Btn small kind="primary" onClick={() => run("issueMaterial", w.id)}>Issue material</Btn>;
  if (w.status === "in production") return <InlineForm fields={[{ name: "t", label: "Total CTN", type: "number", initial: w.planCtn, width: 80 }, { name: "r", label: "Rejects", type: "number", initial: 0, width: 70 }]} submit="Submit output" onSubmit={v => run("recordOutput", w.id, Number(v.t), Number(v.r))} />;
  if (w.status === "output submitted") { const ent = w.totalOut - w.rejects - w.received; return <InlineForm fields={[{ name: "q", label: `Receive (max ${ent})`, type: "number", initial: ent, width: 90 }]} submit="Receive to QC" onSubmit={v => run("receiveFG", w.id, Number(v.q))} />; }
  void s;
  return null;
}
export function Production() {
  const { s, user } = useErp();
  return (
    <Page title="Production execution" intro="Module 11. Good output = total − rejects; rejects cannot exceed total. Output creates a receiving entitlement, not stock. FG receipts go to quarantine until Quality releases them. Rejects above the BOM standard are expensed as production loss.">
      <Card title="Work orders">
        <Table rows={s.workOrders} keyOf={w => w.id} cols={[
          { h: "WO", r: w => w.id }, { h: "Product", r: w => item(s, w.itemId).sku }, { h: "BOM", r: w => w.bomId },
          { h: "Plan CTN", r: w => fmt(w.planCtn), num: true }, { h: "Due", r: w => w.due }, { h: "For POs", r: w => w.poIds.join(", ") || "stock" },
          { h: "Total / rejects / good", r: w => w.totalOut ? `${w.totalOut} / ${w.rejects} / ${w.totalOut - w.rejects}` : "—" },
          { h: "Received", r: w => fmt(w.received), num: true },
          { h: "Material cost", r: w => (w.materialCost ? idr(w.materialCost) : "—"), num: true },
          { h: "Status", r: w => <Badge v={w.status} /> },
          { h: "Next step", r: w => (user.role === "Executive Viewer" ? null : <WORow w={w} />) },
        ]} />
      </Card>
    </Page>
  );
}

// ---------------- Quality ----------------
export function Quality() {
  const { s, user, run } = useErp();
  const [trace, setTrace] = useState<string>("");
  const pending = s.lots.filter(l => l.status === "quarantine" && l.qty > 0);
  const lot = s.lots.find(l => l.id === trace);
  const traceRows = lot ? (() => {
    const wos = s.movements.filter(m => m.lotId === lot.id && m.type === "Issue to WO").map(m => m.ref);
    const outLots = s.lots.filter(l => wos.includes(l.source));
    const direct = [lot, ...outLots];
    const shipments = s.shipments.filter(sh => sh.picks.some(p => direct.some(d => d.id === p.lotId)) || s.movements.some(m => m.type === "Dispatch" && m.ref === sh.id && direct.some(d => d.id === m.lotId)));
    return { wos, outLots, shipments };
  })() : null;
  return (
    <Page title="Quality control" intro="Module 12. Only Quality releases controlled lots. Hold changes eligibility without changing physical quantity. Held lots cannot be picked or dispatched.">
      <Card title="Pending inspection" sub={`${pending.length} lots in quarantine`}>
        <Table rows={pending} empty="Nothing waiting for inspection." cols={[
          { h: "Lot", r: l => l.lotNo }, { h: "Item", r: l => item(s, l.itemId).name }, { h: "Qty", r: l => fmt(l.qty), num: true },
          { h: "Source", r: l => l.source }, { h: "Expiry", r: l => l.expiry },
          { h: "", r: l => user.role === "Executive Viewer" ? null : <div className="row-actions"><Btn small kind="primary" onClick={() => run("dispositionLot", l.id, true)}>Release</Btn><Btn small kind="danger" onClick={() => run("dispositionLot", l.id, false)}>Reject</Btn></div> },
        ]} />
      </Card>
      <Card title="Released lots" sub="Put a lot on hold to block picking and dispatch">
        <Table rows={s.lots.filter(l => l.status === "released" && l.qty > 0)} cols={[
          { h: "Lot", r: l => l.lotNo }, { h: "Item", r: l => item(s, l.itemId).sku }, { h: "Qty", r: l => fmt(l.qty), num: true },
          { h: "Shelf life left", r: l => `${Math.round(remainingShelfPct(s, l) * 100)}%`, num: true },
          { h: "", r: l => user.role === "Executive Viewer" ? null : <Btn small onClick={() => run("holdLot", l.id)}>Hold</Btn> },
        ]} />
      </Card>
      <Card title="Traceability" pad>
        <div className="form-row">
          <Field label="Lot"><select className="input" value={trace} onChange={e => setTrace(e.target.value)}><option value="">Choose a lot…</option>{s.lots.map(l => <option key={l.id} value={l.id}>{l.lotNo} ({item(s, l.itemId).sku})</option>)}</select></Field>
        </div>
        {traceRows && (
          <div style={{ marginTop: 10 }} className="small">
            <p><strong>Used in work orders:</strong> {traceRows.wos.join(", ") || "none"}</p>
            <p><strong>Output lots:</strong> {traceRows.outLots.map(l => l.lotNo).join(", ") || "none"}</p>
            <p><strong>Customer shipments:</strong> {traceRows.shipments.map(sh => `${sh.id} (${sh.poId}, ${cust(s, s.pos.find(p => p.id === sh.poId)!.customerId).name})`).join(", ") || "none"}</p>
          </div>
        )}
      </Card>
    </Page>
  );
}

// ---------------- Delivery ----------------
function DOView({ sh }: { sh: Shipment }) {
  const { s } = useErp();
  const po = s.pos.find(p => p.id === sh.poId)!;
  const c = cust(s, po.customerId);
  const total = po.lines.reduce((a, l) => a + l.ctn * cbm(item(s, l.itemId)), 0);
  return (
    <div className="doc">
      <h2 style={{ margin: "0 0 4px" }}>DELIVERY ORDER {sh.doNo ?? "(draft)"}</h2>
      <p className="small" style={{ margin: 0 }}>Shipment {sh.id} · Customer PO {po.ref} (v{po.version}) · Dispatch {sh.dispatchDate ?? "not yet"}</p>
      <p className="small">Ship to: <strong>{c.name}</strong></p>
      <table>
        <thead><tr><th>SKU</th><th>Description</th><th className="num">CTN</th><th className="num">CBM</th><th>Lots</th></tr></thead>
        <tbody>
          {po.lines.map(l => (
            <tr key={l.itemId}><td>{item(s, l.itemId).sku}</td><td>{item(s, l.itemId).name}</td><td className="num">{l.ctn}</td><td className="num">{(l.ctn * cbm(item(s, l.itemId))).toFixed(3)}</td>
              <td>{sh.picks.filter(p => p.itemId === l.itemId).map(p => `${s.lots.find(x => x.id === p.lotId)!.lotNo} × ${p.qty}`).join(", ")}</td></tr>
          ))}
        </tbody>
      </table>
      <p className="small">Total CBM {total.toFixed(3)}. No prices or PCS shown on the DO. Printing does not move stock.</p>
      <div className="grid cols-3 small" style={{ marginTop: 30 }}><div>Prepared by</div><div>Driver</div><div>Received by</div></div>
    </div>
  );
}
export function Delivery() {
  const { s, user, run } = useErp();
  const [view, setView] = useState<string | null>(null);
  const rows = s.shipments.filter(x => ["confirmed", "ready", "dispatched", "delivered", "completed"].includes(x.status));
  const v = s.shipments.find(x => x.id === view);
  return (
    <Page title="Delivery and delivery orders" intro="Module 13. Ready hard-reserves lots by FEFO. Dispatch re-checks credit and shelf life, then posts one stock issue and a fulfilment event. For customers whose control transfers at delivery, goods sit in transit until proof of delivery. Manual truck sharing never merges shipments.">
      {v && <Card title={`DO preview ${v.id}`} right={<div className="row-actions"><Btn onClick={() => window.print()}>Print</Btn><Btn onClick={() => setView(null)}>Close</Btn></div>} pad><DOView sh={v} /></Card>}
      <Card title="Shipment readiness and dispatch">
        <Table rows={rows} keyOf={r => r.id} cols={[
          { h: "Shipment", r: r => r.id }, { h: "PO", r: r => r.poId },
          { h: "Customer", r: r => { const c = cust(s, s.pos.find(p => p.id === r.poId)!.customerId); return <>{c.name}<div className="muted small">min shelf {c.minShelfPct}% · control at {c.deliveryTerms}</div></>; } },
          { h: "Confirmed", r: r => r.confirmed },
          { h: "Picks", r: r => r.picks.map(p => `${s.lots.find(l => l.id === p.lotId)!.lotNo}×${p.qty}`).join(", ") || "—" },
          { h: "Status", r: r => <Badge v={r.status} /> },
          { h: "Actions", r: r => user.role === "Executive Viewer" ? null : (
            <div className="row-actions">
              {r.status === "confirmed" && <Btn small kind="primary" onClick={() => run("markReady", r.id)}>Mark ready</Btn>}
              {r.status === "ready" && <Btn small kind="primary" onClick={() => run("dispatch", r.id)}>Confirm dispatch</Btn>}
              {r.status === "dispatched" && <InlineForm fields={[{ name: "p", label: "Proof of delivery", width: 130 }]} submit="Delivered" onSubmit={x => run("deliver", r.id, x.p)} />}
              {["ready", "dispatched", "delivered", "completed"].includes(r.status) && <Btn small onClick={() => setView(r.id)}>{r.doNo ? "Reprint DO" : "Preview DO"}</Btn>}
            </div>
          ) },
        ]} />
      </Card>
      <Rule>Carton CBM = L × W × H (cm) ÷ 1,000,000. Total CBM = Σ CTN × carton CBM. Reprinting keeps the DO number and never reposts stock.</Rule>
    </Page>
  );
}
