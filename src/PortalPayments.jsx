// PortalPayments.jsx -- Engineer Portal pieces for the Stripe Connect
// payments build (see the Engineer Partner Agreement Payments Addendum).
//
//   usePortalPaymentData   settings, overrides, flag categories, this
//                          engineer's flags and commission recoveries
//   PaymentsSetupCard      "Set up payments" / Stripe account status
//   JobEarningsLine        one-line "You'll receive £X" for booking lists
//   JobPaymentSection      payment block inside BookingDetailModal: what the
//                          engineer receives, parts quote, payment link,
//                          flags on this job
//   FlagModal              Flag a problem / Dispute this decision
//   EarningsPanel          earnings, recoveries and flags (Bookings -> Payments)
//
// Shared look (C, Pill, Field, ...) is imported from App.jsx and only used
// inside components, so the import cycle with App.jsx is safe. Anything that
// needs Stripe calls the `payments` Edge Function and stays switched off
// until EasyRepair turns payments on (payment_settings.payments_live).

import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "./lib/supabaseClient";
import { C, Pill, Field, inputCls, modalInputStyle, modalCardStyle } from "./App";
import {
  mergeSettings, jobMoney, penceToGBP, poundsToPence, pctLabel, paymentRoute, ROUTE_LABELS,
  PAYMENT_STATUS_LABELS, PARTS_STATUS_LABELS, STRIPE_STATUS_LABELS, cancellationFee,
} from "./paymentsShared";

async function callPayments(action, body) {
  const { data, error } = await supabase.functions.invoke("payments", { body: { action, ...body } });
  if (error) throw new Error(error.message || "Payment request failed.");
  if (data?.error) throw new Error(data.error);
  return data;
}

