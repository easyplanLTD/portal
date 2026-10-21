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
import { C, Pill, Field, inputCls, modalInputStyle, modalCardStyle, ScrollLock } from "./App";
import {
  mergeSettings, jobMoney, penceToGBP, poundsToPence, pctLabel, paymentRoute, ROUTE_LABELS,
  PAYMENT_STATUS_LABELS, PARTS_STATUS_LABELS, STRIPE_STATUS_LABELS, cancellationFee,
  mapPaymentFields, calloutPenceFor, PAID_VIA_LABELS, cardLabel,
} from "./paymentsShared";

async function callPayments(action, body) {
  const { data, error } = await supabase.functions.invoke("payments", { body: { action, ...body } });
  if (error) {
    // Show the function's own message (e.g. Stripe's reason) rather than "non-2xx status code".
    let msg = error.message || "Payment request failed.";
    try { const b = await error.context?.json?.(); if (b?.error) msg = b.error; } catch (_) { /* keep generic message */ }
    throw new Error(msg);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

const fmtDT = (d) => (d ? new Date(d).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");

// ─── data ───────────────────────────────────────────────────────────────────
// Once payments are live, jobs with a card saved at booking (and Pay after
// repair jobs) are completed first: completing them is what charges the card
// or sends the customer their payment link. Cash/manual jobs still need
// "Payment Taken" first.
export const completesBeforePayment = (job, settings) =>
  !!settings?.payments_live && !job.isExternal && (job.hasSavedCard || job.paymentTiming === "after");

// Tells the payments Edge Function a job has just been completed. Returns a
// short message for the engineer, or an error message.
export async function chargeOnCompletion(job) {
  try {
    const res = await callPayments("job_completed", { bookingId: job.id });
    const r = res?.job;
    if (r && typeof r === "object" && r.ok === false) return { error: `The customer's card was declined, so they've been sent a payment link instead.` };
    if (r && typeof r === "object" && r.url) return { message: "The customer has been sent a payment link." };
    if (r && typeof r === "object" && r.ok) return { message: "The customer's card has been charged." };
    if (r === "waiting for parts approval") return { message: "The customer will be charged once they approve the parts." };
    return { message: null };
  } catch (e) {
    return { error: `The job is completed, but payment didn't start: ${e.message}. EasyRepair can take it from FixFlow.` };
  }
}

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
      supabase.from("engineers").select("stripe_account_id,stripe_status,stripe_charges_enabled,stripe_payouts_enabled,stripe_requirements_due,profile:profiles(is_test)").eq("id", engineerId).maybeSingle(),
    ]);
    if (!s.error) setSettingsRow(s.data);
    if (!o.error) setOverrides(o.data || []);
    if (!c.error) setCategories(c.data || []);
    if (!f.error) setFlags(f.data || []);
    if (!r.error) setRecoveries(r.data || []);
    if (!e.error) setStripe(e.data);
  }, [engineerId]);

  useEffect(() => { reload(); }, [reload]);
  // Coming back from Stripe's onboarding pages: check the account straight away.
  useEffect(() => {
    if (!engineerId) return;
    const q = new URLSearchParams(window.location.search);
    if (!q.get("stripe")) return;
    window.history.replaceState(null, "", window.location.pathname);
    callPayments("refresh_account", {}).then(reload).catch(() => {});
  }, [engineerId, reload]);
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
  // Test engineer accounts can set up Stripe (test mode) before payments go live for everyone.
  const live = settings.payments_live || !!stripe?.profile?.is_test;
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

// ─── Take payment (job card button) ─────────────────────────────────────────
// The engineer picks the outcome and how the customer pays. The job shows as
// "Awaiting payment" until the money is in, then completes by itself.
export const isAwaitingPayment = (job) =>
  !!job.pendingOutcome && job.paymentStatus === "outstanding" && !["completed", "beyond_repair", "cancelled"].includes(job.status);

