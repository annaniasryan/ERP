import type { ErpState, Item, Lot, Invoice, Decision } from "./types";

// Fictional demo company data. Business date is fixed so the demo is repeatable.
export const TODAY = "2026-09-30";

const items: Item[] = [
  { id: "fg1", sku: "KT-ORI-24", name: "Keripik Talas Original 24 x 100 g", type: "FG", unit: "CTN", dims: { l: 40, w: 30, h: 25 }, weightKg: 2.8, shelfLifeDays: 180, avgCost: 118000, safetyStock: 0, moq: 1, multiple: 1, leadTimeDays: 3, active: true },
  { id: "fg2", sku: "KT-BAL-24", name: "Keripik Talas Balado 24 x 100 g", type: "FG", unit: "CTN", dims: { l: 40, w: 30, h: 25 }, weightKg: 2.9, shelfLifeDays: 180, avgCost: 124000, safetyStock: 0, moq: 1, multiple: 1, leadTimeDays: 3, active: true },
  { id: "fg3", sku: "KP-MNS-12", name: "Keripik Pisang Manis 12 x 200 g", type: "FG", unit: "CTN", dims: { l: 45, w: 32, h: 28 }, weightKg: 2.6, shelfLifeDays: 150, avgCost: 96000, safetyStock: 0, moq: 1, multiple: 1, leadTimeDays: 3, active: true },
  { id: "rm1", sku: "RM-TALAS", name: "Talas segar", type: "RM", unit: "KG", shelfLifeDays: 14, avgCost: 9000, safetyStock: 200, moq: 200, multiple: 25, leadTimeDays: 3, active: true },
  { id: "rm2", sku: "RM-MINYAK", name: "Minyak goreng", type: "RM", unit: "L", shelfLifeDays: 365, avgCost: 17500, safetyStock: 100, moq: 200, multiple: 20, leadTimeDays: 5, active: true },
  { id: "rm3", sku: "RM-BALADO", name: "Bumbu balado", type: "RM", unit: "KG", shelfLifeDays: 270, avgCost: 62000, safetyStock: 20, moq: 25, multiple: 5, leadTimeDays: 7, active: true },
  { id: "rm4", sku: "RM-PISANG", name: "Pisang kepok", type: "RM", unit: "KG", shelfLifeDays: 10, avgCost: 7500, safetyStock: 150, moq: 150, multiple: 25, leadTimeDays: 2, active: true },
  { id: "rm5", sku: "PK-POUCH", name: "Pouch printed 100 g", type: "RM", unit: "PCS", shelfLifeDays: 730, avgCost: 650, safetyStock: 2000, moq: 5000, multiple: 1000, leadTimeDays: 14, active: true },
  { id: "rm6", sku: "PK-CARTON", name: "Master carton", type: "RM", unit: "PCS", shelfLifeDays: 730, avgCost: 4200, safetyStock: 100, moq: 500, multiple: 100, leadTimeDays: 10, active: true },
];

const lots: Lot[] = [
  { id: "l1", itemId: "fg1", lotNo: "FG-KT-2609A", location: "FG-A1", qty: 150, status: "released", produced: "2026-09-10", expiry: "2027-03-09", source: "WO-0998" },
  { id: "l2", itemId: "fg1", lotNo: "FG-KT-2605B", location: "FG-A2", qty: 40, status: "released", produced: "2026-05-02", expiry: "2026-10-29", source: "WO-0921" },
  { id: "l3", itemId: "fg2", lotNo: "FG-KB-2618A", location: "FG-B1", qty: 90, status: "released", produced: "2026-09-18", expiry: "2027-03-17", source: "WO-1003" },
  { id: "l4", itemId: "fg3", lotNo: "FG-KP-2627A", location: "QC-HOLD", qty: 60, status: "quarantine", produced: "2026-09-27", expiry: "2027-02-24", source: "WO-1007" },
  { id: "l5", itemId: "fg3", lotNo: "FG-KP-2615A", location: "FG-C1", qty: 45, status: "released", produced: "2026-09-15", expiry: "2027-02-12", source: "WO-1001" },
  { id: "l6", itemId: "rm1", lotNo: "RM-TL-2628", location: "RM-COLD", qty: 420, status: "released", produced: "2026-09-28", expiry: "2026-10-12", source: "GR-0311" },
  { id: "l7", itemId: "rm2", lotNo: "RM-MY-2609", location: "RM-A1", qty: 380, status: "released", produced: "2026-09-09", expiry: "2027-09-09", source: "GR-0302" },
  { id: "l8", itemId: "rm3", lotNo: "RM-BL-2701", location: "RM-A2", qty: 18, status: "released", produced: "2026-07-01", expiry: "2027-03-28", source: "GR-0277" },
  { id: "l9", itemId: "rm4", lotNo: "RM-PS-2629", location: "RM-COLD", qty: 160, status: "released", produced: "2026-09-29", expiry: "2026-10-09", source: "GR-0313" },
  { id: "l10", itemId: "rm5", lotNo: "PK-PO-2608", location: "PK-01", qty: 9000, status: "released", produced: "2026-08-08", expiry: "2028-08-07", source: "GR-0290" },
  { id: "l11", itemId: "rm6", lotNo: "PK-CT-2608", location: "PK-02", qty: 420, status: "released", produced: "2026-08-08", expiry: "2028-08-07", source: "GR-0291" },
];