const fmtDT = (d) => (d ? new Date(d).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");

// ─── data ───────────────────────────────────────────────────────────────────
export function usePortalPaymentData(currentUser) {
  const engineerId = currentUser?.engineerRowId;
  const [settingsRow, setSettingsRow] = useState(null);
  const [overrides, setOverrides] = useState([]);
  const [categories, setCategories] = useState([]);
  const [flags, setFlags] = useState([]);
  const [recoveries, setRecoveries] = useState([]);
  const [stripe, setStripe] = useState(null);

  const reload = useCallback(async () => {
    if (!engineerId) return;
    const [s, o, c, f, r, e] = await Promise.all([
      supabase.from("payment_settings").select("*").eq("id", 1).maybeSingle(),
      supabase.from("payment_overrides").select("*"),
      supabase.from("flag_categories").select("*").eq("active", true).order("sort_order"),
      supabase.from("job_flags").select("*").eq("engineer_id", engineerId).order("created_at", { ascending: false }),
      supabase.from("commission_recoveries").select("*").eq("engineer_id", engineerId).order("created_at", { ascending: false }),
      supabase.from("engineers").select("stripe_account_id,stripe_status,stripe_charges_enabled,stripe_payouts_enabled,stripe_requirements_due").eq("id", engineerId).maybeSingle(),
    ]);
    if (!s.error) setSettingsRow(s.data);
    if (!o.error) setOverrides(o.data || []);
    if (!c.error) setCategories(c.data || []);
    if (!f.error) setFlags(f.data || []);
    if (!r.error) setRecoveries(r.data || []);
    if (!e.error) setStripe(e.data);
  }, [engineerId]);

  useEffect(() => { reload(); }, [reload]);
  useEffect(() => {
    if (!engineerId) return;
    const ch = supabase.channel(`my-flags-${engineerId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "job_flags", filter: `engineer_id=eq.${engineerId}` }, reload)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [engineerId, reload]);

  return { settings: mergeSettings(settingsRow), ready: !!settingsRow, overrides, categories, flags, recoveries, stripe, reload };
}

// ─── small pieces ───────────────────────────────────────────────────────────
const sectionTitle = (t) => <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: C.mid }}>{t}</p>;
const Line = ({ k, v, strong, color }) => (
  <div className="flex justify-between text-sm py-1" style={{ borderBottom: `1px solid ${C.border}` }}>
    <span style={{ color: C.mid }}>{k}</span><span style={{ color: color || C.text, fontWeight: strong ? 700 : 500 }}>{v}</span>
  </div>
);
const btn = (kind = "primary") => ({
  primary: { background: C.primary, color: "#000" },
  ghost: { background: "rgba(255,255,255,0.06)", color: C.text },
  danger: { background: C.dangerSoft, color: C.danger },
  warn: { background: C.warnSoft, color: C.warn },
}[kind]);
const statusPill = (status) => {
  const map = { paid: [C.successSoft, C.success], outstanding: [C.warnSoft, C.warn], uncollectable: [C.dangerSoft, C.danger], refunded: [C.purpleSoft, C.purple], part_refunded: [C.purpleSoft, C.purple], disputed: [C.dangerSoft, C.danger] };
  const [bg, color] = map[status] || ["rgba(255,255,255,0.06)", C.mid];
  return <Pill bg={bg} color={color}>{PAYMENT_STATUS_LABELS[status] || status}</Pill>;
};

// ─── Stripe setup card (Settings + Dashboard) ───────────────────────────────
export function PaymentsSetupCard({ data }) {
  const { settings, stripe } = data;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const status = stripe?.stripe_status || "not_started";
  const live = settings.payments_live;
  const active = status === "active";
  const due = Array.isArray(stripe?.stripe_requirements_due) ? stripe.stripe_requirements_due : [];
  const start = async () => {
    setBusy(true); setErr("");
    try {
      const res = await callPayments("onboarding_link", { returnUrl: window.location.origin });
      if (res?.url) window.location.href = res.url; else setErr("Stripe didn't return a link. Please try again.");
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };
  const color = active ? C.success : status === "restricted" ? C.danger : C.warn;
  return (
    <div className="rounded-xl p-5 mb-6" style={{ background: C.card, border: `1px solid ${active ? C.border : color}` }}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="font-semibold" style={{ color: C.text }}>Getting paid</p>
          <p className="text-sm mt-1" style={{ color: C.mid }}>
            Customers pay you through your own Stripe account. EasyRepair's commission comes off automatically and Stripe pays the rest into your bank.
          </p>
        </div>
        <Pill bg={active ? C.successSoft : status === "restricted" ? C.dangerSoft : C.warnSoft} color={color}>{STRIPE_STATUS_LABELS[status]}</Pill>
      </div>
      {status === "restricted" && <p className="text-sm mt-3" style={{ color: C.danger }}>Stripe needs more information before you can be paid{due.length ? `: ${due.join(", ")}` : ""}. Jobs that need payment can't be sent to you until this is done.</p>}
      {!active && (
        <div className="mt-4">
          <button onClick={start} disabled={!live || busy} className="px-4 py-2 rounded-lg text-sm font-bold" style={{ ...btn("primary"), opacity: !live || busy ? 0.5 : 1 }}>
            {busy ? "Opening Stripe…" : status === "not_started" ? "Set up payments" : "Finish setting up payments"}
          </button>
          {!live && <p className="text-xs mt-2" style={{ color: C.warn }}>Available when EasyRepair switches payments on. We'll let you know.</p>}
          {live && <p className="text-xs mt-2" style={{ color: C.light }}>Takes about 5–10 minutes on Stripe's secure form: your details, business type and bank account.</p>}
        </div>
      )}
      {err && <p className="text-sm mt-2" style={{ color: C.danger }}>{err}</p>}
    </div>
  );
}

// ─── one-line earnings for booking lists ────────────────────────────────────
export function JobEarningsLine({ job, data }) {
  if (!data?.ready) return null;
  const m = jobMoney(job, data.settings, data.overrides);
  const route = paymentRoute(job);
  return (
    <p className="text-xs mt-1" style={{ color: C.light }}>
      <span style={{ color: C.primary, fontWeight: 600 }}>You'll receive {penceToGBP(m.engineerNet)}</span>
      {job.partsApprovalStatus === "pending" && <span style={{ color: C.warn }}> · parts awaiting customer approval</span>}
      {route !== "unknown" && <> · {ROUTE_LABELS[route]}</>}
      {job.paymentStatus && job.paymentStatus !== "not_charged" && <> · {PAYMENT_STATUS_LABELS[job.paymentStatus]}</>}
      {job.noShow && <span style={{ color: C.warn }}> · Customer not home</span>}
    </p>
  );
}

// ─── payment block inside BookingDetailModal ────────────────────────────────
export function JobPaymentSection({ job, currentUser, data, onChanged }) {
  const { settings, overrides, flags, recoveries, categories } = data;
  const [lines, setLines] = useState(() => (job.partsLines || []).map((l) => ({ ...l, price: ((l.price_pence || 0) / 100).toFixed(2) })));
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [flagType, setFlagType] = useState(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => { setLines((job.partsLines || []).map((l) => ({ ...l, price: ((l.price_pence || 0) / 100).toFixed(2) }))); }, [job.partsLines]);
  if (!data.ready) return null;

  const live = settings.payments_live;
  const m = jobMoney(job, settings, overrides);
  const mIf = jobMoney(job, settings, overrides, { includePending: true });
  const route = paymentRoute(job);
  const myFlags = flags.filter((f) => f.booking_id === job.id);
  const myRecs = recoveries.filter((r) => r.booking_id === job.id);
  const decided = job.fault === "engineer" || job.refundedAt;
  const noShowFee = cancellationFee(settings, "no_show");

  const saveParts = async () => {
    const clean = lines.filter((l) => (l.description || "").trim() || Number(l.price) > 0)
      .map((l, i) => ({ id: l.id || `p${Date.now()}${i}`, description: (l.description || "").trim(), price_pence: poundsToPence(l.price) }));
    if (clean.some((l) => !l.description)) { setErr("Give each part a description."); return; }
    if (clean.some((l) => l.price_pence <= 0)) { setErr("Give each part a price."); return; }
    setSaving(true); setErr("");
    const { error } = await supabase.from("bookings").update({ parts_lines: clean }).eq("id", job.id);
    if (!error && live && clean.length) {
      try { await callPayments("send_parts_approval", { bookingId: job.id }); } catch (e) { setErr(`Saved, but the approval link wasn't sent: ${e.message}`); }
    }
    setSaving(false);
    if (error) { setErr(error.message); return; }
    setEditing(false);
    await onChanged?.();
  };

  return (
    <div className="pt-4 mt-4" style={{ borderTop: `1px solid ${C.border}` }}>
      <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
        {sectionTitle("Payment")}
        <div className="flex gap-1 flex-wrap">
          {route !== "unknown" && <Pill bg={C.primarySoft} color={C.primary}>{ROUTE_LABELS[route]}</Pill>}
          {statusPill(job.paymentStatus || "not_charged")}
        </div>
      </div>

      <div className="rounded-lg p-3 mb-3" style={{ background: C.primarySoft }}>
        <p className="text-xs" style={{ color: C.mid }}>You'll receive</p>
        <p className="text-2xl font-bold" style={{ color: C.primary }}>{penceToGBP(m.engineerNet)}</p>
        <p className="text-xs mt-1" style={{ color: C.mid }}>
          {pctLabel(m.terms.engineer_callout_share)} of the {penceToGBP(m.callout)} callout{m.partsApproved ? ` + ${pctLabel(m.terms.engineer_parts_share)} of ${penceToGBP(m.partsApproved)} parts` : ""}.
          {m.engineerPaysFee ? ` Stripe's card fee (about ${penceToGBP(m.fee)}) comes off your share.` : " EasyRepair covers Stripe's card fee."}
        </p>
        {job.partsApprovalStatus === "pending" && <p className="text-xs mt-1" style={{ color: C.warn }}>If the customer approves the parts: {penceToGBP(mIf.engineerNet)}.</p>}
      </div>
      <Line k="Customer pays" v={penceToGBP(m.total)} />
      <Line k="EasyRepair commission" v={penceToGBP(m.commission)} />
      {!live
        ? <p className="text-xs mt-2" style={{ color: C.light }}>Card payments through EasyRepair aren't switched on yet, so take payment on the day as you do now. These figures show how the split will work.</p>
        : route === "add_card" || route === "repair_protection"
        ? <p className="text-xs mt-2" style={{ color: C.light }}>The customer's card is charged automatically once you mark the job complete. You don't need to take payment on the day.</p>
        : route === "pay_after"
          ? <p className="text-xs mt-2" style={{ color: C.warn }}>Pay after repair: make sure the customer pays through the payment link before you leave.</p>
          : null}

      {/* payment link for Pay after repair */}
      {job.paymentLinkUrl && job.paymentStatus !== "paid" && (
        <div className="rounded-lg p-3 mt-3" style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${C.border}` }}>
          <p className="text-sm font-medium" style={{ color: C.text }}>Payment link</p>
          <p className="text-xs break-all mt-1" style={{ color: C.mid }}>{job.paymentLinkUrl}</p>
          <div className="flex gap-2 mt-2 flex-wrap">
            <button onClick={() => { navigator.clipboard?.writeText(job.paymentLinkUrl); setCopied(true); setTimeout(() => setCopied(false), 2000); }} className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={btn("ghost")}>{copied ? "Copied" : "Copy link"}</button>
            <a href={job.paymentLinkUrl} target="_blank" rel="noreferrer" className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={btn("ghost")}>Open on this device</a>
            {live && <button onClick={async () => { try { await callPayments("send_payment_link", { bookingId: job.id }); setErr(""); } catch (e) { setErr(e.message); } }} className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={btn("ghost")}>Resend to customer</button>}
          </div>
        </div>
      )}

      {/* parts */}
      <div className="mt-4">
        <div className="flex items-center justify-between">
          {sectionTitle(`Parts · ${PARTS_STATUS_LABELS[job.partsApprovalStatus || "none"]}`)}
          {!editing && !["paid", "refunded"].includes(job.paymentStatus) && (
            <button onClick={() => { setEditing(true); if (!lines.length) setLines([{ description: "", price: "" }]); }} className="text-xs underline" style={{ color: C.primary, background: "none", border: "none", cursor: "pointer" }}>{lines.length ? "Edit parts" : "+ Add parts"}</button>
          )}
        </div>
        {!editing && (job.partsLines || []).map((l, i) => <Line key={l.id || i} k={l.description} v={penceToGBP(l.price_pence)} />)}
        {!editing && !(job.partsLines || []).length && <p className="text-sm" style={{ color: C.light }}>No parts quoted. If parts are needed, add them here so the customer can approve them before they're charged.</p>}
        {editing && (
          <div>
            {lines.map((l, i) => (
              <div key={i} className="flex gap-2 mb-2">
                <input className={inputCls} style={modalInputStyle} placeholder="Part description" value={l.description} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} />
                <input className={inputCls} style={{ ...modalInputStyle, maxWidth: 110 }} type="number" step="0.01" placeholder="£" value={l.price} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)))} />
                <button onClick={() => setLines(lines.filter((_, j) => j !== i))} aria-label="Remove part" style={{ color: C.danger, background: "none", border: "none", cursor: "pointer" }}>✕</button>
              </div>
            ))}
            <button onClick={() => setLines([...lines, { description: "", price: "" }])} className="text-xs underline mb-3" style={{ color: C.primary, background: "none", border: "none", cursor: "pointer" }}>+ Another part</button>
            <p className="text-xs mb-2" style={{ color: C.light }}>Saving sends the parts to the customer to approve{live ? " by text and email" : " (EasyRepair confirms with them until payments go live)"}. You can't complete the job until they approve, and you must never charge parts they haven't approved.</p>
            <div className="flex gap-2">
              <button onClick={saveParts} disabled={saving} className="px-3 py-1.5 rounded-lg text-xs font-bold" style={{ ...btn("primary"), opacity: saving ? 0.6 : 1 }}>{saving ? "Saving…" : "Save & send for approval"}</button>
              <button onClick={() => { setEditing(false); setLines((job.partsLines || []).map((l) => ({ ...l, price: ((l.price_pence || 0) / 100).toFixed(2) }))); }} className="px-3 py-1.5 rounded-lg text-xs" style={btn("ghost")}>Cancel</button>
            </div>
          </div>
        )}
      </div>

      {/* decisions on this job */}
      {job.noShow && <p className="text-sm mt-3" style={{ color: C.warn }}>You recorded "Customer not home"{job.noShowAt ? ` at ${fmtDT(job.noShowAt)}` : ""}. If EasyRepair collects the no-show fee you get {penceToGBP(noShowFee.engineer)}.</p>}
      {job.uncollectableAt && (
        <div className="rounded-lg p-3 mt-3 text-sm" style={{ background: C.dangerSoft, color: C.text }}>
          <p style={{ color: C.danger, fontWeight: 600 }}>Payment couldn't be collected</p>
          <p className="mt-1">{job.fault === "engineer" ? "EasyRepair has decided this was your responsibility, so its commission on this job is recovered from your next paid job(s)." : "This wasn't your fault, so EasyRepair writes off its commission."}{job.faultNote ? ` Note: ${job.faultNote}` : ""}</p>
        </div>
      )}
      {myRecs.map((r) => <Line key={r.id} k={`Commission to repay · ${r.status}${r.status === "paused" ? " (while your dispute is reviewed)" : ""}`} v={penceToGBP(r.amount_pence)} color={C.danger} />)}
      {job.refundedAt && <Line k={`Customer refunded ${fmtDT(job.refundedAt)}`} v={`${penceToGBP(job.refundAmountPence)} (commission returned ${penceToGBP(job.commissionRefundedPence || 0)})`} />}

      {/* flags */}
      <div className="mt-4">
        {sectionTitle("Problems and disputes")}
        {myFlags.map((f) => (
          <div key={f.id} className="rounded-lg p-3 mb-2 text-sm" style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${C.border}` }}>
            <div className="flex justify-between gap-2"><span style={{ color: C.text, fontWeight: 600 }}>{f.type === "dispute" ? "Dispute" : "Problem"} · {categories.find((c) => c.id === f.category_id)?.label || ""}</span><span style={{ color: f.status === "resolved" ? C.success : C.warn }}>{f.status === "resolved" ? `Resolved: ${f.outcome}` : f.status === "under_review" ? "Under review" : "Open"}</span></div>
            <p className="mt-1" style={{ color: C.mid }}>{f.message}</p>
            {f.admin_note && <p className="mt-1" style={{ color: C.text }}><span style={{ color: C.mid }}>EasyRepair:</span> {f.admin_note}</p>}
          </div>
        ))}
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setFlagType("problem")} className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={btn("warn")}>Flag a problem</button>
          {decided && <button onClick={() => setFlagType("dispute")} className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={btn("danger")}>Dispute this decision</button>}
        </div>
      </div>
      {err && <p className="text-sm mt-2" style={{ color: C.danger }}>{err}</p>}
      {flagType && <FlagModal job={job} currentUser={currentUser} categories={categories} type={flagType} onClose={() => setFlagType(null)} onDone={async () => { setFlagType(null); await data.reload(); }} />}
    </div>
  );
}