export function TakePaymentModal({ job: initialJob, data, onClose, onDone }) {
  const { settings } = data;
  const [job, setJob] = useState(initialJob);
  const [outcome, setOutcome] = useState(initialJob.pendingOutcome || "Completed");
  const [method, setMethod] = useState(initialJob.hasSavedCard ? "card" : "link");
  const [partDesc, setPartDesc] = useState("");
  const [partPrice, setPartPrice] = useState("");
  // Outcome report: the SP's short write-up of the job. Kept on the booking as
  // the record of work carried out and included in the customer's
  // job-completed notification.
  const [report, setReport] = useState(initialJob.outcomeReport || "");
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");
  const [qr, setQr] = useState(null);
  const [cardFailed, setCardFailed] = useState(false);
  const [waiting, setWaiting] = useState(isAwaitingPayment(initialJob));
  const live = !!settings.payments_live || !!initialJob.isTest;
  const paidStatuses = ["paid", "refunded", "part_refunded"];
  const done = paidStatuses.includes(job.paymentStatus) || ["completed", "beyond_repair"].includes(job.status);

  // Keep the booking fresh while the screen is open (parts approval, payment).
  useEffect(() => {
    let stop = false;
    const tick = async () => {
      const { data: row } = await supabase.from("bookings").select("*").eq("id", job.id).maybeSingle();
      if (stop || !row) return;
      const STATUS = { Completed: "completed", "Beyond Repair": "beyond_repair", Cancelled: "cancelled", "In Progress": "in_progress" };
      setJob((j) => ({ ...j, ...mapPaymentFields(row), status: STATUS[row.status] || j.status }));
    };
    const id = setInterval(tick, 4000);
    return () => { stop = true; clearInterval(id); };
  }, [job.id]);
  useEffect(() => { if (done) onDone?.(); }, [done]); // eslint-disable-line react-hooks/exhaustive-deps

  const ber = outcome === "Beyond Repair";
  const callout = calloutPenceFor(job, settings);
  const parts = ber ? 0 : job.partsApprovalStatus === "approved" ? job.partsTotalPence : 0;
  const adminFee = job.adminFeeAppliedAt ? Number(job.adminFeePence || 0) : 0;
  const total = callout + parts + adminFee;
  const partsPending = !ber && job.partsApprovalStatus === "pending";
  const showCard = job.hasSavedCard && !cardFailed;
  const REPORT_MIN = 20;
  const reportOk = report.trim().length >= REPORT_MIN;
  const blocked = partsPending || !reportOk;
  const saveReport = async () => {
    const { error } = await supabase.from("bookings")
      .update({ outcome_report: report.trim(), outcome_report_at: new Date().toISOString() }).eq("id", job.id);
    return error;
  };

  const sendParts = async () => {
    const pence = poundsToPence(partPrice);
    if (!partDesc.trim() || pence <= 0) { setErr("Enter what the part is and its price."); return; }
    setBusy("parts"); setErr("");
    const lines = [...(job.partsLines || []), { id: `p${Date.now()}`, description: partDesc.trim(), price_pence: pence }];
    const { error } = await supabase.from("bookings").update({ parts_lines: lines }).eq("id", job.id);
    if (error) { setBusy(""); setErr(error.message); return; }
    try { await callPayments("send_parts_approval", { bookingId: job.id }); setNote("Parts sent to the customer to approve. This screen updates as soon as they do."); }
    catch (e) { setNote(`Parts saved. The approval link couldn't be sent automatically (${e.message}), so EasyRepair will confirm with the customer.`); }
    setJob((j) => ({ ...j, partsLines: lines, partsApprovalStatus: "pending" }));
    setPartDesc(""); setPartPrice(""); setBusy("");
  };

  const take = async (m) => {
    if (busy) return;
    if (!reportOk) { setErr("Add an outcome report before taking payment."); return; }
    setBusy(m); setErr(""); setNote("");
    try {
      const repErr = await saveReport();
      if (repErr) throw new Error(`Couldn't save the outcome report: ${repErr.message}`);
      const res = await callPayments("take_payment", { bookingId: job.id, outcome, method: m });
      if (m === "card") {
        if (res.ok === false) { setCardFailed(true); setMethod("link"); setErr(`The saved card didn't go through (${String(res.reason || "declined").replace(/\.$/, "")}). Choose another way for the customer to pay.`); }
        else setNote("Card charged.");
      } else {
        setWaiting(true);
        if (res.error) setErr(res.error);
        if (m === "sms" || m === "email") { if (res.sent) setNote(`Payment link sent by ${m === "sms" ? "text" : "email"}. Stay with the customer until it shows as paid.`); }
        if (m === "qr") setQr(res.svg);
        if (m === "phone") { window.open(res.url, "_blank", "noopener"); setNote("The payment page has opened. Hand your phone to the customer to enter their card."); }
      }
    } catch (e) { setErr(e.message); }
    setBusy("");
  };

  // Before payments go live: customer pays the engineer directly, as now.
  const paidDirectly = async () => {
    if (busy) return;
    if (!reportOk) { setErr("Add an outcome report before confirming payment."); return; }
    setBusy("direct"); setErr("");
    const { error } = await supabase.from("bookings").update({
      outcome_report: report.trim(), outcome_report_at: new Date().toISOString(),
      payment_taken: true, payment_taken_at: new Date().toISOString(),
      status: outcome, completed_date: new Date().toISOString().slice(0, 10),
    }).eq("id", job.id);
    setBusy("");
    if (error) setErr(error.message); else { setJob((j) => ({ ...j, status: outcome === "Completed" ? "completed" : "beyond_repair" })); }
  };

  const choice = (on, label, onClick, disabled) => (
    <button onClick={onClick} disabled={disabled} className="flex-1 rounded-lg px-3 py-3 text-sm font-bold"
      style={on ? { background: C.primary, color: "#000" } : { background: "transparent", color: C.text, border: `1px solid ${C.border}` }}>
      {label}{on ? " ✓" : ""}
    </button>
  );
  const field = (label, children) => (<div className="mb-3"><p className="text-xs font-semibold mb-1" style={{ color: C.primary }}>{label}</p>{children}</div>);
  const box = (v) => <div className="rounded-lg px-3 py-3 text-sm font-semibold" style={{ background: "rgba(255,255,255,0.9)", color: "#555" }}>{v}</div>;
  const big = (label, onClick, disabled, key) => (
    <button key={key} onClick={onClick} disabled={disabled} className="w-full rounded-lg px-3 py-3 text-sm font-bold mb-2"
      style={{ background: disabled ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.14)", color: disabled ? C.light : C.text }}>{label}</button>
  );

  return (
    <div className="modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.7)" }} onClick={onClose}>
      <ScrollLock />
      <div className="modal-card w-full max-w-md rounded-xl p-5 overflow-y-auto" style={{ ...modalCardStyle, maxHeight: "92vh" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="text-lg font-bold" style={{ color: C.text }}>Take payment</p>
            <p className="text-xs" style={{ color: C.mid }}>{job.customerName} · {job.applianceType}</p>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ color: C.mid, background: "none", border: "none", fontSize: 20, cursor: "pointer" }}>✕</button>
        </div>

        {done ? (
          <div className="text-center py-6">
            <p className="text-3xl mb-2" style={{ color: C.success }}>✓</p>
            <p className="text-lg font-bold" style={{ color: C.text }}>{paidStatuses.includes(job.paymentStatus) ? `Paid ${penceToGBP(job.totalPence ?? total)}` : "Payment recorded"}</p>
            <p className="text-sm mt-1" style={{ color: C.mid }}>The job is now {job.status === "beyond_repair" || outcome === "Beyond Repair" ? "marked Beyond Repair" : "completed"}. Thank you.</p>
            <button onClick={onClose} className="mt-4 px-4 py-2 rounded-lg text-sm font-bold" style={{ background: C.primary, color: "#000" }}>Done</button>
          </div>
        ) : (
          <>
            {live && showCard && (
              <div className="mb-4">
                <p className="text-xs font-semibold mb-1" style={{ color: C.primary }}>Payment method</p>
                <div className="rounded-lg px-3 py-3 text-sm" style={{ background: "#f59e0b", color: "#3b2500" }}><b>Card on file</b> · fill out the form fields below</div>
              </div>
            )}
            {live && !showCard && (
              <div className="flex gap-2 mb-4 flex-wrap">
                {choice(method === "link", "Payment link", () => setMethod("link"))}
                {choice(method === "qr", "QR code", () => setMethod("qr"))}
                {choice(method === "phone", "Phone payment", () => setMethod("phone"))}
              </div>
            )}

            {field("Outcome", <div className="flex gap-2">
              {choice(outcome === "Completed", "Repaired", () => setOutcome("Completed"), waiting)}
              {choice(outcome === "Beyond Repair", "BER", () => setOutcome("Beyond Repair"), waiting)}
            </div>)}

            {field("Outcome report", <>
              <textarea className={inputCls} style={{ ...modalInputStyle, minHeight: 96, resize: "vertical" }} rows={4}
                disabled={waiting} value={report} onChange={(e) => setReport(e.target.value)}
                placeholder={ber
                  ? "e.g. Diagnosed failed motor and control board. Parts cost more than the value of the machine, so it isn't economical to repair. Advised customer to replace."
                  : "e.g. Drain pump blocked with debris and pump motor failing. Replaced drain pump, cleared filter and hose, ran a full test cycle with no leaks."} />
              <p className="text-xs mt-1" style={{ color: reportOk || !report ? C.light : C.warn }}>
                {ber ? "Explain what you found and why it's beyond economical repair. " : "Briefly explain the fault and the work you carried out. "}
                This is kept as the record of the job and is <b style={{ color: C.text }}>sent to the customer</b> in their job-completed message, so keep it clear and professional.
                {!reportOk && report.trim().length > 0 && ` (${REPORT_MIN - report.trim().length} more characters needed)`}
              </p>
            </>)}

            {!ber && (!waiting || job.partsLines?.length > 0) && field("Part costs", <>
              {(job.partsLines || []).map((l, i) => (
                <div key={l.id || i} className="flex justify-between text-sm py-1" style={{ color: C.text }}>
                  <span>{l.description}</span><span>{penceToGBP(l.price_pence)}</span>
                </div>
              ))}
              {job.partsLines?.length > 0 && <p className="text-xs mb-2" style={{ color: job.partsApprovalStatus === "approved" ? C.success : job.partsApprovalStatus === "declined" ? C.danger : C.warn }}>
                {job.partsApprovalStatus === "approved" ? "Approved by the customer" : job.partsApprovalStatus === "declined" ? "Declined by the customer: not charged" : "Waiting for the customer to approve…"}
              </p>}
              {!waiting && <div className="flex gap-2">
                <input className={inputCls} style={modalInputStyle} placeholder="Part (e.g. drain pump)" value={partDesc} onChange={(e) => setPartDesc(e.target.value)} />
                <input className={inputCls} style={{ ...modalInputStyle, maxWidth: 100 }} type="number" step="0.01" placeholder="£" value={partPrice} onChange={(e) => setPartPrice(e.target.value)} />
              </div>}
              {!waiting && (partDesc || partPrice) && <button onClick={sendParts} disabled={!!busy} className="mt-2 px-3 py-2 rounded-lg text-xs font-bold" style={{ background: C.warnSoft, color: C.warn }}>{busy === "parts" ? "Sending…" : "Send parts to customer for approval"}</button>}
            </>)}

            {field("Callout", box(penceToGBP(callout)))}
            {adminFee > 0 && field("Admin fee", box(penceToGBP(adminFee)))}
            {field("Total", box(penceToGBP(total)))}

            {partsPending && <p className="text-sm mb-3" style={{ color: C.warn }}>The customer needs to approve the parts before you can take payment.</p>}
            {!reportOk && !waiting && <p className="text-sm mb-3" style={{ color: C.warn }}>Add an outcome report above before taking payment.</p>}

            {!live && <>
              <p className="text-xs mb-2" style={{ color: C.light }}>Card payments through EasyRepair aren't switched on yet. Take payment from the customer as you do now, then confirm here.</p>
              {big(busy === "direct" ? "Saving…" : `Customer has paid ${penceToGBP(total)}`, paidDirectly, !!busy || blocked)}
            </>}

            {live && showCard && big(busy === "card" ? "Processing…" : "Process payment", () => take("card"), !!busy || blocked)}

            {live && !showCard && method === "link" && <>
              {big(busy === "sms" ? "Sending…" : "Send payment link via text", () => take("sms"), !!busy || blocked)}
              {big(busy === "email" ? "Sending…" : "Send payment link via email", () => take("email"), !!busy || blocked)}
            </>}
            {live && !showCard && method === "qr" && (qr
              ? <div className="flex flex-col items-center mb-3"><div className="rounded-lg p-3" style={{ background: "#fff" }} dangerouslySetInnerHTML={{ __html: qr }} /><p className="text-xs mt-2" style={{ color: C.mid }}>Ask the customer to scan this with their phone camera and pay {penceToGBP(total)}.</p></div>
              : big(busy === "qr" ? "Creating…" : "Show QR code", () => take("qr"), !!busy || blocked))}
            {live && !showCard && method === "phone" && <>
              <p className="text-xs mb-2" style={{ color: C.light }}>Opens the secure Stripe payment page on your phone for the customer to enter their card. You never see their card details.</p>
              {big(busy === "phone" ? "Opening…" : "Open payment page", () => take("phone"), !!busy || blocked)}
            </>}

            {waiting && <p className="text-sm mt-2 font-semibold" style={{ color: C.warn }}>Awaiting payment… This updates by itself when the customer pays. Please don't leave until it shows as paid.</p>}
            {note && <p className="text-sm mt-2" style={{ color: C.success }}>{note}</p>}
            {err && <p className="text-sm mt-2" style={{ color: C.danger }}>{err}</p>}
          </>
        )}
      </div>
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
  const [noShowArmed, setNoShowArmed] = useState(false);
  useEffect(() => { setLines((job.partsLines || []).map((l) => ({ ...l, price: ((l.price_pence || 0) / 100).toFixed(2) }))); }, [job.partsLines]);
  if (!data.ready) return null;

  // Test jobs behave as live (Stripe test mode) so parts approval links and
  // payment links are sent for them too -- same rule as TakePaymentModal.
  const live = !!settings.payments_live || !!job.isTest;
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

      {/* payment record (once the customer has paid) */}
      {job.stripePaymentIntentId && ["paid", "refunded", "part_refunded"].includes(job.paymentStatus) && (
        <div className="rounded-lg p-3 mt-3" style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${C.border}` }}>
          <p className="text-sm font-medium" style={{ color: C.text }}>Payment received</p>
          <Line k="Paid" v={job.paidAt ? new Date(job.paidAt).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "\u2014"} />
          <Line k="How" v={[PAID_VIA_LABELS[job.paidVia] || "Card", cardLabel(job)].filter(Boolean).join(" \u00b7 ")} />
          <Line k="Amount" v={penceToGBP(job.totalPence ?? m.total)} />
          <Line k="Your share" v={penceToGBP(job.engineerSharePence ?? m.engineerNet)} />
          <p className="text-xs mt-2" style={{ color: C.light }}>Payment reference</p>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs break-all" style={{ color: C.mid, fontFamily: "monospace" }}>{job.stripePaymentIntentId}</span>
            <button onClick={() => { navigator.clipboard?.writeText(job.stripePaymentIntentId); setCopied(true); setTimeout(() => setCopied(false), 2000); }} className="px-2 py-1 rounded-lg text-xs font-semibold" style={btn("ghost")}>{copied ? "Copied" : "Copy"}</button>
          </div>
          <p className="text-xs mt-1" style={{ color: C.light }}>Quote this, with the booking reference, if you need to ask EasyRepair about this payment.</p>
        </div>
      )}

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

      {/* customer not home (two taps) */}
      {job.scheduledDate && !job.noShow && !["completed", "beyond_repair", "cancelled"].includes(job.status) && (
        <div className="mt-3">
          <button
            onClick={async () => {
              if (!noShowArmed) { setNoShowArmed(true); return; }
              setNoShowArmed(false);
              const { error } = await supabase.from("bookings").update({ no_show: true }).eq("id", job.id);
              if (error) setErr(error.message); else await onChanged?.();
            }}
            title="Use this while you're at the property and the customer isn't there"
            className="px-3 py-1.5 rounded-lg text-xs font-semibold"
            style={{ background: C.warnSoft, color: C.warn }}
          >
            {noShowArmed ? "Tap again to confirm the customer isn't home" : "Customer not home"}
          </button>
        </div>
      )}
      {job.noShow && <p className="text-xs mt-3" style={{ color: C.warn }}>You recorded that the customer wasn't home. EasyRepair will contact them and may charge a no-show fee, part of which is paid to you.</p>}

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
    <div className="modal-overlay fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.6)" }} onClick={onClose}>
      <ScrollLock />
      <div className="modal-card w-full max-w-md rounded-xl p-6 overflow-y-auto" style={{ ...modalCardStyle, maxHeight: "90vh" }} onClick={(e) => e.stopPropagation()}>
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

// ─── CSV export (Bookings -> Payments) ──────────────────────────────────────
// Lets an SP download their payments for their accountant. One row per money
// line: jobs paid through Stripe, jobs paid by EasyRepair at the SP's per-job
// rate, no-show/late-cancel fee shares, and commission they repay. Amounts are
// plain numbers in pounds (no £ sign) so spreadsheets can add them up.
const csvCell = (v) => {
  const s = v == null ? "" : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const pounds = (pence) => (pence == null || pence === "" ? "" : (Number(pence) / 100).toFixed(2));
const dayOf = (d) => (d ? String(d).slice(0, 10) : "");
const ukDate = (iso) => (iso ? iso.split("-").reverse().join("/") : "");
const refOf = (j) => j?.bookingRef || (j?.id ? `#${String(j.id).slice(0, 8)}` : "");

export function buildPaymentRows({ currentUser, jobs, data }) {
  const mine = jobs.filter((j) => j.engineerId === currentUser.engineerRowId);
  const settings = data?.settings;
  const overrides = data?.overrides || [];
  const rows = [];
  const stripeJob = (j) => (j.paymentStatus && j.paymentStatus !== "not_charged") || j.hasSavedCard || j.paymentTiming === "after";

  for (const j of mine) {
    const base = { ref: refOf(j), customer: j.customerName || "", postcode: j.postcode || "", appliance: j.applianceType || "", completed: dayOf(j.completedDate) };
    if (j.status === "completed" && stripeJob(j) && settings) {
      const m = jobMoney(j, settings, overrides);
      rows.push({
        ...base,
        date: dayOf(j.paidAt) || base.completed,
        type: "Job (paid through Stripe)",
        customerPaid: m.total, parts: m.partsApproved, commission: m.commission,
        cardFee: m.engineerPaysFee ? m.fee : 0, refund: j.refundAmountPence,
        amount: m.engineerNet,
        status: PAYMENT_STATUS_LABELS[j.paymentStatus] || j.paymentStatus,
        paidOn: dayOf(j.paidAt),
      });
    } else if (j.status === "completed" && !stripeJob(j)) {
      const rate = Math.round(Number(currentUser.payRate || 0) * 100);
      rows.push({
        ...base,
        date: base.completed,
        type: "Job (paid by EasyRepair)",
        amount: rate,
        status: j.paid ? "Paid" : "Unpaid",
      });
    }
    if (j.cancellationFeeStatus === "charged" && Number(j.feeEngineerSharePence) > 0) {
      rows.push({
        ...base,
        date: dayOf(j.noShowAt || j.cancelledAt),
        type: j.cancellationFeeType === "no_show" ? "No-show fee share" : "Late cancellation fee share",
        customerPaid: j.cancellationFeePence,
        amount: Number(j.feeEngineerSharePence),
        status: "Charged",
      });
    }
  }

  for (const r of data?.recoveries || []) {
    const j = mine.find((x) => x.id === r.booking_id);
    rows.push({
      ref: refOf(j), customer: j?.customerName || "", postcode: j?.postcode || "", appliance: j?.applianceType || "", completed: dayOf(j?.completedDate),
      date: dayOf(r.created_at),
      type: `Commission recovery${r.reason ? ` (${r.reason})` : ""}`,
      amount: -Number(r.amount_pence || 0),
      status: r.status,
    });
  }

  return rows.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
}

export function ExportPaymentsBar({ currentUser, jobs, data }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const all = buildPaymentRows({ currentUser, jobs, data });
  const rows = all.filter((r) => (!from || (r.date && r.date >= from)) && (!to || (r.date && r.date <= to)));
  const total = rows.reduce((s, r) => s + Number(r.amount || 0), 0);

  const download = () => {
    const head = ["Date", "Type", "Booking ref", "Customer", "Postcode", "Appliance", "Job completed", "Customer paid (£)", "Parts (£)", "EasyRepair commission (£)", "Card fee you paid (£)", "Refunded to customer (£)", "Amount to you (£)", "Status", "Paid on"];
    const lines = [head, ...rows.map((r) => [
      ukDate(r.date), r.type, r.ref, r.customer, r.postcode, r.appliance, ukDate(r.completed),
      pounds(r.customerPaid), pounds(r.parts), pounds(r.commission), pounds(r.cardFee), pounds(r.refund), pounds(r.amount), r.status || "", ukDate(r.paidOn),
    ]), [], ["", "Total", "", "", "", "", "", "", "", "", "", "", pounds(total)]];
    const csv = "﻿" + lines.map((l) => l.map(csvCell).join(",")).join("\r\n");
    const name = (currentUser.name || "payments").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
    const range = from || to ? `-${from || "start"}-to-${to || "today"}` : `-${new Date().toISOString().slice(0, 10)}`;
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = `easyrepair-payments-${name}${range}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const dateInp = { ...modalInputStyle, colorScheme: "dark" };
  return (
    <div className="rounded-xl p-4 mb-5" style={{ background: C.card, border: `1px solid ${C.border}` }}>
      <p className="font-semibold" style={{ color: C.text }}>Export your payments</p>
      <p className="text-xs mb-3" style={{ color: C.mid }}>Download your payments as a spreadsheet for your accountant or tax return.</p>
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1" style={{ minWidth: 130 }}>
          <label className="block text-xs mb-1" style={{ color: C.mid }}>From</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputCls} style={dateInp} />
        </div>
        <div className="min-w-0 flex-1" style={{ minWidth: 130 }}>
          <label className="block text-xs mb-1" style={{ color: C.mid }}>To</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputCls} style={dateInp} />
        </div>
        <button onClick={download} disabled={!rows.length} className="px-4 py-2 rounded-lg text-sm font-semibold w-full sm:w-auto" style={{ ...btn("primary"), opacity: rows.length ? 1 : 0.5 }}>
          Export CSV ({rows.length})
        </button>
      </div>
      <p className="text-xs mt-2" style={{ color: C.mid }}>
        {rows.length ? `${rows.length} line${rows.length === 1 ? "" : "s"} · ${penceToGBP(total)} to you.` : "Nothing to export for these dates."} Leave the dates blank to export everything. Opens in Excel, Google Sheets or your accounting software.
      </p>
    </div>
  );
}
