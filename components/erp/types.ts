// Core data model for the OrderFlow ERP prototype (spec v2.0).
// Money is stored as integer rupiah (IDR) to avoid floating point errors.

export type Role =
  | "Super Admin"
  | "Executive Viewer"
  | "Sales Admin"
  | "Account Executive"
  | "Sales Manager"
  | "PPIC"
  | "Head Production"
  | "Warehouse"
  | "Warehouse Manager"
  | "Purchasing"
  | "Purchasing Manager"
  | "Quality Officer"
  | "Shipment Division"
  | "Finance AR"
  | "Finance AP"
  | "Finance Accountant"
  | "Finance Manager"
  | "HR Payroll Officer"
  | "Maintenance Officer"
  | "Employee"
  | "Distributor";

export interface User {
  id: string;
  name: string;
  role: Role;
  customerId?: string; // distributor scope
  employeeId?: string; // employee self service
}

export interface RoleGrant {
  id: string;
  userId: string;
  role: Role;
  requestedBy: string;
  status: "requested" | "active" | "rejected" | "revoked";
  approvedBy?: string;
  date: string;
}

export interface AuditEntry {
  id: string;
  ts: string;
  actor: string;
  action: string;
  record: string;
  detail: string;
}

export interface Item {
  id: string;
  sku: string;
  name: string;
  type: "FG" | "RM";
  unit: string; // CTN for FG
  dims?: { l: number; w: number; h: number }; // cm, FG carton
  weightKg?: number;
  shelfLifeDays: number;
  avgCost: number; // moving weighted average, IDR per unit
  safetyStock: number;
  moq: number;
  multiple: number;
  leadTimeDays: number;
  active: boolean;
}

export interface Customer {
  id: string;
  code: string;
  name: string;
  aeId: string;
  creditLimit: number;
  termsDays: number;
  deliveryTerms: "dispatch" | "delivery"; // control transfer point
  minShelfPct: number; // minimum remaining shelf life at dispatch, % of total
  npwp: string;
  active: boolean;
}

export interface Supplier {
  id: string;
  name: string;
  termsDays: number;
  bankVerified: boolean;
  currency: string;
}

export interface PriceLine {
  itemId: string;
  price: number; // per CTN
}

export interface PriceListVersion {
  id: string;
  effective: string;
  status: "draft" | "active" | "superseded";
  lines: PriceLine[];
  approvedBy?: string;
}

export interface Lot {
  id: string;
  itemId: string;
  lotNo: string;
  location: string;
  qty: number; // physical on hand
  status: "quarantine" | "released" | "rejected";
  produced: string;
  expiry: string;
  source: string;
}

export interface Movement {
  id: string;
  date: string;
  itemId: string;
  lotId?: string;
  qty: number; // signed
  type: string;
  ref: string;
  value: number; // signed IDR
  key: string; // idempotency / source event key
}

export interface Reservation {
  id: string;
  poId: string;
  itemId: string;
  qty: number;
  level: "soft" | "hard";
  lotId?: string;
}

export interface POLine {
  itemId: string;
  ctn: number;
  price?: number; // locked at acceptance
}

export type POStatus =
  | "draft"
  | "submitted"
  | "under review"
  | "credit hold"
  | "accepted"
  | "rejected"
  | "cancelled";

export interface CustomerPO {
  id: string;
  customerId: string;
  ref: string;
  requestedDate: string;
  status: POStatus;
  lines: POLine[];
  version: number;
  history: { version: number; lines: POLine[]; date: string; by: string }[];
  priceListId?: string;
  creditNote?: string;
  holdReleasedBy?: string;
  acceptedBy?: string;
  submittedBy: string;
  created: string;
}

export interface Revision {
  id: string;
  poId: string;
  lines: POLine[];
  reason: string;
  status: "submitted" | "accepted" | "rejected";
  by: string;
}

export type ShipmentStatus =
  | "pending confirmation"
  | "confirmed"
  | "ready"
  | "dispatched"
  | "delivered"
  | "completed"
  | "cancelled";

export interface Shipment {
  id: string;
  poId: string;
  status: ShipmentStatus;
  firstConfirmed?: string;
  confirmed?: string;
  dateChanges: { from: string; to: string; reason: string; by: string }[];
  doNo?: string;
  dispatchDate?: string;
  deliveredDate?: string;
  picks: { lotId: string; itemId: string; qty: number }[];
}

export interface BOMVersion {
  id: string;
  itemId: string;
  version: number;
  baseCtn: number;
  lossPct: number;
  rejectStdPct: number;
  status: "draft" | "approved" | "effective" | "superseded";
  lines: { itemId: string; qty: number }[];
  lineRateCtnPerHour: number;
}

export interface WorkOrder {
  id: string;
  itemId: string;
  planCtn: number;
  bomId: string;
  line: string;
  status: "planned" | "released" | "in production" | "output submitted" | "closed" | "cancelled";
  poIds: string[];
  totalOut: number;
  rejects: number;
  received: number;
  issued: boolean;
  materialCost: number;
  abnormalLoss: number;
  due: string;
}