// ─── Flag a problem / Dispute this decision ─────────────────────────────────
export function FlagModal({ job, currentUser, categories, type, onClose, onDone }) {
  const opts = categories.filter((c) => c.applies_to === "both" || c.applies_to === type);
  const [categoryId, setCategoryId] = useState(opts[0]?.id || "");
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const submit = async () => {
    if (!message.trim()) { setErr("Tell us what happened."); return; }
    setBusy(true); setErr("");
    const paths = [];
    for (const f of files.slice(0, 5)) {
      const safe = f.name.replace(/[^\w.\-]+/g, "_");
      const path = `${currentUser.id}/${job.id}/${Date.now()}_${safe}`;
      const { error } = await supabase.storage.from("job-flag-photos").upload(path, f, { upsert: false });
      if (error) { setBusy(false); setErr(`Couldn't upload ${f.name}: ${error.message}`); return; }
      paths.push(path);
    }
    const { error } = await supabase.from("job_flags").insert({ booking_id: job.id, engineer_id: currentUser.engineerRowId, type, category_id: categoryId || null, message: message.trim(), attachments: paths });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    onDone();
  };
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.6)" }} onClick={onClose}>
      <div className="w-full max-w-md rounded-xl p-6" style={modalCardStyle} onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold mb-1" style={{ color: C.text }}>{type === "dispute" ? "Dispute this decision" : "Flag a problem"}</h3>
        <p className="text-sm mb-4" style={{ color: C.mid }}>{type === "dispute" ? "EasyRepair pauses any commission recovery on this job while it reviews your dispute, and tells you the outcome." : "EasyRepair will review it and let you know the outcome here and by email."}</p>
        <Field label="Category">
          <select className={inputCls} style={modalInputStyle} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            {opts.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </Field>
        <Field label="What happened?">
          <textarea className={inputCls} style={{ ...modalInputStyle, resize: "vertical" }} rows={4} value={message} onChange={(e) => setMessage(e.target.value)} />
        </Field>
        <Field label="Photos (optional, up to 5)">
          <input type="file" accept="image/*" multiple onChange={(e) => setFiles(Array.from(e.target.files || []))} className="text-sm" style={{ color: C.mid }} />
        </Field>
        {err && <p className="text-sm mb-2" style={{ color: C.danger }}>{err}</p>}
        <div className="flex gap-2 justify-end mt-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm" style={btn("ghost")}>Cancel</button>
          <button onClick={submit} disabled={busy} className="px-4 py-2 rounded-lg text-sm font-bold" style={{ ...btn("primary"), opacity: busy ? 0.6 : 1 }}>{busy ? "Sending…" : "Send to EasyRepair"}</button>
        </div>
      </div>
    </div>
  );
}

