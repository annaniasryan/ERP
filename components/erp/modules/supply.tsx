"use client";
import React from "react";
import { useErp } from "../store";
import { Page, Card, Table, Badge, Btn, InlineForm } from "../ui";
import { item, idr, fmt, userName } from "../logic";

export function Purchasing() {
  const { s, user, run } = useErp();
  const ro = user.role === "Executive Viewer";
  const rms = s.items.filter(i => i.type === "RM");
  return (
    <Page title="Purchasing" intro="Module 09. Requests are approved by someone other than the requester; supplier POs are prepared by Purchasing and approved by the Purchasing Manager. Open incoming = ordered − received − cancelled. Only released lines count as MRP supply.">
      {!ro && (
        <Card title="New material request" pad>
          <InlineForm fields={[{ name: "i", label: "Material", options: rms.map(i => ({ v: i.id, l: `${i.sku} (${i.unit})` })), initial: rms[0].id, width: 200 }, { name: "q", label: "Quantity", type: "number" }]} submit="Submit request" onSubmit={v => run("createRequisition", v.i, Number(v.q))} />
        </Card>
      )}
      <Card title="Material requests">
        <Table rows={s.requisitions} empty="No material requests. Apply MRP or add one above." cols={[
          { h: "Request", r: r => r.id }, { h: "Material", r: r => item(s, r.itemId).name },
          { h: "Qty", r: r => `${fmt(r.qty)} ${item(s, r.itemId).unit}`, num: true }, { h: "Required", r: r => r.requiredDate },
          { h: "Source", r: r => r.source }, { h: "Requested by", r: r => userName(s, r.requestedBy) }, { h: "Status", r: r => <Badge v={r.status} /> },
          { h: "", r: r => ro ? null : r.status === "submitted" ? (
            <div className="row-actions"><Btn small kind="primary" onClick={() => run("decideRequisition", r.id, true)}>Approve</Btn><Btn small onClick={() => run("decideRequisition", r.id, false)}>Reject</Btn></div>
          ) : r.status === "approved" ? (
            <InlineForm fields={[{ name: "sup", label: "Supplier", options: s.suppliers.map(x => ({ v: x.id, l: x.name })), initial: s.suppliers[0].id, width: 170 }, { name: "p", label: "Unit price", type: "number", initial: item(s, r.itemId).avgCost, width: 90 }]} submit="Create PO" onSubmit={v => run("createSupplierPO", r.id, v.sup, Number(v.p))} />
          ) : null },
        ]} />
      </Card>
      <Card title="Supplier purchase orders">
        <Table rows={s.supplierPOs} keyOf={p => p.id} cols={[
          { h: "PO", r: p => p.id }, { h: "Supplier", r: p => s.suppliers.find(x => x.id === p.supplierId)!.name },
          { h: "Line", r: p => p.lines.map(l => `${item(s, l.itemId).sku} ${fmt(l.qty)} @ ${idr(l.price)}`).join(", ") },
          { h: "Received", r: p => p.lines.map(l => fmt(l.received)).join(", "), num: true },
          { h: "Open incoming", r: p => (p.status === "cancelled" ? 0 : fmt(p.lines.reduce((a, l) => a + l.qty - l.received, 0))), num: true },
          { h: "Expected", r: p => p.expected }, { h: "Prepared / approved", r: p => `${userName(s, p.createdBy)} / ${userName(s, p.approvedBy) || "—"}` },
          { h: "Status", r: p => <Badge v={p.status} /> },
          { h: "", r: p => ro ? null : <div className="row-actions">
            {p.status === "draft" && <Btn small kind="primary" onClick={() => run("approveSupplierPO", p.id)}>Approve & release</Btn>}
            {["draft", "approved", "released"].includes(p.status) && <Btn small kind="danger" onClick={() => run("cancelSupplierPO", p.id)}>Cancel</Btn>}
          </div> },
        ]} />
      </Card>
    </Page>
  );
}

export function Receiving() {
  const { s, user, run } = useErp();
  const ro = user.role === "Executive Viewer";
  const open = s.supplierPOs.filter(p => ["released", "partly received"].includes(p.status));
  return (
    <Page title="Supplier receiving" intro={`Module 10. Physical receipt goes to quarantine; Quality release changes eligibility without a second receipt. Rejected quantity is never available. Receipts above open quantity + ${s.settings.receiptTolerancePct}% tolerance are blocked.`}>
      <Card title="Expected receipts">
        <Table rows={open} empty="No released supplier POs awaiting delivery." cols={[
          { h: "PO", r: p => p.id }, { h: "Supplier", r: p => s.suppliers.find(x => x.id === p.supplierId)!.name },
          { h: "Material", r: p => item(s, p.lines[0].itemId).name },
          { h: "Open", r: p => `${fmt(p.lines[0].qty - p.lines[0].received)} ${item(s, p.lines[0].itemId).unit}`, num: true },
          { h: "Expected", r: p => p.expected },
          { h: "Receive", r: p => ro ? null : <InlineForm fields={[{ name: "q", label: "Delivered", type: "number", initial: p.lines[0].qty - p.lines[0].received, width: 90 }, { name: "r", label: "Rejected", type: "number", initial: 0, width: 80 }]} submit="Post receipt" onSubmit={v => run("receiveSupplier", p.id, Number(v.q), Number(v.r))} /> },
        ]} />
      </Card>
      <Card title="Goods receipts">
        <Table rows={s.receipts} empty="No receipts posted in this demo yet." cols={[
          { h: "Receipt", r: r => r.id }, { h: "PO", r: r => r.supplierPoId }, { h: "Material", r: r => item(s, r.itemId).sku },
          { h: "Delivered", r: r => fmt(r.qty), num: true }, { h: "Rejected", r: r => fmt(r.rejected), num: true }, { h: "Accepted", r: r => fmt(r.qty - r.rejected), num: true },
          { h: "Lot", r: r => { const l = s.lots.find(x => x.id === r.lotId)!; return <>{l.lotNo} <Badge v={l.status} /></>; } },
          { h: "Value", r: r => idr((r.qty - r.rejected) * r.unitCost), num: true }, { h: "Billed", r: r => (r.billed ? "yes" : "no") },
        ]} />
      </Card>
    </Page>
  );
}