export interface Requisition {
  id: string;
  itemId: string;
  qty: number;
  requiredDate: string;
  status: "submitted" | "approved" | "rejected" | "ordered";
  requestedBy: string;
  approvedBy?: string;
  source: string;
}

export interface SupplierPO {
  id: string;
  supplierId: string;
  lines: { itemId: string; qty: number; price: number; received: number }[];
  status: "draft" | "approved" | "released" | "partly received" | "received" | "closed" | "cancelled";
  createdBy: string;
  approvedBy?: string;
  expected: string;
  mode: "internal" | "external";
}

export interface GoodsReceipt {
  id: string;
  supplierPoId: string;
  itemId: string;
  qty: number;
  rejected: number;
  unitCost: number;
  lotId: string;
  date: string;
  billed: boolean;
}

export interface Invoice {
  id: string;
  shipmentId: string;
  customerId: string;
  date: string;
  due: string;
  net: number;
  vat: number;
  status: "draft" | "posted" | "partly paid" | "paid";
  paid: number;
  taxInvoice: "pending" | "submitted" | "approved" | "rejected";
  taxNo?: string;
}

export interface Bill {
  id: string;
  supplierId: string;
  ref: string;
  receiptIds: string[];
  amount: number;
  vat: number;
  status: "match review" | "approved" | "posted" | "paid";
  match: string;
  due: string;
  paid: number;
}

export interface Payment {
  id: string;
  billIds: string[];
  amount: number;
  status: "proposed" | "approved" | "released" | "confirmed" | "failed";
  maker: string;
  approver?: string;
}

export interface JournalLine {
  account: string;
  dr: number;
  cr: number;
}

export interface Journal {
  id: string;
  date: string;
  period: string;
  source: string;
  key: string;
  memo: string;
  lines: JournalLine[];
}

export interface Period {
  id: string; // YYYY-MM
  status: "open" | "closing" | "closed";
}

export interface Employee {
  id: string;
  name: string;
  division: string;
  type: "permanent" | "contract";
  salary: number;
  ptkp: string;
  joined: string;
}

export interface Leave {
  id: string;
  employeeId: string;
  from: string;
  to: string;
  days: number;
  status: "submitted" | "approved" | "rejected";
}

export interface PayrollResult {
  employeeId: string;
  gross: number;
  bpjsEmployee: number;
  bpjsEmployer: number;
  pph21: number;
  net: number;
}

export interface PayrollRun {
  id: string;
  period: string;
  status: "calculated" | "approved" | "posted" | "paid";
  results: PayrollResult[];
  preparedBy: string;
  approvedBy?: string;
}

export interface Equipment {
  id: string;
  name: string;
  line: string;
  intervalDays: number;
  lastService: string;
  status: "running" | "down" | "maintenance";
  downtimeHours: number;
}

export interface MaintOrder {
  id: string;
  equipmentId: string;
  kind: "preventive" | "breakdown";
  status: "reported" | "assigned" | "in progress" | "completed" | "verified";
  hours: number;
  date: string;
  note: string;
}

export interface Asset {
  id: string;
  name: string;
  cost: number;
  lifeMonths: number;
  inService: string;
  depreciated: string[]; // periods posted
}

export interface Lead {
  id: string;
  name: string;
  owner: string;
  stage: "lead" | "qualified" | "quotation" | "negotiation" | "won" | "lost";
  value: number;
  followUp: string;
}

export interface Target {
  id: string;
  aeId: string;
  period: string;
  ctn: number;
  revenue: number;
}

export interface Decision {
  id: string;
  decision: string;
  def: string;
  owner: string;
  phase: string;
  status: "default" | "confirmed" | "changed";
  note?: string;
}

export interface Count {
  id: string;
  lotId: string;
  book: number;
  counted: number;
  status: "counted" | "posted" | "rejected";
  by: string;
  approvedBy?: string;
}

export interface ErpState {
  schema: number;
  today: string;
  seq: number;
  users: User[];
  grants: RoleGrant[];
  audit: AuditEntry[];
  items: Item[];
  customers: Customer[];
  suppliers: Supplier[];
  priceLists: PriceListVersion[];
  lots: Lot[];
  movements: Movement[];
  reservations: Reservation[];
  pos: CustomerPO[];
  revisions: Revision[];
  shipments: Shipment[];
  boms: BOMVersion[];
  workOrders: WorkOrder[];
  requisitions: Requisition[];
  supplierPOs: SupplierPO[];
  receipts: GoodsReceipt[];
  invoices: Invoice[];
  bills: Bill[];
  payments: Payment[];
  journals: Journal[];
  periods: Period[];
  employees: Employee[];
  leaves: Leave[];
  payrolls: PayrollRun[];
  equipment: Equipment[];
  maintOrders: MaintOrder[];
  assets: Asset[];
  leads: Lead[];
  targets: Target[];
  decisions: Decision[];
  counts: Count[];
  settings: {
    vatPct: number; // e.g. 11 effective
    overdueHoldDays: number;
    salesMgrCreditLimit: number; // max over-limit amount Sales Manager can release
    receiptTolerancePct: number;
    matchTolerancePct: number;
  };
}
