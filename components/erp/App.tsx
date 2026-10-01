"use client";
import React, { useEffect, useState } from "react";
import { StoreProvider, useErp } from "./store";
import { MODULE_ACCESS, can, type ModuleKey } from "./logic";
import { Dashboard, Reports } from "./modules/home";
import { Admin, Master } from "./modules/admin";
import { CRM, Orders, Shipments } from "./modules/sales";
import { Inventory, BOM, MRP, Production, Quality, Delivery } from "./modules/ops";
import { Purchasing, Receiving } from "./modules/supply";
import { AR, AP, GL, Costing } from "./modules/finance";
import { HR, Maintenance } from "./modules/people";

const NAV: { group: string; items: { key: ModuleKey; label: string; num?: string }[] }[] = [
  { group: "Overview", items: [{ key: "dashboard", label: "Dashboard" }] },
  { group: "Setup", items: [{ key: "admin", label: "Administration", num: "01" }, { key: "master", label: "Master data", num: "02" }] },
  { group: "Sales", items: [{ key: "crm", label: "CRM and targets", num: "03" }, { key: "orders", label: "Customer orders", num: "04" }, { key: "shipments", label: "Shipment commitments", num: "05" }] },
  { group: "Operations", items: [{ key: "inventory", label: "Inventory", num: "06" }, { key: "bom", label: "BOM and standards", num: "07" }, { key: "mrp", label: "PPIC and MRP", num: "08" }, { key: "production", label: "Production", num: "11" }, { key: "quality", label: "Quality control", num: "12" }, { key: "delivery", label: "Delivery orders", num: "13" }] },
  { group: "Supply", items: [{ key: "purchasing", label: "Purchasing", num: "09" }, { key: "receiving", label: "Supplier receiving", num: "10" }] },
  { group: "Finance", items: [{ key: "ar", label: "Billing and AR", num: "14" }, { key: "ap", label: "Payables and treasury", num: "15" }, { key: "gl", label: "Accounting and close", num: "16" }, { key: "costing", label: "Costing", num: "17" }] },
  { group: "People and assets", items: [{ key: "hr", label: "HRIS and payroll", num: "18" }, { key: "maintenance", label: "Maintenance and assets", num: "19" }] },
  { group: "Insights", items: [{ key: "reports", label: "Reports and exports", num: "20" }] },
];

function readHash(): ModuleKey {
  if (typeof window === "undefined") return "dashboard";
  const h = window.location.hash.replace(/^#\/?/, "") as ModuleKey;
  return h && h in MODULE_ACCESS ? h : "dashboard";
}

function Shell() {
  const { s, user, setUserId, mode, saving, reset, toast, clearToast, unlock } = useErp();
  const [page, setPage] = useState<ModuleKey>("dashboard");
  const [menu, setMenu] = useState(false);
  const [code, setCode] = useState("");
  useEffect(() => {
    setPage(readHash());
    const on = () => setPage(readHash());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  useEffect(() => { if (toast) { const t = setTimeout(clearToast, toast.kind === "err" ? 9000 : 4000); return () => clearTimeout(t); } }, [toast, clearToast]);
  if (mode === "locked") {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 16 }}>
        <div className="card card-body" style={{ maxWidth: 380, width: "100%" }}>
          <h2 style={{ marginTop: 0 }}>OrderFlow ERP</h2>
          <p className="muted">This shared demo is protected. Enter the passcode set in Vercel (ERP_DEMO_PASSCODE).</p>
          <form onSubmit={e => { e.preventDefault(); unlock(code); }} className="form-row">
            <input className="input" type="password" value={code} onChange={e => setCode(e.target.value)} placeholder="Passcode" aria-label="Passcode" style={{ flex: 1 }} />
            <button className="btn primary" type="submit">Open</button>
          </form>
        </div>
      </div>
    );
  }
  const go = (k: ModuleKey) => { window.location.hash = `/${k}`; setPage(k); setMenu(false); window.scrollTo(0, 0); };
  const allowed = can(user, MODULE_ACCESS[page]);
  const views: Record<ModuleKey, React.ReactNode> = {
    dashboard: <Dashboard go={go} />, admin: <Admin />, master: <Master />, crm: <CRM />, orders: <Orders />, shipments: <Shipments />,
    inventory: <Inventory />, bom: <BOM />, mrp: <MRP />, production: <Production />, quality: <Quality />, delivery: <Delivery />,
    purchasing: <Purchasing />, receiving: <Receiving />, ar: <AR />, ap: <AP />, gl: <GL />, costing: <Costing />, hr: <HR />, maintenance: <Maintenance />, reports: <Reports />,
  };
  return (
    <div className="shell">
      <aside className={`sidebar ${menu ? "open" : ""}`}>
        <div className="brand"><div className="brand-mark">OF</div>OrderFlow ERP</div>
        {NAV.map(g => {
          const items = g.items.filter(i => can(user, MODULE_ACCESS[i.key]));
          if (!items.length) return null;
          return (
            <div className="nav-group" key={g.group}>
              <div className="nav-label">{g.group}</div>
              {items.map(i => (
                <button type="button" key={i.key} className={`nav-item ${page === i.key ? "active" : ""}`} onClick={() => go(i.key)}>
                  <span className="num">{i.num ?? ""}</span>{i.key === "hr" && user.role === "Employee" ? "My HR" : i.key === "orders" && user.role === "Distributor" ? "My orders" : i.label}
                </button>
              ))}
            </div>
          );
        })}
      </aside>
      <div className="main">
        <header className="topbar">
          <button type="button" className="btn menu-btn" onClick={() => setMenu(!menu)} aria-label="Menu">☰</button>
          <label className="field" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <span>Acting as</span>
            <select className="input" value={user.id} onChange={e => setUserId(e.target.value)} style={{ minWidth: 260 }} aria-label="Acting as user">
              {s.users.map(u => <option key={u.id} value={u.id}>{u.name} — {u.role}</option>)}
            </select>
          </label>
          <span className="spacer" />
          <span className="muted small">Business date {s.today}</span>
          <span className={`badge ${mode === "database" ? "ok" : mode === "browser" ? "warn" : ""}`} title={mode === "database" ? "Shared data in Neon Postgres" : "Data saved in this browser only. Connect Neon on Vercel to share data."}>
            {mode === "loading" ? "Loading…" : mode === "database" ? (saving ? "Saving…" : "Saved to database") : "Browser-only data"}
          </span>
          <button type="button" className="btn small" onClick={() => { if (confirmReset()) reset(); }}>Reset demo data</button>
        </header>
        <main className="content">
          {allowed ? views[page] : (
            <div className="card card-body"><h2 style={{ marginTop: 0 }}>No access</h2><p className="muted">{user.role} cannot open this module. Access is enforced by role and record scope.</p></div>
          )}
        </main>
      </div>
      {toast && <div className={`toast ${toast.kind}`} role="status"><div>{toast.text}</div><button type="button" onClick={clearToast} aria-label="Dismiss">×</button></div>}
    </div>
  );
}

// Two-click reset without a blocking browser dialog
let armed = 0;
function confirmReset() {
  const now = Date.now();
  if (now - armed < 4000) { armed = 0; return true; }
  armed = now;
  const el = document.querySelector(".topbar .btn.small:last-child");
  if (el) { const old = el.textContent; el.textContent = "Click again to reset"; setTimeout(() => { el.textContent = old; }, 4000); }
  return false;
}

export default function ErpApp() {
  return <StoreProvider><Shell /></StoreProvider>;
}
