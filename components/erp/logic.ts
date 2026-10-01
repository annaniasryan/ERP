// Business rules from OrderFlow ERP spec v2.0.
// Every action takes a mutable draft of state plus the acting user.
// An action returns a string to reject the operation (nothing is saved) or void on success.
import type {
  ErpState, User, Role, Item, Lot, JournalLine, POLine, Shipment, WorkOrder, PayrollResult,
} from "./types";

export type ActionResult = string | void;

// ---------- helpers ----------
export const fmt = (n: number) => new Intl.NumberFormat("id-ID").format(Math.round(n) || 0);
export const idr = (n: number) => "Rp " + fmt(n);
export const pct = (n: number | null) => (n === null || !isFinite(n) ? "n/a" : `${(n * 100).toFixed(1)}%`);

export function addDays(date: string, days: number) {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function daysBetween(a: string, b: string) {
  return Math.round((new Date(b + "T00:00:00Z").getTime() - new Date(a + "T00:00:00Z").getTime()) / 86400000);
}
export const periodOf = (date: string) => date.slice(0, 7);

export function nextId(s: ErpState, prefix: string) {
  s.seq += 1;
  return `${prefix}-${s.seq}`;
}
export const item = (s: ErpState, id: string) => s.items.find(i => i.id === id) as Item;
export const cust = (s: ErpState, id: string) => s.customers.find(c => c.id === id)!;
export const userName = (s: ErpState, id?: string) => (id ? s.users.find(u => u.id === id)?.name ?? id : "");

export function audit(s: ErpState, u: User, action: string, record: string, detail = "") {
  s.audit.unshift({ id: nextId(s, "AU"), ts: new Date().toISOString(), actor: u.name, action, record, detail });
  if (s.audit.length > 500) s.audit.length = 500;
}

// ---------- permissions ----------
export type ModuleKey =
  | "dashboard" | "admin" | "master" | "crm" | "orders" | "shipments" | "inventory" | "bom" | "mrp"
  | "purchasing" | "receiving" | "production" | "quality" | "delivery" | "ar" | "ap" | "gl" | "costing"
  | "hr" | "maintenance" | "reports";

const ALL_INTERNAL: Role[] = [
  "Super Admin", "Executive Viewer", "Sales Admin", "Account Executive", "Sales Manager", "PPIC", "Head Production",
  "Warehouse", "Warehouse Manager", "Purchasing", "Purchasing Manager", "Quality Officer", "Shipment Division",
  "Finance AR", "Finance AP", "Finance Accountant", "Finance Manager", "HR Payroll Officer", "Maintenance Officer",
];
const FIN: Role[] = ["Finance AR", "Finance AP", "Finance Accountant", "Finance Manager"];
const OPS: Role[] = ["PPIC", "Head Production", "Warehouse", "Warehouse Manager", "Quality Officer", "Shipment Division"];

export const MODULE_ACCESS: Record<ModuleKey, Role[]> = {
  dashboard: [...ALL_INTERNAL, "Distributor", "Employee"],
  admin: ["Super Admin", "Finance Manager", "HR Payroll Officer", "Executive Viewer"],
  master: ["Super Admin", "Executive Viewer", "PPIC", "Sales Admin", "Sales Manager", "Purchasing", "Purchasing Manager", ...FIN, "Quality Officer"],
  crm: ["Executive Viewer", "Account Executive", "Sales Manager", "Sales Admin"],
  orders: ["Executive Viewer", "Sales Admin", "Account Executive", "Sales Manager", "PPIC", "Finance Manager", "Finance AR", "Distributor"],
  shipments: ["Executive Viewer", "Sales Admin", "Account Executive", "Sales Manager", "PPIC", "Shipment Division", "Distributor"],
  inventory: ["Executive Viewer", ...OPS, "Finance Accountant", "Finance Manager", "Purchasing"],
  bom: ["Executive Viewer", "PPIC", "Head Production", "Quality Officer", "Finance Accountant"],
  mrp: ["Executive Viewer", "PPIC", "Purchasing", "Purchasing Manager", "Head Production"],
  purchasing: ["Executive Viewer", "Purchasing", "Purchasing Manager", "PPIC", "Finance AP", "Finance Manager"],
  receiving: ["Executive Viewer", "Warehouse", "Warehouse Manager", "Quality Officer", "Purchasing", "Finance AP"],
  production: ["Executive Viewer", "Head Production", "PPIC", "Warehouse", "Quality Officer"],
  quality: ["Executive Viewer", "Quality Officer", "Warehouse", "PPIC", "Head Production"],
  delivery: ["Executive Viewer", "Shipment Division", "Warehouse", "Warehouse Manager", "Sales Admin"],
  ar: ["Executive Viewer", "Finance AR", "Finance Manager", "Finance Accountant", "Sales Manager"],
  ap: ["Executive Viewer", "Finance AP", "Finance Manager", "Finance Accountant"],
  gl: ["Executive Viewer", "Finance Accountant", "Finance Manager"],
  costing: ["Executive Viewer", "Finance Accountant", "Finance Manager", "PPIC"],
  hr: ["HR Payroll Officer", "Finance Manager", "Employee"],
  maintenance: ["Executive Viewer", "Maintenance Officer", "Head Production", "PPIC", "Finance Accountant"],
  reports: [...ALL_INTERNAL],
};

export const can = (u: User, roles: Role[]) => roles.includes(u.role);
const deny = (u: User, roles: Role[], what: string): string | undefined =>
  can(u, roles) ? undefined : `${u.role} cannot ${what}. Allowed: ${roles.join(", ")}.`;

// ---------- stock ----------
export const isExpired = (s: ErpState, l: Lot) => l.expiry < s.today;
export function eligibleLots(s: ErpState, itemId: string) {
  return s.lots
    .filter(l => l.itemId === itemId && l.status === "released" && l.qty > 0 && !isExpired(s, l))
    .sort((a, b) => a.expiry.localeCompare(b.expiry)); // FEFO
}
export const releasedOnHand = (s: ErpState, itemId: string) => eligibleLots(s, itemId).reduce((a, l) => a + l.qty, 0);
export const physicalOnHand = (s: ErpState, itemId: string) => s.lots.filter(l => l.itemId === itemId && l.status !== "rejected").reduce((a, l) => a + l.qty, 0);
export const reservedQty = (s: ErpState, itemId: string, excludePo?: string) =>
  s.reservations.filter(r => r.itemId === itemId && r.poId !== excludePo).reduce((a, r) => a + r.qty, 0);
export const atp = (s: ErpState, itemId: string) => releasedOnHand(s, itemId) - reservedQty(s, itemId);

export function remainingShelfPct(s: ErpState, l: Lot) {
  const it = item(s, l.itemId);
  return Math.max(0, daysBetween(s.today, l.expiry)) / it.shelfLifeDays;
}

function move(s: ErpState, m: { itemId: string; lotId?: string; qty: number; type: string; ref: string; key: string; unitCost?: number }): ActionResult {
  if (s.movements.some(x => x.key === m.key)) return; // idempotent
  const it = item(s, m.itemId);
  const lot = m.lotId ? s.lots.find(l => l.id === m.lotId) : undefined;
  if (lot && lot.qty + m.qty < 0) return `Negative stock blocked for lot ${lot.lotNo}.`;
  if (m.qty > 0 && m.unitCost !== undefined) {
    // moving weighted average
    const onHand = physicalOnHand(s, m.itemId);
    const newQty = onHand + m.qty;
    if (newQty > 0) it.avgCost = Math.round((onHand * it.avgCost + m.qty * m.unitCost) / newQty);
  }
  if (lot) lot.qty += m.qty;
  const unit = m.qty > 0 && m.unitCost !== undefined ? m.unitCost : it.avgCost;
  s.movements.unshift({ id: nextId(s, "MV"), date: s.today, itemId: m.itemId, lotId: m.lotId, qty: m.qty, type: m.type, ref: m.ref, key: m.key, value: Math.round(m.qty * unit) });
}

// ---------- ledger ----------
export function openPeriodFor(s: ErpState, date: string) {
  const p = s.periods.find(x => x.id === periodOf(date));
  if (p && p.status === "open") return { period: p.id, late: false };
  const open = s.periods.filter(x => x.status === "open").map(x => x.id).sort();
  const later = open.find(x => x >= periodOf(date)) ?? open[0];
  return { period: later, late: true };
}
export function postJournal(s: ErpState, key: string, source: string, memo: string, lines: JournalLine[], date = s.today): ActionResult {
  if (s.journals.some(j => j.key === key)) return; // source event key: retry-safe
  const lines2 = lines.filter(l => l.dr !== 0 || l.cr !== 0).map(l => ({ ...l, dr: Math.round(l.dr), cr: Math.round(l.cr) }));
  const dr = lines2.reduce((a, l) => a + l.dr, 0);
  const cr = lines2.reduce((a, l) => a + l.cr, 0);
  if (dr !== cr) return `Unbalanced journal ${source}: debit ${fmt(dr)} vs credit ${fmt(cr)}.`;
  const { period, late } = openPeriodFor(s, date);
  if (!period) return "No open accounting period.";
  s.journals.unshift({ id: nextId(s, "JV"), date, period, source, key, memo: late ? `${memo} (late posting)` : memo, lines: lines2 });
}
export function trialBalance(s: ErpState, period?: string) {
  const map = new Map<string, number>();
  for (const j of s.journals) {
    if (period && j.period > period) continue;
    for (const l of j.lines) map.set(l.account, (map.get(l.account) ?? 0) + l.dr - l.cr);
  }
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}
export const accountBalance = (s: ErpState, account: string) => trialBalance(s).find(([a]) => a === account)?.[1] ?? 0;

// ---------- pricing & credit ----------
export const activePriceList = (s: ErpState) => s.priceLists.filter(p => p.status === "active" && p.effective <= s.today).sort((a, b) => b.effective.localeCompare(a.effective))[0];
export const listPrice = (s: ErpState, itemId: string) => activePriceList(s)?.lines.find(l => l.itemId === itemId)?.price ?? 0;
export const poNet = (s: ErpState, lines: POLine[]) => lines.reduce((a, l) => a + l.ctn * (l.price ?? listPrice(s, l.itemId)), 0);
export const gross = (s: ErpState, net: number) => Math.round(net * (1 + s.settings.vatPct / 100));

export function openAR(s: ErpState, customerId: string) {
  return s.invoices.filter(i => i.customerId === customerId && i.status !== "draft").reduce((a, i) => a + i.net + i.vat - i.paid, 0);
}
export function maxOverdueDays(s: ErpState, customerId: string) {
  return s.invoices.filter(i => i.customerId === customerId && i.status !== "paid" && i.status !== "draft")
    .reduce((a, i) => Math.max(a, daysBetween(i.due, s.today)), 0);
}
export function acceptedUninvoiced(s: ErpState, customerId: string, excludePo?: string) {
  return s.pos.filter(p => p.customerId === customerId && p.status === "accepted" && p.id !== excludePo)
    .filter(p => { const sh = s.shipments.find(x => x.poId === p.id); return !sh || !s.invoices.some(i => i.shipmentId === sh.id && i.status !== "draft"); })
    .reduce((a, p) => a + gross(s, poNet(s, p.lines)), 0);
}
export function creditCheck(s: ErpState, poId: string) {
  const po = s.pos.find(p => p.id === poId)!;
  const c = cust(s, po.customerId);
  const exposure = openAR(s, c.id) + acceptedUninvoiced(s, c.id, po.id) + gross(s, poNet(s, po.lines));
  const overdue = maxOverdueDays(s, c.id);
  const reasons: string[] = [];
  if (exposure > c.creditLimit) reasons.push(`exposure ${idr(exposure)} exceeds limit ${idr(c.creditLimit)}`);
  if (overdue > s.settings.overdueHoldDays) reasons.push(`invoices overdue ${overdue} days (limit ${s.settings.overdueHoldDays})`);
  return { exposure, overdue, limit: c.creditLimit, ok: reasons.length === 0, reasons };
}

// ---------- reservations ----------
export const qualifyingLots = (s: ErpState, itemId: string, minShelfPct: number) =>
  eligibleLots(s, itemId).filter(l => remainingShelfPct(s, l) * 100 >= minShelfPct);
// Conservative: stock that meets this customer's shelf life rule, less everything other POs hold.
export function availableForCustomer(s: ErpState, itemId: string, minShelfPct: number, poId: string) {
  const qualifying = qualifyingLots(s, itemId, minShelfPct).reduce((a, l) => a + l.qty, 0);
  const others = reservedQty(s, itemId, poId);
  const atpOthers = releasedOnHand(s, itemId) - others;
  return Math.max(0, Math.min(qualifying - others, atpOthers));
}
function softReserve(s: ErpState, poId: string) {
  const po = s.pos.find(p => p.id === poId)!;
  const c = cust(s, po.customerId);
  s.reservations = s.reservations.filter(r => r.poId !== poId);
  for (const l of po.lines) {
    const qty = Math.min(l.ctn, availableForCustomer(s, l.itemId, c.minShelfPct, poId));
    if (qty > 0) s.reservations.push({ id: nextId(s, "RS"), poId, itemId: l.itemId, qty, level: "soft" });
  }
}
export const reservedFor = (s: ErpState, poId: string, itemId: string) => s.reservations.filter(r => r.poId === poId && r.itemId === itemId).reduce((a, r) => a + r.qty, 0);

// ---------- Admin ----------
const SENSITIVE: Role[] = ["Super Admin", "Finance Manager", "Finance AP", "Finance AR", "Finance Accountant", "HR Payroll Officer"];
export const securityApproverFor = (role: Role): Role => (role === "HR Payroll Officer" ? "HR Payroll Officer" : role === "Super Admin" ? "Executive Viewer" : "Finance Manager");

export const actions = {
  requestGrant(s: ErpState, u: User, userId: string, role: Role): ActionResult {
    const d = deny(u, ["Super Admin"], "request role grants"); if (d) return d;
    const target = s.users.find(x => x.id === userId)!;
    const sensitive = SENSITIVE.includes(role);
    const g = { id: nextId(s, "RG"), userId, role, requestedBy: u.id, status: sensitive ? "requested" as const : "active" as const, date: s.today };
    s.grants.unshift(g);
    if (!sensitive) target.role = role;
    audit(s, u, sensitive ? "Role grant requested" : "Role granted", target.name, role);
    if (sensitive && userId === u.id) audit(s, u, "Self grant flagged", target.name, "Requester cannot approve own sensitive grant");
  },
  decideGrant(s: ErpState, u: User, grantId: string, approve: boolean): ActionResult {
    const g = s.grants.find(x => x.id === grantId)!;
    if (g.status !== "requested") return "Grant is not pending.";
    if (g.userId === u.id || g.requestedBy === u.id) return "Self approval of a sensitive role grant is blocked.";
    const needed = securityApproverFor(g.role);
    const allowed: Role[] = needed === "Executive Viewer" ? ["Executive Viewer", "Finance Manager"] : [needed, "Finance Manager"];
    const d = deny(u, allowed, `approve a ${g.role} grant (Security Approver)`); if (d) return d;
    g.status = approve ? "active" : "rejected";
    g.approvedBy = u.id;
    if (approve) s.users.find(x => x.id === g.userId)!.role = g.role;
    audit(s, u, approve ? "Role grant approved" : "Role grant rejected", userName(s, g.userId), g.role);
  },
  setDecision(s: ErpState, u: User, id: string, status: "confirmed" | "changed", note: string): ActionResult {
    const d = deny(u, ["Super Admin", "Finance Manager"], "update the decision register"); if (d) return d;
    const x = s.decisions.find(q => q.id === id)!;
    x.status = status; x.note = note || x.note;
    audit(s, u, `Decision ${status}`, x.decision, note);
  },
  setToday(s: ErpState, u: User, date: string): ActionResult {
    const d = deny(u, ["Super Admin"], "change the business date"); if (d) return d;
    if (date < s.today) return "Business date cannot move backwards.";
    s.today = date;
    for (const p of [periodOf(date)]) if (!s.periods.some(x => x.id === p)) s.periods.push({ id: p, status: "open" });
    audit(s, u, "Business date advanced", date);
  },

  // ---------- Master data ----------
  updateItem(s: ErpState, u: User, id: string, patch: Partial<Item>): ActionResult {
    const d = deny(u, ["PPIC"], "edit item masters"); if (d) return d;
    Object.assign(item(s, id), patch);
    audit(s, u, "Item updated", item(s, id).sku, JSON.stringify(patch));
  },
  updateCustomer(s: ErpState, u: User, id: string, patch: { creditLimit?: number; minShelfPct?: number; deliveryTerms?: "dispatch" | "delivery" }): ActionResult {
    const d = deny(u, ["Finance Manager", "Sales Manager"], "edit customer credit and terms"); if (d) return d;
    Object.assign(cust(s, id), patch);
    audit(s, u, "Customer terms updated", cust(s, id).name, JSON.stringify(patch));
  },
  draftPriceList(s: ErpState, u: User, effective: string, pctChange: number): ActionResult {
    const d = deny(u, ["Sales Admin", "Sales Manager"], "draft price lists"); if (d) return d;
    const base = activePriceList(s);
    const id = `PL-${effective.slice(0, 7)}-${s.seq + 1}`;
    s.seq += 1;
    s.priceLists.push({ id, effective, status: "draft", lines: base.lines.map(l => ({ itemId: l.itemId, price: Math.round((l.price * (1 + pctChange / 100)) / 500) * 500 })), approvedBy: undefined });
    (s.priceLists[s.priceLists.length - 1] as { createdBy?: string }).createdBy = u.id;
    audit(s, u, "Price list drafted", id, `${pctChange}% from ${base.id}`);
  },
  approvePriceList(s: ErpState, u: User, id: string): ActionResult {
    const d = deny(u, ["Sales Manager"], "approve price lists"); if (d) return d;
    const pl = s.priceLists.find(p => p.id === id)! as { createdBy?: string } & (typeof s.priceLists)[number];
    if (pl.createdBy === u.id) return "The editor cannot approve their own price list.";
    pl.status = "active"; pl.approvedBy = u.id;
    for (const o of s.priceLists) if (o.id !== id && o.status === "active" && o.effective <= pl.effective) o.status = "superseded";
    audit(s, u, "Price list approved", id);
  },

  // ---------- CRM ----------
  moveLead(s: ErpState, u: User, id: string, stage: "lead" | "qualified" | "quotation" | "negotiation" | "won" | "lost"): ActionResult {
    const l = s.leads.find(x => x.id === id)!;
    if (u.role === "Account Executive" && l.owner !== u.id) return "AEs can only update their own accounts.";
    const d = deny(u, ["Account Executive", "Sales Manager"], "update leads"); if (d) return d;
    l.stage = stage;
    audit(s, u, "Lead stage changed", l.name, stage);
  },
  addLead(s: ErpState, u: User, name: string, value: number): ActionResult {
    const d = deny(u, ["Account Executive", "Sales Manager"], "add leads"); if (d) return d;
    if (!name.trim()) return "Lead name is required.";
    s.leads.push({ id: nextId(s, "LD"), name, owner: u.id, stage: "lead", value, followUp: addDays(s.today, 7) });
    audit(s, u, "Lead added", name);
  },

  // ---------- Customer orders ----------
  createPO(s: ErpState, u: User, customerId: string, ref: string, requestedDate: string, lines: POLine[]): ActionResult {
    const d = deny(u, ["Distributor", "Sales Admin"], "create customer POs"); if (d) return d;
    if (u.role === "Distributor" && u.customerId !== customerId) return "Distributors can only submit their own POs.";
    const c = cust(s, customerId);
    if (!c.active) return "Inactive customers cannot submit new POs.";
    if (!ref.trim()) return "Customer PO reference is required.";
    if (s.pos.some(p => p.customerId === customerId && p.ref.trim().toLowerCase() === ref.trim().toLowerCase())) return `PO reference ${ref} already exists for ${c.name}.`;
    const clean = lines.filter(l => l.ctn > 0);
    if (!clean.length) return "Add at least one product line.";
    if (clean.some(l => !Number.isInteger(l.ctn))) return "Finished goods quantities must be whole CTN.";
    if (requestedDate < s.today) return "Requested date cannot be in the past.";
    const id = nextId(s, "PO-C");
    s.pos.unshift({ id, customerId, ref: ref.trim(), requestedDate, status: "submitted", lines: clean.map(l => ({ itemId: l.itemId, ctn: l.ctn })), version: 1, history: [], submittedBy: u.id, created: s.today });
    audit(s, u, "Customer PO submitted", id, `${c.name} ${ref}`);
  },
  acceptPO(s: ErpState, u: User, poId: string): ActionResult {
    const d = deny(u, ["Sales Admin"], "accept customer POs"); if (d) return d;
    const po = s.pos.find(p => p.id === poId)!;
    if (!["submitted", "under review", "credit hold"].includes(po.status)) return `PO is ${po.status}.`;
    if (po.status === "credit hold" && !po.holdReleasedBy) return "PO is on credit hold. Sales Manager or Finance Manager must release it first.";
    // price lock
    const pl = activePriceList(s);
    for (const l of po.lines) {
      const price = pl.lines.find(x => x.itemId === l.itemId)?.price;
      if (!price) return `No active price for ${item(s, l.itemId).sku}.`;
      if (l.price === undefined) l.price = price;
    }
    po.priceListId = po.priceListId ?? pl.id;
    if (!po.holdReleasedBy) {
      const cc = creditCheck(s, po.id);
      if (!cc.ok) {
        po.status = "credit hold";
        po.creditNote = cc.reasons.join("; ");
        audit(s, u, "Credit hold", po.id, po.creditNote);
        return; // saved as hold, not an error
      }
    }
    po.status = "accepted";
    po.acceptedBy = u.id;
    if (!s.shipments.some(x => x.poId === po.id)) {
      s.shipments.unshift({ id: nextId(s, "SH"), poId: po.id, status: "confirmed", firstConfirmed: po.requestedDate, confirmed: po.requestedDate, dateChanges: [], picks: [] });
    }
    softReserve(s, po.id);
    audit(s, u, "PO accepted and shipment confirmed", po.id, `Prices locked from ${po.priceListId}`);
  },
  releaseHold(s: ErpState, u: User, poId: string, reason: string): ActionResult {
    const po = s.pos.find(p => p.id === poId)!;
    if (po.status !== "credit hold") return "PO is not on credit hold.";
    if (!reason.trim()) return "A release reason is required.";
    if (po.submittedBy === u.id || po.acceptedBy === u.id) return "The requester cannot release their own credit hold.";
    const cc = creditCheck(s, po.id);
    const over = Math.max(0, cc.exposure - cc.limit);
    if (u.role === "Sales Manager") {
      if (cc.overdue > s.settings.overdueHoldDays) return "Overdue invoices: only the Finance Manager can release this hold.";
      if (over > s.settings.salesMgrCreditLimit) return `Over limit by ${idr(over)}; Sales Manager can release up to ${idr(s.settings.salesMgrCreditLimit)}. Finance Manager required.`;
    } else {
      const d = deny(u, ["Finance Manager", "Sales Manager"], "release credit holds"); if (d) return d;
    }
    po.holdReleasedBy = u.id;
    po.creditNote = `${po.creditNote} | Released by ${u.name}: ${reason}`;
    audit(s, u, "Credit hold released", po.id, reason);
  },
  rejectPO(s: ErpState, u: User, poId: string): ActionResult {
    const d = deny(u, ["Sales Admin"], "reject customer POs"); if (d) return d;
    const po = s.pos.find(p => p.id === poId)!;
    if (!["submitted", "under review", "credit hold"].includes(po.status)) return `PO is ${po.status}.`;
    po.status = "rejected";
    audit(s, u, "PO rejected", po.id);
  },
  cancelPO(s: ErpState, u: User, poId: string): ActionResult {
    const d = deny(u, ["Sales Admin", "Sales Manager"], "cancel accepted POs"); if (d) return d;
    const po = s.pos.find(p => p.id === poId)!;
    const sh = s.shipments.find(x => x.poId === po.id);
    if (sh && ["dispatched", "delivered", "completed"].includes(sh.status)) return "Dispatched orders cannot be cancelled; use a return and credit note.";
    po.status = "cancelled";
    if (sh) { sh.status = "cancelled"; sh.picks = []; }
    s.reservations = s.reservations.filter(r => r.poId !== po.id);
    const notes: string[] = [];
    for (const wo of s.workOrders.filter(w => w.poIds.includes(po.id))) {
      wo.poIds = wo.poIds.filter(x => x !== po.id);
      if (["planned", "released"].includes(wo.status) && wo.poIds.length === 0) { wo.status = "cancelled"; notes.push(`${wo.id} cancelled`); }
      else notes.push(`${wo.id} continues; output becomes unallocated stock`);
    }
    audit(s, u, "PO cancelled (cascade)", po.id, notes.join("; ") || "Reservations released");
  },
  submitRevision(s: ErpState, u: User, poId: string, lines: POLine[], reason: string): ActionResult {
    const d = deny(u, ["Distributor", "Sales Admin"], "request PO revisions"); if (d) return d;
    const po = s.pos.find(p => p.id === poId)!;
    if (u.role === "Distributor" && u.customerId !== po.customerId) return "Not your PO.";
    const sh = s.shipments.find(x => x.poId === po.id);
    if (sh && ["dispatched", "delivered", "completed"].includes(sh.status)) return "Revision of a dispatched PO is blocked.";
    if (po.status !== "accepted") return "Only accepted POs are revised; edit submitted POs directly.";
    if (lines.some(l => !Number.isInteger(l.ctn) || l.ctn < 0)) return "Quantities must be whole CTN.";
    s.revisions.unshift({ id: nextId(s, "RV"), poId, lines, reason, status: "submitted", by: u.id });
    audit(s, u, "Revision requested", po.id, reason);
  },
  decideRevision(s: ErpState, u: User, revId: string, accept: boolean): ActionResult {
    const d = deny(u, ["Account Executive"], "approve customer revisions (after Sales Admin and PPIC impact review)"); if (d) return d;
    const r = s.revisions.find(x => x.id === revId)!;
    const po = s.pos.find(p => p.id === r.poId)!;
    if (cust(s, po.customerId).aeId !== u.id) return "Only the assigned AE reviews this customer's revisions.";
    r.status = accept ? "accepted" : "rejected";
    if (accept) {
      po.history.push({ version: po.version, lines: JSON.parse(JSON.stringify(po.lines)), date: s.today, by: u.id });
      po.version += 1;
      po.lines = r.lines.filter(l => l.ctn > 0).map(l => {
        const old = po.lines.find(o => o.itemId === l.itemId);
        return { itemId: l.itemId, ctn: l.ctn, price: old?.price ?? listPrice(s, l.itemId) }; // unchanged lines keep locked price
      });
      const sh = s.shipments.find(x => x.poId === po.id);
      if (sh && sh.status === "ready") { sh.status = "confirmed"; sh.picks = []; }
      softReserve(s, po.id); // atomic recalculation
    }
    audit(s, u, accept ? "Revision accepted" : "Revision rejected", po.id, `v${po.version}`);
  },

  // ---------- Shipments ----------
  reviseDate(s: ErpState, u: User, shId: string, date: string, reason: string): ActionResult {
    const d = deny(u, ["Sales Admin"], "revise shipment commitments"); if (d) return d;
    const sh = s.shipments.find(x => x.id === shId)!;
    if (!["confirmed", "ready", "pending confirmation"].includes(sh.status)) return `Shipment is ${sh.status}.`;
    if (!reason.trim()) return "A reason is required.";
    sh.dateChanges.push({ from: sh.confirmed ?? "", to: date, reason, by: u.id });
    sh.confirmed = date;
    audit(s, u, "Commitment revised", sh.id, `${date}: ${reason}`);
  },
  markReady(s: ErpState, u: User, shId: string): ActionResult {
    const d = deny(u, ["Shipment Division", "PPIC"], "mark shipments ready"); if (d) return d;
    const sh = s.shipments.find(x => x.id === shId)!;
    if (sh.status !== "confirmed") return `Shipment is ${sh.status}.`;
    const po = s.pos.find(p => p.id === sh.poId)!;
    const c = cust(s, po.customerId);
    const picks: Shipment["picks"] = [];
    const short: string[] = [];
    for (const line of po.lines) {
      // stock this PO may use = qualifying released stock minus what other POs hold
      let cap = availableForCustomer(s, line.itemId, c.minShelfPct, po.id);
      let need = line.ctn;
      for (const l of qualifyingLots(s, line.itemId, c.minShelfPct)) {
        if (need <= 0 || cap <= 0) break;
        const hardOthers = s.reservations.filter(r => r.lotId === l.id && r.poId !== po.id).reduce((a, r) => a + r.qty, 0);
        const take = Math.min(l.qty - hardOthers, need, cap);
        if (take > 0) { picks.push({ lotId: l.id, itemId: line.itemId, qty: take }); need -= take; cap -= take; }
      }
      if (need > 0) short.push(`${item(s, line.itemId).sku} short ${need} CTN of released stock meeting ${c.minShelfPct}% shelf life`);
    }
    if (short.length) return `Cannot mark ready: ${short.join("; ")}.`;
    s.reservations = s.reservations.filter(r => r.poId !== po.id);
    for (const p of picks) s.reservations.push({ id: nextId(s, "RS"), poId: po.id, itemId: p.itemId, qty: p.qty, level: "hard", lotId: p.lotId });
    sh.picks = picks;
    sh.status = "ready";
    audit(s, u, "Shipment ready (hard reserved, FEFO)", sh.id, picks.map(p => `${s.lots.find(l => l.id === p.lotId)!.lotNo} x ${p.qty}`).join(", "));
  },
  dispatch(s: ErpState, u: User, shId: string): ActionResult {
    const d = deny(u, ["Shipment Division", "Warehouse"], "confirm dispatch"); if (d) return d;
    const sh = s.shipments.find(x => x.id === shId)!;
    if (sh.status !== "ready") return "Dispatch is blocked unless the shipment is ready (every line fully picked and released).";
    const po = s.pos.find(p => p.id === sh.poId)!;
    const c = cust(s, po.customerId);
    if (maxOverdueDays(s, c.id) > s.settings.overdueHoldDays && !po.holdReleasedBy) return "Credit re-check at dispatch failed: overdue invoices. Finance Manager must release.";
    for (const p of sh.picks) {
      const l = s.lots.find(x => x.id === p.lotId)!;
      if (l.status !== "released") return `Lot ${l.lotNo} is ${l.status}; dispatch blocked.`;
      if (remainingShelfPct(s, l) * 100 < c.minShelfPct) return `Lot ${l.lotNo} no longer meets ${c.minShelfPct}% shelf life.`;
    }
    const total = po.lines.reduce((a, l) => a + l.ctn, 0);
    if (sh.picks.reduce((a, p) => a + p.qty, 0) !== total) return "Shipment CTN must equal all accepted PO lines.";
    let cost = 0;
    for (const p of sh.picks) {
      const err = move(s, { itemId: p.itemId, lotId: p.lotId, qty: -p.qty, type: "Dispatch", ref: sh.id, key: `dispatch-${sh.id}-${p.lotId}` });
      if (err) return err;
      cost += p.qty * item(s, p.itemId).avgCost;
    }
    s.reservations = s.reservations.filter(r => r.poId !== po.id);
    sh.status = "dispatched";
    sh.dispatchDate = s.today;
    sh.doNo = sh.doNo ?? `DO-${sh.id.split("-")[1]}`;
    const net = poNet(s, po.lines);
    if (c.deliveryTerms === "dispatch") {
      const e = postJournal(s, `rev-${sh.id}`, "Dispatch (control transfer)", `${sh.id} ${c.name}`, [
        { account: "5000 Cost of goods sold", dr: cost, cr: 0 }, { account: "1330 Inventory finished goods", dr: 0, cr: cost },
        { account: "1210 Unbilled receivable", dr: net, cr: 0 }, { account: "4000 Revenue", dr: 0, cr: net },
      ]);
      if (e) return e;
    } else {
      const e = postJournal(s, `git-${sh.id}`, "Dispatch to goods in transit", `${sh.id} ${c.name}`, [
        { account: "1340 Goods in transit", dr: cost, cr: 0 }, { account: "1330 Inventory finished goods", dr: 0, cr: cost },
      ]);
      if (e) return e;
    }
    audit(s, u, "Dispatched", sh.id, `${total} CTN, ${sh.doNo}`);
  },
  deliver(s: ErpState, u: User, shId: string, proof: string): ActionResult {
    const d = deny(u, ["Shipment Division"], "record delivery"); if (d) return d;
    const sh = s.shipments.find(x => x.id === shId)!;
    if (sh.status !== "dispatched") return "Only dispatched shipments can be delivered.";
    if (!proof.trim()) return "Delivery evidence (receiver name or POD number) is required.";
    const po = s.pos.find(p => p.id === sh.poId)!;
    const c = cust(s, po.customerId);
    if (c.deliveryTerms === "delivery") {
      const cost = s.journals.find(j => j.key === `git-${sh.id}`)?.lines[0].dr ?? 0;
      const net = poNet(s, po.lines);
      const e = postJournal(s, `rev-${sh.id}`, "Proof of delivery (control transfer)", `${sh.id} ${c.name}`, [
        { account: "5000 Cost of goods sold", dr: cost, cr: 0 }, { account: "1340 Goods in transit", dr: 0, cr: cost },
        { account: "1210 Unbilled receivable", dr: net, cr: 0 }, { account: "4000 Revenue", dr: 0, cr: net },
      ]);
      if (e) return e;
    }
    sh.status = "delivered";
    sh.deliveredDate = s.today;
    if (s.invoices.some(i => i.shipmentId === sh.id && i.status !== "draft")) sh.status = "completed";
    audit(s, u, "Delivered", sh.id, proof);
  },

  // ---------- Inventory ----------
  countLot(s: ErpState, u: User, lotId: string, counted: number): ActionResult {
    const d = deny(u, ["Warehouse"], "enter counts"); if (d) return d;
    const l = s.lots.find(x => x.id === lotId)!;
    if (!(counted >= 0)) return "Counted quantity must be zero or more.";
    s.counts.unshift({ id: nextId(s, "CC"), lotId, book: l.qty, counted, status: "counted", by: u.id });
    audit(s, u, "Cycle count entered", l.lotNo, `book ${l.qty}, counted ${counted}`);
  },
  approveCount(s: ErpState, u: User, countId: string, approve: boolean): ActionResult {
    const d = deny(u, ["Warehouse Manager"], "approve count adjustments"); if (d) return d;
    const c = s.counts.find(x => x.id === countId)!;
    if (c.by === u.id) return "The counter cannot approve their own adjustment.";
    if (c.status !== "counted") return "Count already processed.";
    const l = s.lots.find(x => x.id === c.lotId)!;
    // snapshot and reconcile: movements since count start are already in lot.qty; variance vs snapshot
    const variance = c.counted - c.book;
    c.status = approve ? "posted" : "rejected"; c.approvedBy = u.id;
    if (approve && variance !== 0) {
      const it = item(s, l.itemId);
      const e = move(s, { itemId: l.itemId, lotId: l.id, qty: variance, type: "Count adjustment", ref: c.id, key: `count-${c.id}` });
      if (e) return e;
      const val = Math.abs(variance * it.avgCost);
      const inv = it.type === "FG" ? "1330 Inventory finished goods" : "1310 Inventory raw material";
      postJournal(s, `count-${c.id}`, "Count adjustment", `${l.lotNo} ${variance}`, variance < 0
        ? [{ account: "6100 Inventory loss", dr: val, cr: 0 }, { account: inv, dr: 0, cr: val }]
        : [{ account: inv, dr: val, cr: 0 }, { account: "6100 Inventory loss", dr: 0, cr: val }]);
    }
    audit(s, u, approve ? "Count adjustment posted" : "Count adjustment rejected", l.lotNo, `variance ${variance}`);
  },
  shelfLifeJob(s: ErpState, u: User): ActionResult {
    const d = deny(u, ["PPIC", "Warehouse Manager", "Quality Officer"], "run the shelf life job"); if (d) return d;
    const dropped: string[] = [];
    for (const sh of s.shipments.filter(x => x.status === "ready")) {
      const po = s.pos.find(p => p.id === sh.poId)!;
      const c = cust(s, po.customerId);
      const bad = sh.picks.some(p => { const l = s.lots.find(x => x.id === p.lotId)!; return l.status !== "released" || remainingShelfPct(s, l) * 100 < c.minShelfPct; });
      if (bad) {
        sh.status = "confirmed"; sh.picks = [];
        softReserve(s, po.id);
        dropped.push(sh.id);
      }
    }
    audit(s, u, "Shelf life job run", "Reservations", dropped.length ? `Dropped from ready: ${dropped.join(", ")}` : "No changes");
  },

  // ---------- MRP ----------
  applyMrp(s: ErpState, u: User): ActionResult {
    const d = deny(u, ["PPIC"], "apply MRP"); if (d) return d;
    const plan = computeMrp(s);
    let wo = 0, rq = 0;
    for (const f of plan.fg) if (f.net > 0) {
      const bom = s.boms.find(b => b.itemId === f.itemId && b.status === "effective");
      if (!bom) continue; // missing BOM blocks automatic planning
      s.workOrders.unshift({ id: nextId(s, "WO"), itemId: f.itemId, planCtn: f.net, bomId: bom.id, line: "Line 1", status: "planned", poIds: f.poIds, totalOut: 0, rejects: 0, received: 0, issued: false, materialCost: 0, abnormalLoss: 0, due: f.due });
      wo++;
    }
    const plan2 = computeMrp(s); // include new planned orders in material explosion
    for (const m of plan2.rm) if (m.proposal > 0 && !s.requisitions.some(r => r.itemId === m.itemId && r.status === "submitted")) {
      s.requisitions.unshift({ id: nextId(s, "MR"), itemId: m.itemId, qty: m.proposal, requiredDate: addDays(s.today, item(s, m.itemId).leadTimeDays), status: "submitted", requestedBy: u.id, source: "MRP" });
      rq++;
    }
    audit(s, u, "MRP applied", "MRP run", `${wo} work orders planned, ${rq} material requests`);
    if (!wo && !rq) return "MRP found no net requirements to apply.";
  },

  // ---------- Production ----------
  releaseWO(s: ErpState, u: User, woId: string): ActionResult {
    const d = deny(u, ["PPIC"], "release work orders"); if (d) return d;
    const wo = s.workOrders.find(w => w.id === woId)!;
    if (wo.status !== "planned") return `Work order is ${wo.status}.`;
    wo.status = "released";
    audit(s, u, "Work order released", wo.id);
  },
  issueMaterial(s: ErpState, u: User, woId: string): ActionResult {
    const d = deny(u, ["Warehouse"], "issue material"); if (d) return d;
    const wo = s.workOrders.find(w => w.id === woId)!;
    if (wo.status !== "released") return `Work order is ${wo.status}.`;
    const req = materialFor(s, wo.bomId, wo.planCtn);
    for (const r of req) if (releasedOnHand(s, r.itemId) - reservedQty(s, r.itemId) < r.qty) return `Insufficient released ${item(s, r.itemId).sku}: need ${fmt(r.qty)} ${item(s, r.itemId).unit}.`;
    let cost = 0;
    for (const r of req) {
      let need = r.qty;
      for (const l of eligibleLots(s, r.itemId)) {
        if (need <= 0) break;
        const take = Math.min(l.qty, need);
        const e = move(s, { itemId: r.itemId, lotId: l.id, qty: -take, type: "Issue to WO", ref: wo.id, key: `issue-${wo.id}-${l.id}` });
        if (e) return e;
        cost += take * item(s, r.itemId).avgCost;
        need -= take;
      }
    }
    wo.issued = true; wo.materialCost = Math.round(cost); wo.status = "in production";
    const e = postJournal(s, `issue-${wo.id}`, "Material issue", wo.id, [{ account: "1320 Work in progress", dr: cost, cr: 0 }, { account: "1310 Inventory raw material", dr: 0, cr: cost }]);
    if (e) return e;
    audit(s, u, "Material issued", wo.id, idr(cost));
  },
  recordOutput(s: ErpState, u: User, woId: string, total: number, rejects: number): ActionResult {
    const d = deny(u, ["Head Production"], "record production actuals"); if (d) return d;
    const wo = s.workOrders.find(w => w.id === woId)!;
    if (wo.status !== "in production") return `Work order is ${wo.status}.`;
    if (!Number.isInteger(total) || !Number.isInteger(rejects) || total < 0 || rejects < 0) return "Total and rejects must be whole, non-negative CTN.";
    if (rejects > total) return "Rejects cannot exceed total output.";
    if (total > Math.ceil(wo.planCtn * 1.05)) return `Overproduction above 5% tolerance (${Math.ceil(wo.planCtn * 1.05)} CTN) needs approval.`;
    wo.totalOut = total; wo.rejects = rejects; wo.status = "output submitted";
    audit(s, u, "Output recorded", wo.id, `total ${total}, rejects ${rejects}, good ${total - rejects}`);
  },
  receiveFG(s: ErpState, u: User, woId: string, qty: number): ActionResult {
    const d = deny(u, ["Warehouse"], "receive finished goods"); if (d) return d;
    const wo = s.workOrders.find(w => w.id === woId)!;
    if (wo.status !== "output submitted") return `Work order is ${wo.status}.`;
    const entitlement = wo.totalOut - wo.rejects - wo.received;
    if (qty <= 0 || !Number.isInteger(qty)) return "Receipt must be whole CTN.";
    if (qty > entitlement) return `Receipt exceeds unreceived good output (${entitlement} CTN).`;
    const it = item(s, wo.itemId);
    const bom = s.boms.find(b => b.id === wo.bomId)!;
    const costPerTotal = wo.totalOut ? wo.materialCost / wo.totalOut : 0;
    const normalRejects = Math.floor(wo.totalOut * bom.rejectStdPct / 100);
    const abnormal = Math.max(0, wo.rejects - normalRejects);
    const fgValueAll = wo.materialCost - abnormal * costPerTotal;
    const good = wo.totalOut - wo.rejects;
    const unit = good ? fgValueAll / good : 0;
    const lotId = `l${s.seq + 1}`; s.seq += 1;
    s.lots.push({ id: lotId, itemId: wo.itemId, lotNo: `FG-${it.sku.slice(0, 2)}-${s.today.slice(2, 10).replace(/-/g, "")}-${s.seq}`, location: "QC-HOLD", qty: 0, status: "quarantine", produced: s.today, expiry: addDays(s.today, it.shelfLifeDays), source: wo.id });
    const e = move(s, { itemId: wo.itemId, lotId, qty, type: "FG receipt (quarantine)", ref: wo.id, key: `fgr-${wo.id}-${wo.received}`, unitCost: Math.round(unit) });
    if (e) return e;
    wo.received += qty;
    postJournal(s, `fgr-${wo.id}-${wo.received}`, "FG receipt", wo.id, [{ account: "1330 Inventory finished goods", dr: qty * unit, cr: 0 }, { account: "1320 Work in progress", dr: 0, cr: qty * unit }]);
    if (wo.received === good) {
      wo.abnormalLoss = Math.round(abnormal * costPerTotal);
      if (wo.abnormalLoss > 0) postJournal(s, `loss-${wo.id}`, "Abnormal rejects", `${wo.id}: ${abnormal} CTN above ${bom.rejectStdPct}% standard`, [{ account: "6200 Production loss", dr: wo.abnormalLoss, cr: 0 }, { account: "1320 Work in progress", dr: 0, cr: wo.abnormalLoss }]);
      wo.status = "closed";
    }
    audit(s, u, "FG received into quarantine", wo.id, `${qty} CTN`);
  },

  // ---------- Quality ----------
  dispositionLot(s: ErpState, u: User, lotId: string, release: boolean): ActionResult {
    const d = deny(u, ["Quality Officer"], "release or reject lots"); if (d) return d;
    const l = s.lots.find(x => x.id === lotId)!;
    if (l.status !== "quarantine") return `Lot is ${l.status}.`;
    l.status = release ? "released" : "rejected";
    l.location = release ? (item(s, l.itemId).type === "FG" ? "FG-STAGE" : "RM-STAGE") : "SCRAP-HOLD";
    audit(s, u, release ? "Lot released" : "Lot rejected", l.lotNo);
  },
  holdLot(s: ErpState, u: User, lotId: string): ActionResult {
    const d = deny(u, ["Quality Officer"], "hold lots"); if (d) return d;
    const l = s.lots.find(x => x.id === lotId)!;
    if (l.status !== "released") return `Lot is ${l.status}.`;
    l.status = "quarantine";
    audit(s, u, "Lot put on hold", l.lotNo);
  },

  // ---------- Purchasing ----------
  createRequisition(s: ErpState, u: User, itemId: string, qty: number): ActionResult {
    const d = deny(u, ["PPIC", "Warehouse", "Purchasing"], "create material requests"); if (d) return d;
    if (!(qty > 0)) return "Quantity must be positive.";
    s.requisitions.unshift({ id: nextId(s, "MR"), itemId, qty, requiredDate: addDays(s.today, item(s, itemId).leadTimeDays), status: "submitted", requestedBy: u.id, source: "Manual" });
    audit(s, u, "Material request", item(s, itemId).sku, `${qty}`);
  },
  decideRequisition(s: ErpState, u: User, id: string, approve: boolean): ActionResult {
    const d = deny(u, ["Purchasing Manager", "PPIC"], "approve material requests"); if (d) return d;
    const r = s.requisitions.find(x => x.id === id)!;
    if (r.requestedBy === u.id) return "A requester cannot approve their own request.";
    if (r.status !== "submitted") return `Request is ${r.status}.`;
    r.status = approve ? "approved" : "rejected"; r.approvedBy = u.id;
    audit(s, u, approve ? "Material request approved" : "Material request rejected", r.id);
  },
  createSupplierPO(s: ErpState, u: User, reqId: string, supplierId: string, price: number): ActionResult {
    const d = deny(u, ["Purchasing"], "prepare supplier POs"); if (d) return d;
    const r = s.requisitions.find(x => x.id === reqId)!;
    if (r.status !== "approved") return "Only approved requests can be ordered.";
    if (!(price > 0)) return "Price is required.";
    s.supplierPOs.unshift({ id: nextId(s, "SPO"), supplierId, lines: [{ itemId: r.itemId, qty: r.qty, price, received: 0 }], status: "draft", createdBy: u.id, expected: r.requiredDate, mode: "internal" });
    r.status = "ordered";
    audit(s, u, "Supplier PO drafted", r.id);
  },
  approveSupplierPO(s: ErpState, u: User, id: string): ActionResult {
    const d = deny(u, ["Purchasing Manager"], "approve supplier POs"); if (d) return d;
    const p = s.supplierPOs.find(x => x.id === id)!;
    if (p.createdBy === u.id) return "The preparer cannot approve their own supplier PO.";
    if (p.status !== "draft") return `PO is ${p.status}.`;
    p.status = "released"; p.approvedBy = u.id;
    audit(s, u, "Supplier PO approved and released", p.id);
  },
  cancelSupplierPO(s: ErpState, u: User, id: string): ActionResult {
    const d = deny(u, ["Purchasing Manager"], "cancel supplier POs"); if (d) return d;
    const p = s.supplierPOs.find(x => x.id === id)!;
    if (p.lines.some(l => l.received > 0)) return "Received POs cannot be cancelled; close the remainder instead.";
    p.status = "cancelled";
    audit(s, u, "Supplier PO cancelled", p.id);
  },

  // ---------- Receiving ----------
  receiveSupplier(s: ErpState, u: User, spoId: string, qty: number, rejected: number): ActionResult {
    const d = deny(u, ["Warehouse"], "post goods receipts"); if (d) return d;
    const p = s.supplierPOs.find(x => x.id === spoId)!;
    if (!["released", "partly received"].includes(p.status)) return `Supplier PO is ${p.status}.`;
    const line = p.lines[0];
    const open = line.qty - line.received;
    if (!(qty > 0) || rejected < 0 || rejected > qty) return "Received must be positive and rejected between 0 and received.";
    if (qty > open * (1 + s.settings.receiptTolerancePct / 100)) return `Receipt exceeds open quantity ${fmt(open)} plus ${s.settings.receiptTolerancePct}% tolerance.`;
    const it = item(s, line.itemId);
    const acc = qty - rejected;
    const lotId = `l${s.seq + 1}`; s.seq += 1;
    s.lots.push({ id: lotId, itemId: it.id, lotNo: `${it.sku.slice(0, 2)}-${s.today.slice(2, 10).replace(/-/g, "")}-${s.seq}`, location: "RM-QC", qty: 0, status: "quarantine", produced: s.today, expiry: addDays(s.today, it.shelfLifeDays), source: p.id });
    const e = move(s, { itemId: it.id, lotId, qty: acc, type: "Supplier receipt (quarantine)", ref: p.id, key: `gr-${p.id}-${line.received}`, unitCost: line.price });
    if (e) return e;
    if (rejected > 0) {
      const rl = `l${s.seq + 1}`; s.seq += 1;
      s.lots.push({ id: rl, itemId: it.id, lotNo: `REJ-${s.seq}`, location: "RETURN", qty: rejected, status: "rejected", produced: s.today, expiry: addDays(s.today, it.shelfLifeDays), source: p.id });
    }
    const gr = { id: nextId(s, "GR"), supplierPoId: p.id, itemId: it.id, qty, rejected, unitCost: line.price, lotId, date: s.today, billed: false };
    s.receipts.unshift(gr);
    line.received += qty;
    p.status = line.received >= line.qty ? "received" : "partly received";
    postJournal(s, `gr-${gr.id}`, "Goods receipt", `${gr.id} ${it.sku}`, [{ account: "1310 Inventory raw material", dr: acc * line.price, cr: 0 }, { account: "2110 Goods received not invoiced", dr: 0, cr: acc * line.price }]);
    audit(s, u, "Goods received", gr.id, `${qty} received, ${rejected} rejected, ${acc} to quarantine`);
  },

  // ---------- AR ----------
  createInvoice(s: ErpState, u: User, shId: string): ActionResult {
    const d = deny(u, ["Finance AR"], "create invoices"); if (d) return d;
    const sh = s.shipments.find(x => x.id === shId)!;
    if (!["dispatched", "delivered"].includes(sh.status)) return "Invoice only from an actual dispatch.";
    if (s.invoices.some(i => i.shipmentId === sh.id)) return "This dispatch is already invoiced.";
    if (!s.journals.some(j => j.key === `rev-${sh.id}`)) return "Control has not transferred yet (customer terms: at delivery). Record delivery first.";
    const po = s.pos.find(p => p.id === sh.poId)!;
    const c = cust(s, po.customerId);
    const net = poNet(s, po.lines);
    s.invoices.unshift({ id: `INV-${s.today.slice(2, 4)}${s.today.slice(5, 7)}-${++s.seq}`, shipmentId: sh.id, customerId: c.id, date: s.today, due: addDays(s.today, c.termsDays), net, vat: Math.round(net * s.settings.vatPct / 100), status: "draft", paid: 0, taxInvoice: "pending" });
    audit(s, u, "Invoice drafted", sh.id, idr(net));
  },
  postInvoice(s: ErpState, u: User, id: string): ActionResult {
    const d = deny(u, ["Finance AR"], "post invoices"); if (d) return d;
    const inv = s.invoices.find(i => i.id === id)!;
    if (inv.status !== "draft") return "Invoice already posted.";
    const e = postJournal(s, `inv-${inv.id}`, "Customer invoice", inv.id, [
      { account: "1200 Accounts receivable", dr: inv.net + inv.vat, cr: 0 },
      { account: "1210 Unbilled receivable", dr: 0, cr: inv.net },
      { account: "2310 Output VAT payable", dr: 0, cr: inv.vat },
    ], inv.date);
    if (e) return e;
    inv.status = "posted";
    const sh = s.shipments.find(x => x.id === inv.shipmentId);
    if (sh && sh.status === "delivered") sh.status = "completed";
    audit(s, u, "Invoice posted", inv.id);
  },
  submitTaxInvoice(s: ErpState, u: User, id: string): ActionResult {
    const d = deny(u, ["Finance AR"], "submit tax invoices"); if (d) return d;
    const inv = s.invoices.find(i => i.id === id)!;
    if (inv.status === "draft") return "Post the invoice first.";
    if (inv.taxInvoice === "approved") return;
    inv.taxInvoice = "approved";
    inv.taxNo = `0400${s.today.slice(2, 4)}${String(s.seq + 1).padStart(5, "0")}`; s.seq += 1;
    audit(s, u, "Tax invoice approved (simulated DJP)", inv.id, inv.taxNo);
  },
  receivePayment(s: ErpState, u: User, id: string, amount: number): ActionResult {
    const d = deny(u, ["Finance AR"], "allocate receipts"); if (d) return d;
    const inv = s.invoices.find(i => i.id === id)!;
    if (inv.status === "draft" || inv.status === "paid") return `Invoice is ${inv.status}.`;
    const out = inv.net + inv.vat - inv.paid;
    if (!(amount > 0)) return "Amount must be positive.";
    const applied = Math.min(amount, out);
    inv.paid += applied;
    inv.status = inv.paid >= inv.net + inv.vat ? "paid" : "partly paid";
    const lines: JournalLine[] = [{ account: "1100 Bank", dr: amount, cr: 0 }, { account: "1200 Accounts receivable", dr: 0, cr: applied }];
    if (amount > applied) lines.push({ account: "2150 Unapplied customer credit", dr: 0, cr: amount - applied });
    postJournal(s, `rcpt-${inv.id}-${inv.paid}-${s.seq}`, "Customer receipt", inv.id, lines);
    audit(s, u, "Receipt allocated", inv.id, idr(amount));
  },

  // ---------- AP ----------
  createBill(s: ErpState, u: User, receiptId: string, ref: string, amount: number): ActionResult {
    const d = deny(u, ["Finance AP"], "capture supplier bills"); if (d) return d;
    const gr = s.receipts.find(r => r.id === receiptId)!;
    const p = s.supplierPOs.find(x => x.id === gr.supplierPoId)!;
    if (!ref.trim()) return "Supplier invoice reference is required.";
    if (s.bills.some(b => b.supplierId === p.supplierId && b.ref.toLowerCase() === ref.trim().toLowerCase())) return `Duplicate supplier invoice ${ref} blocked.`;
    if (gr.billed) return "Receipt already billed.";
    const expected = (gr.qty - gr.rejected) * gr.unitCost;
    const diff = Math.abs(amount - expected) / expected;
    const ok = diff <= s.settings.matchTolerancePct / 100;
    s.bills.unshift({ id: nextId(s, "BL"), supplierId: p.supplierId, ref: ref.trim(), receiptIds: [gr.id], amount, vat: Math.round(amount * s.settings.vatPct / 100), status: ok ? "approved" : "match review", match: ok ? `3-way match OK (${(diff * 100).toFixed(1)}%)` : `Mismatch ${(diff * 100).toFixed(1)}% vs receipt ${idr(expected)}`, due: addDays(s.today, s.suppliers.find(x => x.id === p.supplierId)!.termsDays), paid: 0 });
    gr.billed = true;
    audit(s, u, "Supplier bill captured", ref, ok ? "matched" : "match exception");
  },
  approveBillException(s: ErpState, u: User, id: string): ActionResult {
    const d = deny(u, ["Finance Manager"], "approve match exceptions"); if (d) return d;
    const b = s.bills.find(x => x.id === id)!;
    if (b.status !== "match review") return "Bill is not in match review.";
    b.status = "approved"; b.match += ` | exception approved by ${u.name}`;
    audit(s, u, "Match exception approved", b.id);
  },
  postBill(s: ErpState, u: User, id: string): ActionResult {
    const d = deny(u, ["Finance AP"], "post bills"); if (d) return d;
    const b = s.bills.find(x => x.id === id)!;
    if (b.status !== "approved") return `Bill is ${b.status}.`;
    const gr = s.receipts.find(r => r.id === b.receiptIds[0])!;
    const accrual = (gr.qty - gr.rejected) * gr.unitCost;
    const e = postJournal(s, `bill-${b.id}`, "Supplier bill", b.ref, [
      { account: "2110 Goods received not invoiced", dr: accrual, cr: 0 },
      { account: "5100 Purchase price variance", dr: b.amount - accrual, cr: 0 },
      { account: "1410 Input VAT", dr: b.vat, cr: 0 },
      { account: "2100 Accounts payable", dr: 0, cr: b.amount + b.vat },
    ].map(l => (l.dr < 0 ? { ...l, cr: -l.dr, dr: 0 } : l)));
    if (e) return e;
    b.status = "posted";
    audit(s, u, "Bill posted", b.id);
  },
  proposePayment(s: ErpState, u: User, billId: string): ActionResult {
    const d = deny(u, ["Finance AP"], "propose payments"); if (d) return d;
    const b = s.bills.find(x => x.id === billId)!;
    if (b.status !== "posted") return "Only posted bills can be paid.";
    if (s.payments.some(p => p.billIds.includes(b.id) && p.status !== "failed")) return "A payment is already in progress for this bill.";
    if (!s.suppliers.find(x => x.id === b.supplierId)!.bankVerified) return "Supplier bank details are not independently verified.";
    s.payments.unshift({ id: nextId(s, "PAY"), billIds: [b.id], amount: b.amount + b.vat - b.paid, status: "proposed", maker: u.id });
    audit(s, u, "Payment proposed", b.id);
  },
  approvePayment(s: ErpState, u: User, id: string): ActionResult {
    const d = deny(u, ["Finance Manager"], "approve payments"); if (d) return d;
    const p = s.payments.find(x => x.id === id)!;
    if (p.maker === u.id) return "Payment maker and approver must differ.";
    if (p.status !== "proposed") return `Payment is ${p.status}.`;
    p.status = "approved"; p.approver = u.id;
    audit(s, u, "Payment approved", p.id);
  },
  releasePayment(s: ErpState, u: User, id: string, fail: boolean): ActionResult {
    const d = deny(u, ["Finance Manager", "Finance AP"], "release payments"); if (d) return d;
    const p = s.payments.find(x => x.id === id)!;
    if (p.status !== "approved") return `Payment is ${p.status}.`;
    if (fail) { p.status = "failed"; audit(s, u, "Payment failed at bank", p.id, "Bills remain unpaid"); return; }
    p.status = "confirmed";
    for (const bid of p.billIds) { const b = s.bills.find(x => x.id === bid)!; b.paid = b.amount + b.vat; b.status = "paid"; }
    postJournal(s, `pay-${p.id}`, "Supplier payment", p.id, [{ account: "2100 Accounts payable", dr: p.amount, cr: 0 }, { account: "1100 Bank", dr: 0, cr: p.amount }]);
    audit(s, u, "Payment confirmed", p.id, idr(p.amount));
  },

  // ---------- GL ----------
  closePeriod(s: ErpState, u: User, id: string): ActionResult {
    const d = deny(u, ["Finance Manager"], "close periods"); if (d) return d;
    const p = s.periods.find(x => x.id === id)!;
    if (p.status === "closed") return "Period already closed.";
    const issues = closeChecklist(s, id).filter(c => !c.ok);
    if (issues.length) return `Close blocked: ${issues.map(i => i.label).join("; ")}.`;
    p.status = "closed";
    audit(s, u, "Period closed", id);
  },
  reopenPeriod(s: ErpState, u: User, id: string): ActionResult {
    const d = deny(u, ["Finance Manager"], "reopen periods"); if (d) return d;
    const p = s.periods.find(x => x.id === id)!;
    p.status = "open";
    audit(s, u, "Period reopened", id);
  },

  // ---------- HR ----------
  decideLeave(s: ErpState, u: User, id: string, approve: boolean): ActionResult {
    const d = deny(u, ["HR Payroll Officer"], "approve leave"); if (d) return d;
    const l = s.leaves.find(x => x.id === id)!;
    l.status = approve ? "approved" : "rejected";
    audit(s, u, approve ? "Leave approved" : "Leave rejected", l.id);
  },
  requestLeave(s: ErpState, u: User, from: string, days: number): ActionResult {
    const d = deny(u, ["Employee"], "request own leave"); if (d) return d;
    if (!u.employeeId) return "No employee record linked.";
    if (!(days > 0)) return "Days must be positive.";
    s.leaves.unshift({ id: nextId(s, "LV"), employeeId: u.employeeId, from, to: addDays(from, days - 1), days, status: "submitted" });
    audit(s, u, "Leave requested", u.employeeId, `${days} days`);
  },
  runPayroll(s: ErpState, u: User, period: string): ActionResult {
    const d = deny(u, ["HR Payroll Officer"], "calculate payroll"); if (d) return d;
    const ex = s.payrolls.find(p => p.period === period);
    if (ex && ex.status !== "calculated") return "Approved payroll is locked; use a supplemental run for corrections.";
    const results: PayrollResult[] = s.employees.map(e => payslip(e.salary, e.ptkp, e.id));
    if (ex) { ex.results = results; ex.preparedBy = u.id; }
    else s.payrolls.unshift({ id: nextId(s, "PR"), period, status: "calculated", results, preparedBy: u.id });
    audit(s, u, "Payroll calculated", period);
  },
  approvePayroll(s: ErpState, u: User, id: string): ActionResult {
    const d = deny(u, ["Finance Manager"], "approve payroll (HR and Finance reviewer)"); if (d) return d;
    const p = s.payrolls.find(x => x.id === id)!;
    if (p.preparedBy === u.id) return "Preparer cannot approve payroll.";
    if (p.status !== "calculated") return `Payroll is ${p.status}.`;
    p.status = "approved"; p.approvedBy = u.id;
    const g = p.results.reduce((a, r) => a + r.gross, 0), er = p.results.reduce((a, r) => a + r.bpjsEmployer, 0);
    const tax = p.results.reduce((a, r) => a + r.pph21, 0), bpjs = p.results.reduce((a, r) => a + r.bpjsEmployee + r.bpjsEmployer, 0), net = p.results.reduce((a, r) => a + r.net, 0);
    postJournal(s, `payroll-${p.id}`, "Payroll", p.period, [
      { account: "6000 Salaries and wages", dr: g, cr: 0 }, { account: "6010 Employer BPJS", dr: er, cr: 0 },
      { account: "2410 Net pay payable", dr: 0, cr: net }, { account: "2420 PPh 21 payable", dr: 0, cr: tax }, { account: "2430 BPJS payable", dr: 0, cr: bpjs },
    ], `${p.period}-28` > s.today ? s.today : `${p.period}-28`);
    p.status = "posted";
    audit(s, u, "Payroll approved and posted", p.period);
  },

  // ---------- Maintenance ----------
  reportBreakdown(s: ErpState, u: User, eqId: string, hours: number, note: string): ActionResult {
    const d = deny(u, ["Maintenance Officer", "Head Production"], "report breakdowns"); if (d) return d;
    const e = s.equipment.find(x => x.id === eqId)!;
    e.status = "down"; e.downtimeHours += hours;
    s.maintOrders.unshift({ id: nextId(s, "MO"), equipmentId: eqId, kind: "breakdown", status: "reported", hours, date: s.today, note });
    audit(s, u, "Breakdown reported", e.name, `${hours} h`);
  },
  completeService(s: ErpState, u: User, moId: string): ActionResult {
    const d = deny(u, ["Maintenance Officer"], "complete service"); if (d) return d;
    const m = s.maintOrders.find(x => x.id === moId)!;
    m.status = "completed";
    const e = s.equipment.find(x => x.id === m.equipmentId)!;
    e.status = "running"; e.lastService = s.today;
    audit(s, u, "Service completed", e.name);
  },
  schedulePM(s: ErpState, u: User, eqId: string): ActionResult {
    const d = deny(u, ["Maintenance Officer"], "schedule maintenance"); if (d) return d;
    const e = s.equipment.find(x => x.id === eqId)!;
    s.maintOrders.unshift({ id: nextId(s, "MO"), equipmentId: eqId, kind: "preventive", status: "assigned", hours: 4, date: s.today, note: "Preventive service" });
    e.status = "maintenance"; e.downtimeHours += 4;
    audit(s, u, "Preventive maintenance scheduled", e.name);
  },
  runDepreciation(s: ErpState, u: User, period: string): ActionResult {
    const d = deny(u, ["Finance Accountant"], "run depreciation"); if (d) return d;
    let total = 0;
    for (const a of s.assets) {
      if (a.depreciated.includes(period) || a.inService > `${period}-31`) continue; // once per asset per period
      a.depreciated.push(period);
      total += Math.round(a.cost / a.lifeMonths);
    }
    if (!total) return `Depreciation for ${period} already posted.`;
    postJournal(s, `dep-${period}`, "Depreciation", period, [{ account: "6300 Depreciation expense", dr: total, cr: 0 }, { account: "1590 Accumulated depreciation", dr: 0, cr: total }], `${period}-28` > s.today ? s.today : `${period}-28`);
    audit(s, u, "Depreciation posted", period, idr(total));
  },
};

export type Actions = typeof actions;

// ---------- calculations used by screens ----------
export function materialFor(s: ErpState, bomId: string, ctn: number) {
  const b = s.boms.find(x => x.id === bomId)!;
  return b.lines.map(l => {
    const raw = (ctn / b.baseCtn) * l.qty * (1 + b.lossPct / 100);
    const whole = item(s, l.itemId).unit === "PCS"; // approved rounding: count units round up, weights to 0.01
    return { itemId: l.itemId, qty: whole ? Math.ceil(raw) : Math.ceil(raw * 100) / 100 };
  });
}

export function computeMrp(s: ErpState) {
  const openPOs = s.pos.filter(p => p.status === "accepted" && !["dispatched", "delivered", "completed", "cancelled"].includes(s.shipments.find(x => x.poId === p.id)?.status ?? ""));
  const fgIds = [...new Set(openPOs.flatMap(p => p.lines.map(l => l.itemId)))];
  const fg = fgIds.map(itemId => {
    const lines = openPOs.flatMap(p => p.lines.filter(l => l.itemId === itemId).map(l => ({ po: p, ctn: l.ctn })));
    const demand = lines.reduce((a, l) => a + l.ctn, 0);
    const allocated = lines.reduce((a, l) => a + reservedFor(s, l.po.id, itemId), 0);
    const openSupply = s.workOrders.filter(w => w.itemId === itemId && ["released", "in production", "output submitted"].includes(w.status))
      .reduce((a, w) => a + (w.status === "output submitted" ? w.totalOut - w.rejects - w.received : w.planCtn), 0);
    const planned = s.workOrders.filter(w => w.itemId === itemId && w.status === "planned").reduce((a, w) => a + w.planCtn, 0);
    const net = Math.max(0, demand - allocated - openSupply - planned);
    const perPo = lines.map(l => ({ po: l.po.id, ctn: l.ctn, allocated: reservedFor(s, l.po.id, itemId) }));
    return { itemId, demand, allocated, openSupply, planned, net, poIds: lines.map(l => l.po.id), due: lines.map(l => s.shipments.find(x => x.poId === l.po.id)?.confirmed ?? l.po.requestedDate).sort()[0], perPo };
  });
  const rmIds = s.items.filter(i => i.type === "RM").map(i => i.id);
  const gross = new Map<string, number>();
  for (const w of s.workOrders.filter(w => ["planned", "released"].includes(w.status) && !w.issued)) for (const m of materialFor(s, w.bomId, w.planCtn)) gross.set(m.itemId, (gross.get(m.itemId) ?? 0) + m.qty);
  for (const f of fg) if (f.net > 0) { const b = s.boms.find(x => x.itemId === f.itemId && x.status === "effective"); if (b) for (const m of materialFor(s, b.id, f.net)) gross.set(m.itemId, (gross.get(m.itemId) ?? 0) + m.qty); }
  const rm = rmIds.map(itemId => {
    const it = item(s, itemId);
    const g = Math.round((gross.get(itemId) ?? 0) * 100) / 100;
    const available = releasedOnHand(s, itemId);
    const incoming = s.supplierPOs.filter(p => ["released", "partly received"].includes(p.status) && p.expected >= s.today).flatMap(p => p.lines).filter(l => l.itemId === itemId).reduce((a, l) => a + l.qty - l.received, 0)
      + s.requisitions.filter(r => r.itemId === itemId && ["submitted", "approved"].includes(r.status)).reduce((a, r) => a + r.qty, 0);
    const net = Math.max(0, g + it.safetyStock - available - incoming);
    const proposal = net > 0 ? Math.ceil(Math.max(net, it.moq) / it.multiple) * it.multiple : 0;
    return { itemId, gross: g, safety: it.safetyStock, available, incoming, net: Math.round(net * 100) / 100, proposal };
  });
  return { fg, rm };
}

export function closeChecklist(s: ErpState, period: string) {
  const inP = (d: string) => periodOf(d) === period;
  const tb = trialBalance(s, period);
  const bal = (a: string) => tb.find(x => x[0] === a)?.[1] ?? 0;
  const dr = s.journals.filter(j => j.period <= period).flatMap(j => j.lines).reduce((a, l) => a + l.dr - l.cr, 0);
  const stockVal = s.lots.filter(l => l.status !== "rejected").reduce((a, l) => a + l.qty * item(s, l.itemId).avgCost, 0);
  return [
    { label: "Trial balance balances", ok: dr === 0, detail: `difference ${fmt(dr)}` },
    { label: "No draft invoices for dispatched goods", ok: !s.invoices.some(i => i.status === "draft" && inP(i.date)), detail: `${s.invoices.filter(i => i.status === "draft").length} draft` },
    { label: "No unapproved supplier bills", ok: !s.bills.some(b => b.status === "match review"), detail: `${s.bills.filter(b => b.status === "match review").length} in match review` },
    { label: "No pending count adjustments", ok: !s.counts.some(c => c.status === "counted"), detail: `${s.counts.filter(c => c.status === "counted").length} pending` },
    { label: "Payments not stuck in approved", ok: !s.payments.some(p => p.status === "approved"), detail: `${s.payments.filter(p => p.status === "approved").length} approved, not released` },
    { label: "Depreciation posted", ok: s.assets.every(a => a.depreciated.includes(period) || a.inService > `${period}-31`), detail: "" },
    { label: "Inventory subledger vs GL (info)", ok: true, detail: `stock ${idr(stockVal)} vs GL ${idr(bal("1310 Inventory raw material") + bal("1330 Inventory finished goods"))}` },
  ];
}

// Illustrative payroll calculation. Rates are placeholders to be validated by the payroll owner (spec section 28).
export function payslip(salary: number, ptkp: string, employeeId: string): PayrollResult {
  const capKes = 12000000, capJP = 10547400;
  const kesEe = Math.round(Math.min(salary, capKes) * 0.01), kesEr = Math.round(Math.min(salary, capKes) * 0.04);
  const jhtEe = Math.round(salary * 0.02), jhtEr = Math.round(salary * 0.037);
  const jpEe = Math.round(Math.min(salary, capJP) * 0.01), jpEr = Math.round(Math.min(salary, capJP) * 0.02);
  const jkk = Math.round(salary * 0.0024), jkm = Math.round(salary * 0.003);
  const bpjsEmployee = kesEe + jhtEe + jpEe;
  const bpjsEmployer = kesEr + jhtEr + jpEr + jkk + jkm;
  const taxable = salary + kesEr + jkk + jkm; // gross for TER
  const cat = ["TK/0", "TK/1", "K/0"].includes(ptkp) ? "A" : ["TK/2", "TK/3", "K/1", "K/2"].includes(ptkp) ? "B" : "C";
  const ladder: [number, number][] = cat === "A"
    ? [[5400000, 0], [5650000, 0.0025], [5950000, 0.005], [6300000, 0.0075], [6750000, 0.01], [7500000, 0.0125], [8550000, 0.015], [9650000, 0.0175], [10050000, 0.02], [10350000, 0.0225], [10700000, 0.025], [Infinity, 0.03]]
    : cat === "B"
      ? [[6200000, 0], [6500000, 0.0025], [6850000, 0.005], [7300000, 0.0075], [9200000, 0.01], [10750000, 0.015], [11250000, 0.02], [Infinity, 0.025]]
      : [[6600000, 0], [6950000, 0.0025], [7350000, 0.005], [7800000, 0.0075], [8850000, 0.01], [9800000, 0.0125], [10950000, 0.015], [Infinity, 0.02]];
  const rate = ladder.find(([max]) => taxable <= max)![1];
  const pph21 = Math.round(taxable * rate);
  return { employeeId, gross: salary, bpjsEmployee, bpjsEmployer, pph21, net: salary - bpjsEmployee - pph21 };
}

export function cbm(it: Item) {
  return it.dims ? (it.dims.l * it.dims.w * it.dims.h) / 1000000 : 0;
}

export function capacityHours(s: ErpState, line: string) {
  const base = 8 * 2 * 22; // 2 shifts x 8h x 22 days
  const down = s.equipment.filter(e => e.line === line).reduce((a, e) => a + e.downtimeHours, 0);
  return { base, down, available: base - down };
}

export type WO = WorkOrder;
