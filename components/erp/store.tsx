"use client";
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { ErpState, User } from "./types";
import { actions, type Actions } from "./logic";
import { makeSeed } from "./seed";

type Mode = "loading" | "database" | "browser" | "locked";
type Toast = { kind: "ok" | "err" | "warn"; text: string; id: number } | null;

type Ctx = {
  s: ErpState;
  user: User;
  setUserId: (id: string) => void;
  run: <K extends keyof Actions>(name: K, ...args: Tail<Parameters<Actions[K]>>) => boolean;
  mode: Mode;
  saving: boolean;
  reset: () => void;
  toast: Toast;
  clearToast: () => void;
  unlock: (code: string) => void;
};
type Tail<T extends unknown[]> = T extends [unknown, unknown, ...infer R] ? R : never;

const StoreCtx = createContext<Ctx | null>(null);
const LS_KEY = "orderflow-erp-state-v1";
const LS_USER = "orderflow-erp-user";
const LS_CODE = "orderflow-erp-passcode";
const hdrs = (): Record<string, string> => ({ "content-type": "application/json", "x-erp-passcode": safeGet(LS_CODE) ?? "" });

function safeGet(k: string) { try { return localStorage.getItem(k); } catch { return null; } }
function safeSet(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } }

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [s, setS] = useState<ErpState>(() => makeSeed());
  const [userId, setUserIdState] = useState("u3");
  const [mode, setMode] = useState<Mode>("loading");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<Toast>(null);
  const rev = useRef<number>(0);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(s);
  latest.current = s;

  // initial load: database if the API is configured, otherwise browser storage
  const load = useCallback(async () => {
      try {
        const r = await fetch("/api/state", { cache: "no-store", headers: hdrs() });
        if (r.status === 401) { setMode("locked"); return; }
        if (r.ok) {
          const j = await r.json();
          rev.current = j.rev ?? 0;
          if (j.data && j.data.schema === 1) setS(j.data);
          setMode("database");
          return;
        }
      } catch { /* no API available */ }
      const raw = safeGet(LS_KEY);
      if (raw) { try { const parsed = JSON.parse(raw); if (parsed.schema === 1) setS(parsed); } catch { /* ignore corrupt */ } }
      setMode("browser");
  }, []);
  useEffect(() => {
    const u = safeGet(LS_USER);
    if (u) setUserIdState(u);
    load();
  }, [load]);
  const unlock = (code: string) => { safeSet(LS_CODE, code); setMode("loading"); load(); };

  const persist = useCallback((next: ErpState) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      if (mode === "database") {
        setSaving(true);
        try {
          const r = await fetch("/api/state", { method: "PUT", headers: hdrs(), body: JSON.stringify({ rev: rev.current, data: next }) });
          if (r.status === 409) {
            const j = await r.json();
            rev.current = j.rev; setS(j.data);
            setToast({ kind: "err", text: "Someone else saved changes first. Reloaded the latest data; please repeat your last action.", id: Date.now() });
          } else if (r.ok) {
            rev.current = (await r.json()).rev;
          } else {
            setToast({ kind: "err", text: "Save to database failed. Your change is kept in this tab only.", id: Date.now() });
          }
        } catch {
          setToast({ kind: "err", text: "Network error while saving.", id: Date.now() });
        } finally { setSaving(false); }
      } else if (mode === "browser") {
        safeSet(LS_KEY, JSON.stringify(next));
      }
    }, 250);
  }, [mode]);

  const user = s.users.find(u => u.id === userId) ?? s.users[0];

  const run = useCallback(<K extends keyof Actions>(name: K, ...args: Tail<Parameters<Actions[K]>>) => {
    const draft: ErpState = structuredClone(latest.current);
    const actor = draft.users.find(u => u.id === userId) ?? draft.users[0];
    const auditBefore = draft.audit.length ? draft.audit[0].id : "";
    let err: string | void;
    try {
      err = (actions[name] as (...a: unknown[]) => string | void)(draft, actor, ...args);
    } catch (e) {
      err = `Unexpected error: ${(e as Error).message}`;
    }
    if (err) { setToast({ kind: "err", text: err, id: Date.now() }); return false; }
    const newest = draft.audit[0];
    const text = newest && newest.id !== auditBefore ? `${newest.action}${newest.detail ? ` — ${newest.detail}` : ""}` : "Saved";
    setToast({ kind: /hold|failed|flagged/i.test(newest?.action ?? "") ? "warn" : "ok", text, id: Date.now() });
    latest.current = draft;
    setS(draft);
    persist(draft);
    return true;
  }, [userId, persist]);

  const setUserId = (id: string) => { setUserIdState(id); safeSet(LS_USER, id); };
  const reset = () => {
    const fresh = makeSeed();
    latest.current = fresh;
    setS(fresh);
    persist(fresh);
    setToast({ kind: "ok", text: "Demo data reset.", id: Date.now() });
  };

  return (
    <StoreCtx.Provider value={{ s, user, setUserId, run, mode, saving, reset, toast, clearToast: () => setToast(null), unlock }}>
      {children}
    </StoreCtx.Provider>
  );
}

export function useErp() {
  const c = useContext(StoreCtx);
  if (!c) throw new Error("useErp outside StoreProvider");
  return c;
}