const invoices: Invoice[] = [
  { id: "INV-2608-014", shipmentId: "SH-0140", customerId: "c3", date: "2026-07-26", due: "2026-08-25", net: 18600000, vat: 2046000, status: "posted", paid: 0, taxInvoice: "approved", taxNo: "04002600014" },
  { id: "INV-2609-021", shipmentId: "SH-0151", customerId: "c1", date: "2026-09-19", due: "2026-10-19", net: 29500000, vat: 3245000, status: "partly paid", paid: 15000000, taxInvoice: "approved", taxNo: "04002600021" },
];

const decisions: Decision[] = [
  ["Legal entity and warehouse structure", "One company; warehouses, locations and bins as surveyed", "Business owner", "Phase 1"],
  ["Approval thresholds and escalation", "Amount bands per document type; escalation ends at business owner", "Finance Manager", "Phase 1"],
  ["Sensitive role list and Security Approvers", "As listed in spec section 3", "Business owner", "Phase 1"],
  ["Credit policy", "Limit per customer; hold when exceeded or invoices overdue beyond 30 days; re-check at dispatch", "Finance Manager with Sales Manager", "Phase 1"],
  ["Price lock point", "Accepted PO version", "Sales Manager", "Phase 1"],
  ["Numbering and retention", "Per document type sequence; 10 year financial retention", "Finance Manager", "Phase 1"],
  ["Reservation priority", "Confirmed date, then acceptance time", "PPIC", "Phase 2"],
  ["Customer shelf life rule", "Product default set by Quality; customer overrides approved by Sales Manager", "Quality and Sales Manager", "Phase 2"],
  ["Mandatory quality checks", "All FG lots and listed critical raw materials", "Quality Officer", "Phase 2"],
  ["BOM loss convention", "Separate loss factor, not built into recipe", "PPIC", "Phase 2"],
  ["MRP parameters", "Lot for lot; FG make to order; RM safety stock and MOQ per item", "PPIC with Purchasing", "Phase 2"],
  ["Count method", "Cycle counts snapshot and reconcile; full counts lock locations", "Warehouse Manager", "Phase 2"],
  ["Inventory valuation and pools", "Moving weighted average by item and warehouse", "Finance Manager", "Phase 2"],
  ["Normal reject rate", "From BOM standard per product", "PPIC with Finance", "Phase 2"],
  ["Supplier PO mode", "External in Phase 2; decide internal or external for Phase 3", "Purchasing Manager", "Phase 3"],
  ["Revenue recognition and delivery terms", "Control transfer at dispatch unless customer terms say delivery; confirm under PSAK 72", "Finance Manager", "Phase 4"],
  ["Tax setup", "VAT, withholding and e-invoicing per spec section 28", "Finance with tax advisor", "Phase 4"],
  ["Exchange rate sources", "Bank Indonesia rates (JISDOR for US dollar) for accounting; Ministry of Finance rate for tax", "Finance Manager", "Phase 4"],
  ["Payroll rules", "Components, overtime, THR, PPh 21 TER, BPJS", "HR and Payroll Officer with Finance", "Phase 5"],
  ["Recovery targets", "1 hour recovery point; 8 hour recovery time", "Business owner", "Phase 6"],
].map(([decision, def, owner, phase], i) => ({ id: `D${String(i + 1).padStart(2, "0")}`, decision, def, owner, phase, status: "default" as const }));

