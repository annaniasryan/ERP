"use client";
import React, { useState } from "react";

export function Page({ title, intro, actions, children }: { title: string; intro?: string; actions?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div className="page-head">
        <div>
          <h1>{title}</h1>
          {intro && <p>{intro}</p>}
        </div>
        {actions && <div className="row-actions">{actions}</div>}
      </div>
      {children}
    </div>
  );
}

export function Card({ title, sub, right, children, pad = false }: { title?: React.ReactNode; sub?: React.ReactNode; right?: React.ReactNode; children: React.ReactNode; pad?: boolean }) {
  return (
    <section className="card">
      {(title || right) && (
        <div className="card-head">
          <div>
            {title && <h2>{title}</h2>}
            {sub && <div className="sub">{sub}</div>}
          </div>
          {right}
        </div>
      )}
      {pad ? <div className="card-body">{children}</div> : children}
    </section>
  );
}

export type Col<T> = { h: string; r: (row: T) => React.ReactNode; num?: boolean; w?: number };

export function Table<T>({ rows, cols, empty = "Nothing here yet.", keyOf }: { rows: T[]; cols: Col<T>[]; empty?: string; keyOf?: (r: T, i: number) => string }) {
  if (!rows.length) return <div className="empty">{empty}</div>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>{cols.map(c => <th key={c.h} className={c.num ? "num" : ""} style={c.w ? { width: c.w } : undefined}>{c.h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={keyOf ? keyOf(r, i) : i}>
              {cols.map(c => <td key={c.h} className={c.num ? "num" : ""}>{c.r(r)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const TONE: Record<string, "ok" | "warn" | "err" | "info" | ""> = {
  accepted: "ok", released: "ok", active: "ok", posted: "ok", paid: "ok", completed: "ok", delivered: "ok", approved: "ok", confirmed: "ok", closed: "", running: "ok", won: "ok", verified: "ok", received: "ok",
  submitted: "info", "under review": "info", ready: "info", dispatched: "info", planned: "info", "in production": "info", "output submitted": "info", calculated: "info", proposed: "info", draft: "", requested: "warn", ordered: "info", "partly received": "info", "partly paid": "info", qualified: "info", quotation: "info", negotiation: "info", lead: "", counted: "warn", assigned: "info", reported: "warn", maintenance: "warn",
  "credit hold": "warn", quarantine: "warn", pending: "warn", "match review": "warn", "pending confirmation": "warn", default: "warn", open: "info",
  rejected: "err", cancelled: "err", failed: "err", lost: "err", down: "err", expired: "err", changed: "info", superseded: "",
};
export function Badge({ v, tone }: { v: string; tone?: "ok" | "warn" | "err" | "info" | "" }) {
  return <span className={`badge ${tone ?? TONE[v] ?? ""}`}>{v}</span>;
}

export function Btn({ children, onClick, kind, small, disabled, title }: { children: React.ReactNode; onClick?: () => void; kind?: "primary" | "danger"; small?: boolean; disabled?: boolean; title?: string }) {
  return <button type="button" title={title} className={`btn ${kind ?? ""} ${small ? "small" : ""}`} onClick={onClick} disabled={disabled}>{children}</button>;
}

export function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: React.ReactNode }) {
  return <div className="stat"><div className="label">{label}</div><div className="value">{value}</div>{hint && <div className="hint">{hint}</div>}</div>;
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="field">{label}{children}</label>;
}

export function Rule({ children }: { children: React.ReactNode }) {
  return <div className="rule">{children}</div>;
}

export function Tabs({ tabs, children }: { tabs: string[]; children: (active: string) => React.ReactNode }) {
  const [a, setA] = useState(tabs[0]);
  return (
    <div>
      <div className="tabs">{tabs.map(t => <button type="button" key={t} className={`tab ${a === t ? "active" : ""}`} onClick={() => setA(t)}>{t}</button>)}</div>
      {children(a)}
    </div>
  );
}

// Small inline form for one or two values (avoids browser prompt dialogs)
export function InlineForm({ fields, submit, onSubmit, kind }: {
  fields: { name: string; label: string; type?: string; initial?: string | number; options?: { v: string; l: string }[]; width?: number }[];
  submit: string; onSubmit: (v: Record<string, string>) => boolean | void; kind?: "primary";
}) {
  const init = Object.fromEntries(fields.map(f => [f.name, String(f.initial ?? "")]));
  const [v, setV] = useState<Record<string, string>>(init);
  return (
    <div className="form-row">
      {fields.map(f => (
        <Field key={f.name} label={f.label}>
          {f.options ? (
            <select className="input" value={v[f.name]} onChange={e => setV({ ...v, [f.name]: e.target.value })} style={{ width: f.width }}>
              {f.options.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
            </select>
          ) : (
            <input className="input" type={f.type ?? "text"} value={v[f.name]} onChange={e => setV({ ...v, [f.name]: e.target.value })} style={{ width: f.width ?? 140 }} />
          )}
        </Field>
      ))}
      <Btn kind={kind ?? "primary"} onClick={() => { const ok = onSubmit(v); if (ok !== false) setV(init); }}>{submit}</Btn>
    </div>
  );
}

export function download(name: string, rows: Record<string, unknown>[], meta: string) {
  if (!rows.length) return;
  const keys = Object.keys(rows[0]);
  const esc = (x: unknown) => `"${String(x ?? "").replace(/"/g, '""')}"`;
  const csv = [`# ${meta}`, keys.join(","), ...rows.map(r => keys.map(k => esc(r[k])).join(","))].join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
