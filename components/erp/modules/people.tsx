"use client";
import React from "react";
import { useErp } from "../store";
import { Page, Card, Table, Badge, Btn, Rule, InlineForm } from "../ui";
import { idr, fmt, userName, addDays, periodOf, daysBetween } from "../logic";

export function HR() {
  const { s, user, run } = useErp();
  const self = user.role === "Employee";
  const emps = self ? s.employees.filter(e => e.id === user.employeeId) : s.employees;
  const leaves = self ? s.leaves.filter(l => l.employeeId === user.employeeId) : s.leaves;
  const period = periodOf(s.today);
  const empName = (id: string) => s.employees.find(e => e.id === id)?.name ?? id;
  return (
    <Page title={self ? "My HR" : "HRIS and payroll"} intro="Module 18. HR data is separately scoped: operational executives do not get salary access. Approved payroll is locked; corrections use a supplemental run. Employees see only their own payslips. PPh 21 and BPJS figures below use illustrative rates for the demo and must be validated by the payroll owner.">
      {self && (
        <Card title="Request leave" pad>
          <InlineForm fields={[{ name: "f", label: "From", type: "date", initial: addDays(s.today, 7) }, { name: "d", label: "Days", type: "number", initial: 1, width: 70 }]} submit="Submit" onSubmit={v => run("requestLeave", v.f, Number(v.d))} />
        </Card>
      )}
      {!self && (
        <Card title="Employees">
          <Table rows={emps} cols={[
            { h: "ID", r: e => e.id }, { h: "Name", r: e => e.name }, { h: "Division", r: e => e.division }, { h: "Type", r: e => e.type },
            { h: "PTKP", r: e => e.ptkp }, { h: "Joined", r: e => e.joined }, { h: "Base salary", r: e => idr(e.salary), num: true },
          ]} />
        </Card>
      )}
      <Card title="Leave">
        <Table rows={leaves} empty="No leave requests." cols={[
          { h: "Request", r: l => l.id }, { h: "Employee", r: l => empName(l.employeeId) }, { h: "From", r: l => l.from }, { h: "To", r: l => l.to },
          { h: "Days", r: l => l.days, num: true }, { h: "Status", r: l => <Badge v={l.status} /> },
          { h: "", r: l => (!self && l.status === "submitted" ? <div className="row-actions"><Btn small kind="primary" onClick={() => run("decideLeave", l.id, true)}>Approve</Btn><Btn small onClick={() => run("decideLeave", l.id, false)}>Reject</Btn></div> : null) },
        ]} />
      </Card>
      {!self && (
        <Card title="Payroll runs" right={<Btn kind="primary" onClick={() => run("runPayroll", period)}>Calculate {period}</Btn>}>
          <Table rows={s.payrolls} empty="No payroll run yet." cols={[
            { h: "Run", r: p => p.id }, { h: "Period", r: p => p.period },
            { h: "Gross", r: p => idr(p.results.reduce((a, r) => a + r.gross, 0)), num: true },
            { h: "PPh 21", r: p => idr(p.results.reduce((a, r) => a + r.pph21, 0)), num: true },
            { h: "BPJS (ee + er)", r: p => idr(p.results.reduce((a, r) => a + r.bpjsEmployee + r.bpjsEmployer, 0)), num: true },
            { h: "Net pay", r: p => idr(p.results.reduce((a, r) => a + r.net, 0)), num: true },
            { h: "Prepared / approved", r: p => `${userName(s, p.preparedBy)} / ${userName(s, p.approvedBy) || "—"}` },
            { h: "Status", r: p => <Badge v={p.status} /> },
            { h: "", r: p => (p.status === "calculated" ? <Btn small kind="primary" onClick={() => run("approvePayroll", p.id)}>Approve and post</Btn> : null) },
          ]} />
        </Card>
      )}
      <Card title={self ? "My payslips" : "Payslips"}>
        <Table rows={s.payrolls.filter(p => p.status !== "calculated" || !self).flatMap(p => p.results.filter(r => !self || r.employeeId === user.employeeId).map(r => ({ p, r })))} empty="No approved payslips yet." cols={[
          { h: "Period", r: x => x.p.period }, { h: "Employee", r: x => empName(x.r.employeeId) }, { h: "Gross", r: x => idr(x.r.gross), num: true },
          { h: "BPJS employee", r: x => idr(x.r.bpjsEmployee), num: true }, { h: "PPh 21", r: x => idr(x.r.pph21), num: true },
          { h: "Net", r: x => <strong>{idr(x.r.net)}</strong>, num: true }, { h: "Run status", r: x => <Badge v={x.p.status} /> },
        ]} />
      </Card>
    </Page>
  );
}

export function Maintenance() {
  const { s, user, run } = useErp();
  const ro = user.role === "Executive Viewer";
  const period = periodOf(s.today);
  return (
    <Page title="Maintenance and fixed assets" intro="Module 19. Confirmed downtime reduces PPIC line capacity. Depreciation posts once per asset per period; re-running the same month is blocked.">
      <Card title="Equipment">
        <Table rows={s.equipment} cols={[
          { h: "Equipment", r: e => e.name }, { h: "Line", r: e => e.line }, { h: "Last service", r: e => e.lastService },
          { h: "Next due", r: e => { const due = addDays(e.lastService, e.intervalDays); return <>{due} {daysBetween(s.today, due) < 0 ? <Badge v="overdue" tone="err" /> : null}</>; } },
          { h: "Downtime (h)", r: e => fmt(e.downtimeHours), num: true }, { h: "Status", r: e => <Badge v={e.status} /> },
          { h: "", r: e => ro ? null : <div className="row-actions">
            <Btn small onClick={() => run("schedulePM", e.id)}>Schedule PM</Btn>
            <InlineForm fields={[{ name: "h", label: "Breakdown hours", type: "number", initial: 6, width: 70 }, { name: "n", label: "Note", initial: "Stopped", width: 110 }]} submit="Report" kind={undefined} onSubmit={v => run("reportBreakdown", e.id, Number(v.h), v.n)} />
          </div> },
        ]} />
      </Card>
      <Card title="Maintenance orders">
        <Table rows={s.maintOrders} empty="No maintenance orders." cols={[
          { h: "Order", r: m => m.id }, { h: "Equipment", r: m => s.equipment.find(e => e.id === m.equipmentId)!.name }, { h: "Kind", r: m => m.kind },
          { h: "Hours", r: m => m.hours, num: true }, { h: "Note", r: m => m.note }, { h: "Status", r: m => <Badge v={m.status} /> },
          { h: "", r: m => (!ro && !["completed", "verified"].includes(m.status) ? <Btn small kind="primary" onClick={() => run("completeService", m.id)}>Complete</Btn> : null) },
        ]} />
      </Card>
      <Card title="Fixed asset register" right={ro ? undefined : <Btn kind="primary" onClick={() => run("runDepreciation", period)}>Run depreciation {period}</Btn>}>
        <Table rows={s.assets} cols={[
          { h: "Asset", r: a => a.id }, { h: "Name", r: a => a.name }, { h: "Cost", r: a => idr(a.cost), num: true }, { h: "Life (months)", r: a => a.lifeMonths, num: true },
          { h: "In service", r: a => a.inService }, { h: "Monthly", r: a => idr(a.cost / a.lifeMonths), num: true }, { h: "Last posted", r: a => a.depreciated[a.depreciated.length - 1] ?? "—" },
        ]} />
      </Card>
      <Rule>Commercial and tax depreciation books are tracked separately in the full build; this demo shows the commercial book.</Rule>
    </Page>
  );
}