export function makeSeed(): ErpState {
  const s: ErpState = {
    schema: 1,
    today: TODAY,
    seq: 2000,
    users: [
      { id: "u1", name: "Ryan (Super Admin)", role: "Super Admin" },
      { id: "u2", name: "Bu Ratna", role: "Executive Viewer" },
      { id: "u3", name: "Dewi", role: "Sales Admin" },
      { id: "u4", name: "Andi", role: "Account Executive" },
      { id: "u5", name: "Sari", role: "Account Executive" },
      { id: "u6", name: "Budi", role: "Sales Manager" },
      { id: "u7", name: "Joko", role: "PPIC" },
      { id: "u8", name: "Agus", role: "Head Production" },
      { id: "u9", name: "Rudi", role: "Warehouse" },
      { id: "u10", name: "Hendra", role: "Warehouse Manager" },
      { id: "u11", name: "Lina", role: "Purchasing" },
      { id: "u12", name: "Tono", role: "Purchasing Manager" },
      { id: "u13", name: "Maya", role: "Quality Officer" },
      { id: "u14", name: "Eko", role: "Shipment Division" },
      { id: "u15", name: "Fitri", role: "Finance AR" },
      { id: "u16", name: "Wati", role: "Finance AP" },
      { id: "u17", name: "Yusuf", role: "Finance Accountant" },
      { id: "u18", name: "Hartono", role: "Finance Manager" },
      { id: "u19", name: "Nina", role: "HR Payroll Officer" },
      { id: "u20", name: "Bambang", role: "Maintenance Officer" },
      { id: "u21", name: "Rina (employee)", role: "Employee", employeeId: "e4" },
      { id: "u22", name: "CV Sinar Jaya (portal)", role: "Distributor", customerId: "c1" },
      { id: "u23", name: "PT Maju Distribusi (portal)", role: "Distributor", customerId: "c2" },
    ],
    grants: [],
    audit: [],
    items,
    customers: [
      { id: "c1", code: "SJ-SBY", name: "CV Sinar Jaya", aeId: "u4", creditLimit: 150000000, termsDays: 30, deliveryTerms: "dispatch", minShelfPct: 60, npwp: "01.234.567.8-609.000", active: true },
      { id: "c2", code: "MD-JKT", name: "PT Maju Distribusi", aeId: "u5", creditLimit: 80000000, termsDays: 30, deliveryTerms: "delivery", minShelfPct: 70, npwp: "02.345.678.9-012.000", active: true },
      { id: "c3", code: "BS-MLG", name: "UD Berkah Sentosa", aeId: "u4", creditLimit: 40000000, termsDays: 30, deliveryTerms: "dispatch", minShelfPct: 50, npwp: "03.456.789.0-654.000", active: true },
    ],
    suppliers: [
      { id: "s1", name: "Tani Makmur Cooperative", termsDays: 14, bankVerified: true, currency: "IDR" },
      { id: "s2", name: "PT Sumber Minyak Nabati", termsDays: 30, bankVerified: true, currency: "IDR" },
      { id: "s3", name: "PT Kemasan Prima", termsDays: 30, bankVerified: false, currency: "IDR" },
    ],
    priceLists: [
      { id: "PL-2026-07", effective: "2026-07-01", status: "active", approvedBy: "u6", lines: [ { itemId: "fg1", price: 185000 }, { itemId: "fg2", price: 195000 }, { itemId: "fg3", price: 155000 } ] },
    ],
    lots,
    movements: [],
    reservations: [],
    pos: [
      { id: "PO-C-1041", customerId: "c1", ref: "SJ/PO/2609/118", requestedDate: "2026-10-08", status: "submitted", lines: [ { itemId: "fg1", ctn: 100 }, { itemId: "fg2", ctn: 40 } ], version: 1, history: [], submittedBy: "u22", created: "2026-09-29" },
      { id: "PO-C-1042", customerId: "c2", ref: "MD-7781", requestedDate: "2026-10-06", status: "submitted", lines: [ { itemId: "fg1", ctn: 100 } ], version: 1, history: [], submittedBy: "u23", created: "2026-09-29" },
      { id: "PO-C-1043", customerId: "c3", ref: "BS-0926", requestedDate: "2026-10-10", status: "submitted", lines: [ { itemId: "fg3", ctn: 60 } ], version: 1, history: [], submittedBy: "u3", created: "2026-09-30" },
      { id: "PO-C-1038", customerId: "c1", ref: "SJ/PO/2609/102", requestedDate: "2026-10-02", status: "accepted", lines: [ { itemId: "fg3", ctn: 40, price: 155000 } ], version: 1, history: [], priceListId: "PL-2026-07", acceptedBy: "u3", submittedBy: "u22", created: "2026-09-22" },
    ],
    revisions: [],
    shipments: [
      { id: "SH-0158", poId: "PO-C-1038", status: "confirmed", firstConfirmed: "2026-10-02", confirmed: "2026-10-02", dateChanges: [], picks: [] },
    ],
    boms: [
      { id: "BOM-fg1-2", itemId: "fg1", version: 2, baseCtn: 10, lossPct: 3, rejectStdPct: 2, status: "effective", lineRateCtnPerHour: 25, lines: [ { itemId: "rm1", qty: 30 }, { itemId: "rm2", qty: 6 }, { itemId: "rm5", qty: 240 }, { itemId: "rm6", qty: 10 } ] },
      { id: "BOM-fg2-1", itemId: "fg2", version: 1, baseCtn: 10, lossPct: 3, rejectStdPct: 2, status: "effective", lineRateCtnPerHour: 22, lines: [ { itemId: "rm1", qty: 30 }, { itemId: "rm2", qty: 6 }, { itemId: "rm3", qty: 1.5 }, { itemId: "rm5", qty: 240 }, { itemId: "rm6", qty: 10 } ] },
      { id: "BOM-fg3-1", itemId: "fg3", version: 1, baseCtn: 10, lossPct: 4, rejectStdPct: 2, status: "effective", lineRateCtnPerHour: 20, lines: [ { itemId: "rm4", qty: 28 }, { itemId: "rm2", qty: 5 }, { itemId: "rm5", qty: 120 }, { itemId: "rm6", qty: 10 } ] },
    ],
    workOrders: [
      { id: "WO-1009", itemId: "fg2", planCtn: 60, bomId: "BOM-fg2-1", line: "Line 1", status: "released", poIds: [], totalOut: 0, rejects: 0, received: 0, issued: false, materialCost: 0, abnormalLoss: 0, due: "2026-10-03" },
    ],
    requisitions: [],
    supplierPOs: [
      { id: "SPO-0412", supplierId: "s2", lines: [ { itemId: "rm2", qty: 400, price: 17500, received: 200 } ], status: "partly received", createdBy: "u11", approvedBy: "u12", expected: "2026-10-03", mode: "internal" },
    ],
    receipts: [],
    invoices,
    bills: [],
    payments: [],
    journals: [],
    periods: [ { id: "2026-08", status: "closed" }, { id: "2026-09", status: "open" }, { id: "2026-10", status: "open" } ],
    employees: [
      { id: "e1", name: "Agus Salim", division: "Production", type: "permanent", salary: 7500000, ptkp: "K/2", joined: "2019-03-01" },
      { id: "e2", name: "Siti Aminah", division: "Production", type: "contract", salary: 5200000, ptkp: "TK/0", joined: "2024-06-10" },
      { id: "e3", name: "Rudi Hartono", division: "Warehouse", type: "permanent", salary: 5800000, ptkp: "K/1", joined: "2021-01-04" },
      { id: "e4", name: "Rina Kusuma", division: "Finance", type: "permanent", salary: 9200000, ptkp: "TK/0", joined: "2022-08-15" },
      { id: "e5", name: "Dewi Lestari", division: "Sales", type: "permanent", salary: 8500000, ptkp: "K/0", joined: "2020-11-02" },
      { id: "e6", name: "Maya Putri", division: "Quality", type: "permanent", salary: 8000000, ptkp: "TK/1", joined: "2023-02-01" },
    ],
    leaves: [
      { id: "LV-031", employeeId: "e2", from: "2026-10-05", to: "2026-10-06", days: 2, status: "submitted" },
      { id: "LV-032", employeeId: "e4", from: "2026-10-12", to: "2026-10-12", days: 1, status: "submitted" },
    ],
    payrolls: [],
    equipment: [
      { id: "EQ-01", name: "Continuous fryer A", line: "Line 1", intervalDays: 30, lastService: "2026-09-05", status: "running", downtimeHours: 0 },
      { id: "EQ-02", name: "Slicer B", line: "Line 1", intervalDays: 14, lastService: "2026-09-10", status: "running", downtimeHours: 0 },
      { id: "EQ-03", name: "Pouch packing machine", line: "Line 2", intervalDays: 30, lastService: "2026-08-20", status: "running", downtimeHours: 0 },
    ],
    maintOrders: [],
    assets: [
      { id: "FA-001", name: "Continuous fryer A", cost: 420000000, lifeMonths: 96, inService: "2024-01-01", depreciated: ["2026-08"] },
      { id: "FA-002", name: "Pouch packing machine", cost: 310000000, lifeMonths: 96, inService: "2025-04-01", depreciated: ["2026-08"] },
      { id: "FA-003", name: "Delivery truck B 9012 KX", cost: 385000000, lifeMonths: 96, inService: "2023-07-01", depreciated: ["2026-08"] },
    ],
    leads: [
      { id: "LD-01", name: "Toko Oleh-Oleh Nusantara", owner: "u4", stage: "quotation", value: 45000000, followUp: "2026-10-02" },
      { id: "LD-02", name: "Minimarket Segar Group", owner: "u5", stage: "negotiation", value: 120000000, followUp: "2026-10-01" },
      { id: "LD-03", name: "Hotel Anggrek Catering", owner: "u5", stage: "qualified", value: 18000000, followUp: "2026-10-07" },
      { id: "LD-04", name: "Koperasi Karyawan Pabrik", owner: "u4", stage: "lead", value: 9000000, followUp: "2026-10-09" },
    ],
    targets: [
      { id: "T1", aeId: "u4", period: "2026-09", ctn: 600, revenue: 110000000 },
      { id: "T2", aeId: "u5", period: "2026-09", ctn: 400, revenue: 72000000 },
    ],
    decisions,
    counts: [],
    settings: { vatPct: 11, overdueHoldDays: 30, salesMgrCreditLimit: 25000000, receiptTolerancePct: 5, matchTolerancePct: 2 },
  };

  // Opening balances: stock value from lots, AR from open invoices, balanced against equity.
  const stockFG = lots.filter(l => items.find(i => i.id === l.itemId)!.type === "FG").reduce((a, l) => a + l.qty * items.find(i => i.id === l.itemId)!.avgCost, 0);
  const stockRM = lots.filter(l => items.find(i => i.id === l.itemId)!.type === "RM").reduce((a, l) => a + Math.round(l.qty * items.find(i => i.id === l.itemId)!.avgCost), 0);
  const ar = invoices.reduce((a, i) => a + i.net + i.vat - i.paid, 0);
  const bank = 650000000;
  const fa = s.assets.reduce((a, x) => a + x.cost, 0);
  const accDep = s.assets.reduce((a, x) => {
    const [y, m] = x.inService.split("-").map(Number);
    const months = (2026 - y) * 12 + (8 - m) + 1; // through Aug 2026
    return a + Math.round((x.cost / x.lifeMonths) * months);
  }, 0);
  const debit = stockFG + stockRM + ar + bank + fa;
  s.journals.push({
    id: "JV-OPEN", date: "2026-08-31", period: "2026-08", source: "Opening balance", key: "opening", memo: "Opening balances at cutover",
    lines: [
      { account: "1100 Bank", dr: bank, cr: 0 },
      { account: "1200 Accounts receivable", dr: ar, cr: 0 },
      { account: "1310 Inventory raw material", dr: stockRM, cr: 0 },
      { account: "1330 Inventory finished goods", dr: stockFG, cr: 0 },
      { account: "1500 Fixed assets", dr: fa, cr: 0 },
      { account: "1590 Accumulated depreciation", dr: 0, cr: accDep },
      { account: "3000 Equity", dr: 0, cr: debit - accDep },
    ],
  });
  for (const l of lots) {
    const it = items.find(i => i.id === l.itemId)!;
    s.movements.push({ id: `MV-O-${l.id}`, date: "2026-08-31", itemId: l.itemId, lotId: l.id, qty: l.qty, type: "Opening", ref: "Cutover", value: Math.round(l.qty * it.avgCost), key: `open-${l.id}` });
  }
  // accepted PO-C-1038 holds a soft reservation
  s.reservations.push({ id: "RS-1", poId: "PO-C-1038", itemId: "fg3", qty: 40, level: "soft" });
  return s;
}