// ─── Earnings (Bookings -> Payments) ────────────────────────────────────────
export function EarningsPanel({ currentUser, jobs, data, onOpenJob }) {
  if (!data.ready) return null;
  const mine = jobs.filter((j) => j.engineerId === currentUser.engineerRowId);
  const paid = mine.filter((j) => ["paid", "part_refunded", "refunded"].includes(j.paymentStatus));
  const waiting = mine.filter((j) => ["not_charged", "outstanding", "processing"].includes(j.paymentStatus) && j.status === "completed");
  const earned = paid.reduce((s, j) => s + jobMoney(j, data.settings, data.overrides).engineerNet, 0);
  const waitingAmt = waiting.reduce((s, j) => s + jobMoney(j, data.settings, data.overrides).engineerNet, 0);
  const fees = mine.filter((j) => j.cancellationFeeStatus === "charged" && j.feeEngineerSharePence > 0);
  const feeAmt = fees.reduce((s, j) => s + Number(j.feeEngineerSharePence || 0), 0);
  const owed = data.recoveries.filter((r) => ["pending", "paused", "invoiced"].includes(r.status));
  const owedAmt = owed.reduce((s, r) => s + r.amount_pence, 0);
  const openFlags = data.flags.filter((f) => f.status !== "resolved");
  const card = (label, value, color) => (
    <div className="rounded-xl p-4" style={{ background: C.card, borderLeft: `4px solid ${color}` }}>
      <p className="text-xs" style={{ color: C.mid }}>{label}</p>
      <p className="text-xl font-bold" style={{ color }}>{value}</p>
    </div>
  );
  return (
    <div className="mb-8">
      <PaymentsSetupCard data={data} />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        {card("Paid through Stripe", penceToGBP(earned), C.success)}
        {card("Waiting for payment", penceToGBP(waitingAmt), C.warn)}
        {card("No-show fee shares", penceToGBP(feeAmt), C.primary)}
        {card("Commission to repay", penceToGBP(owedAmt), owedAmt ? C.danger : C.mid)}
      </div>

      {paid.length + waiting.length > 0 && (
        <>
          <h2 className="text-lg font-semibold mb-3" style={{ color: C.text }}>Customer payments</h2>
          <div className="rounded-xl mb-5" style={{ background: C.card, border: `1px solid ${C.border}` }}>
            {[...waiting, ...paid].map((j, i) => {
              const m = jobMoney(j, data.settings, data.overrides);
              return (
                <div key={j.id} onClick={() => onOpenJob?.(j)} className="p-4 flex items-center justify-between cursor-pointer" style={{ borderTop: i ? `1px solid ${C.border}` : "none" }}>
                  <div>
                    <p className="font-medium" style={{ color: C.text }}>{j.customerName} — {j.applianceType}</p>
                    <p className="text-xs" style={{ color: C.mid }}>{j.paymentStatus === "paid" ? "Customer paid" : "Customer owes"} {penceToGBP(m.total)} · commission {penceToGBP(m.commission)}{m.engineerPaysFee ? ` · card fee ${penceToGBP(m.fee)}` : ""}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold" style={{ color: C.text }}>{penceToGBP(m.engineerNet)}</p>
                    {statusPill(j.paymentStatus)}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {owed.length > 0 && (
        <>
          <h2 className="text-lg font-semibold mb-1" style={{ color: C.text }}>Commission to repay</h2>
          <p className="text-sm mb-3" style={{ color: C.mid }}>Taken from EasyRepair's commission on your next paid job(s). If you think a decision is wrong, open the job and tap "Dispute this decision".</p>
          <div className="rounded-xl mb-5" style={{ background: C.card, border: `1px solid ${C.border}` }}>
            {owed.map((r, i) => {
              const j = mine.find((x) => x.id === r.booking_id);
              return (
                <div key={r.id} onClick={() => j && onOpenJob?.(j)} className="p-4 flex items-center justify-between cursor-pointer" style={{ borderTop: i ? `1px solid ${C.border}` : "none" }}>
                  <div><p className="font-medium" style={{ color: C.text }}>{j ? `${j.customerName} — ${j.applianceType}` : "Job"}</p><p className="text-xs" style={{ color: C.mid }}>{r.reason} · {r.status === "paused" ? "paused while your dispute is reviewed" : r.status}</p></div>
                  <p className="font-semibold" style={{ color: C.danger }}>{penceToGBP(r.amount_pence)}</p>
                </div>
              );
            })}
          </div>
        </>
      )}

      <h2 className="text-lg font-semibold mb-3" style={{ color: C.text }}>My flags {openFlags.length ? `(${openFlags.length} open)` : ""}</h2>
      <div className="rounded-xl" style={{ background: C.card, border: `1px solid ${C.border}` }}>
        {data.flags.length === 0 && <p className="p-4 text-sm" style={{ color: C.mid }}>You haven't flagged any problems. Open a booking and tap "Flag a problem" if something goes wrong on a job.</p>}
        {data.flags.map((f, i) => {
          const j = mine.find((x) => x.id === f.booking_id);
          return (
            <div key={f.id} onClick={() => j && onOpenJob?.(j)} className="p-4 cursor-pointer" style={{ borderTop: i ? `1px solid ${C.border}` : "none" }}>
              <div className="flex justify-between gap-2"><p className="font-medium" style={{ color: C.text }}>{f.type === "dispute" ? "Dispute" : "Problem"}{j ? ` · ${j.customerName}` : ""}</p><span className="text-xs" style={{ color: f.status === "resolved" ? C.success : C.warn }}>{f.status === "resolved" ? `Resolved: ${f.outcome}` : f.status === "under_review" ? "Under review" : "Open"}</span></div>
              <p className="text-sm" style={{ color: C.mid }}>{f.message}</p>
              {f.admin_note && <p className="text-sm mt-1" style={{ color: C.text }}><span style={{ color: C.mid }}>EasyRepair:</span> {f.admin_note}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
