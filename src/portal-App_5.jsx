import React, { useState, useEffect } from "react";
import { supabase } from "./lib/supabaseClient";

/* ------------------------------------------------------------------ */
/* Constants & sample data                                            */
/* Real identity/auth + the engineer's own profile fields (postcodes, */
/* appliance types, brand exclusions, pay rate, self-service toggle)  */
/* now come from the same Supabase project FixFlow writes to — see    */
/* mapEngineer()/loadEngineerProfile() below. Bookings are real too   */
/* now (the shared `bookings` table website submissions and FixFlow   */
/* reassignment both write to) — see loadBookings()/mapBookingRow()   */
/* below. RLS restricts what an engineer's own query can see/update   */
/* to just their own rows, so nothing here needs to re-check that     */
/* client-side, though a couple of views still filter defensively.    */
/* Time off stays local demo state for now (a separate, smaller        */
/* migration — see the project README).                                */
/* ------------------------------------------------------------------ */

const APPLIANCE_TYPES = ["Washing Machine", "Fridge/Freezer", "Dishwasher", "Oven/Cooker", "Tumble Dryer", "Microwave"];
const BRANDS = ["Bosch", "Samsung", "LG", "Hotpoint", "Beko", "Zanussi", "Whirlpool", "Indesit", "AEG", "Miele"];

const todayStr = () => new Date().toISOString().slice(0, 10);

/* ------------------------------------------------------------------ */
/* Colour tokens — kept as plain hex values (not Tailwind classes) so   */
/* they render correctly everywhere: in the real Vite/Tailwind build,   */
/* in any no-build preview, and without depending on tailwind.config.js */
/* being picked up. Mirrors the C object in FixFlow's own App.jsx.      */
/* ------------------------------------------------------------------ */

const C = {
  bg: "#000000",
  card: "#141414",
  sidebar: "#000000",
  primary: "#d4ff3c",
  primarySoft: "rgba(212,255,60,0.12)",
  success: "#4ade80",
  successSoft: "rgba(74,222,128,0.12)",
  warn: "#fbbf24",
  warnSoft: "rgba(251,191,36,0.12)",
  danger: "#f87171",
  dangerSoft: "rgba(248,113,113,0.12)",
  purple: "#c084fc",
  purpleSoft: "rgba(192,132,252,0.12)",
  orange: "#fb923c",
  orangeSoft: "rgba(251,146,60,0.15)",
  text: "#F1F5F9",
  mid: "#94A3B8",
  light: "#475569",
  border: "#262626",
};

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function successRate(engineer) {
  const { completed, ber } = engineer.stats;
  const total = completed + ber;
  if (total === 0) return 0;
  return Math.round((completed / total) * 100);
}

function rateColor(rate) {
  if (rate >= 80) return C.success;
  if (rate >= 60) return C.warn;
  return C.danger;
}

function fmtMoney(n) {
  return `£${Number(n || 0).toFixed(2)}`;
}

function fmtDateTime(dt) {
  if (!dt) return "—";
  const d = new Date(dt);
  return d.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function fmtDateShort(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

// Insurance expiry is a plain `date` column (no time), so compare on date
// strings directly rather than going through Date() + timezones.
function insuranceExpiryStatus(dateStr) {
  if (!dateStr) return null;
  const days = Math.ceil((new Date(dateStr) - new Date(todayStr())) / 86400000);
  if (days < 0) return { label: `Expired ${fmtDateShort(dateStr)}`, color: C.danger };
  if (days <= 30) return { label: `Expires ${fmtDateShort(dateStr)} — renew soon`, color: C.warn };
  return { label: `Expires ${fmtDateShort(dateStr)}`, color: C.mid };
}

const STATUS_STYLES = {
  unassigned: { bg: C.warnSoft, t: C.warn },
  assigned: { bg: C.primarySoft, t: C.primary },
  parts_awaited: { bg: C.warnSoft, t: C.warn },
  in_progress: { bg: C.orangeSoft, t: C.orange },
  completed: { bg: C.successSoft, t: C.success },
  beyond_repair: { bg: C.dangerSoft, t: C.danger },
  cancelled: { bg: "rgba(255,255,255,0.06)", t: C.mid },
};
const PRIORITY_STYLES = {
  normal: { bg: "rgba(255,255,255,0.06)", t: C.mid },
  high: { bg: C.warnSoft, t: C.warn },
  urgent: { bg: C.dangerSoft, t: C.danger },
};

// FixFlow's `bookings.status` values (shared table, capitalised, used by
// staff/owner's status dropdown too -- see STATUSES in fixflow/src/App.jsx)
// mapped to the lowercase/underscore scheme this file's views already key
// off of (STATUS_STYLES above, the "Mark In Progress" etc. buttons below).
// "Booked" maps to "unassigned" since that's what it means in practice: not
// yet actively assigned, even though this engineer's own RLS-filtered query
// should rarely surface one (a booking only appears here once engineer_id
// points at them) -- staff can still set status back to "Booked" by hand
// without clearing engineer_id, so the mapping needs to exist regardless.
const STATUS_ROW_TO_PORTAL = {
  "Booked": "unassigned",
  "Assigned": "assigned",
  "Parts Awaited": "parts_awaited",
  "In Progress": "in_progress",
  "Completed": "completed",
  "Beyond Repair": "beyond_repair",
  "Cancelled": "cancelled",
};
const STATUS_PORTAL_TO_ROW = Object.fromEntries(
  Object.entries(STATUS_ROW_TO_PORTAL).map(([row, portal]) => [portal, row])
);

// Maps a Supabase `engineers` row (joined with its `profiles` row) to the
// flat shape the views below already expect.
function mapEngineer(row) {
  return {
    id: row.profile_id,
    engineerRowId: row.id,
    name: row.profile?.name || "",
    phone: row.profile?.phone || "",
    email: row.profile?.email || "",
    payRate: row.pay_rate,
    postcodes: row.postcodes || [],
    applianceTypes: row.appliance_types || [],
    brandExclusions: row.brand_exclusions || {},
    integratedExclusions: [],
    stats: { completed: row.stats_completed, ber: row.stats_ber },
    selfServiceEnabled: row.self_service_enabled,
    workingHours: row.working_hours || {},
    idDocumentPath: row.id_document_path || null,
    idDocumentUploadedAt: row.id_document_uploaded_at || null,
    insuranceDocumentPath: row.insurance_document_path || null,
    insuranceDocumentUploadedAt: row.insurance_document_uploaded_at || null,
    insuranceExpiryDate: row.insurance_expiry_date || null,
    mustChangePassword: row.profile?.must_change_password || false,
    termsAcceptedAt: row.profile?.terms_accepted_at || null,
    // Not in Supabase yet (time off / holidays stays local demo state for now):
    timeOffApprovalRequired: true,
    timeOff: [],
  };
}

// Maps a Supabase `bookings` row to the flat shape DashboardView/BookingsView/
// PaymentsView already expect (they were originally written against
// initialJobs's local demo shape). scheduledDate is recombined from the
// table's separate scheduled_date/scheduled_time columns into the single
// "YYYY-MM-DDTHH:MM" string those views already sort/compare/format with.
function mapBookingRow(row) {
  return {
    id: row.id,
    customerName: row.customer,
    phone: row.phone,
    address: row.address || "",
    postcode: row.postcode || "",
    applianceType: row.appliance,
    brand: row.brand || "",
    applianceAge: row.appliance_age != null ? `${row.appliance_age} years` : "",
    isIntegrated: false, // not tracked in `bookings` yet
    faultDescription: row.issue || "",
    scheduledDate: row.scheduled_date ? `${row.scheduled_date}T${row.scheduled_time || "09:00"}` : "",
    // `bookings.completed_date` is a date only (no time) -- fmtDateTime()
    // still renders it fine, just always shown at midnight.
    completedDate: row.completed_date || null,
    engineerId: row.engineer_id,
    status: STATUS_ROW_TO_PORTAL[row.status] || "unassigned",
    priority: (row.priority || "Normal").toLowerCase(),
    paid: !!row.paid,
    // Stamped by a DB trigger whenever engineer_id is set/changed (see
    // 0003_decline_and_settings.sql) -- used to time out the Decline button
    // below once declineWindowMinutes has passed since this assignment.
    assignedAt: row.assigned_at || null,
  };
}

// The only fields an engineer is ever allowed to change from Portal are
// status and (when completing) completedDate -- everything else on a
// booking is staff/owner-only, and RLS's "engineer updates own" policy would
// reject an attempt to write anything else anyway. onUpdateJob (below) is
// always called with a full job object for convenience on the UI side, but
// this only pulls out what's actually meant to be written back.
function bookingPatchFromUpdate(updated) {
  const patch = { status: STATUS_PORTAL_TO_ROW[updated.status] || "Booked" };
  if (updated.status === "completed") {
    patch.completed_date = (updated.completedDate || new Date().toISOString()).slice(0, 10);
  }
  return patch;
}

// The fields an engineer needs to fill in (or have staff fill in for them
// from FixFlow -- same columns, so either side completing them clears the
// nudge for both) before their profile counts as fully set up.
function profileCompletionGaps(engineer) {
  const gaps = [];
  if (!engineer.postcodes?.length) gaps.push("Coverage postcodes");
  if (!engineer.applianceTypes?.length) gaps.push("Skills / appliance types");
  if (!engineer.workingHours || Object.keys(engineer.workingHours).length === 0) gaps.push("Working hours");
  if (!engineer.idDocumentPath) gaps.push("ID document");
  if (!engineer.insuranceDocumentPath) gaps.push("Public Liability Insurance document");
  else if (!engineer.insuranceExpiryDate) gaps.push("Public Liability Insurance expiry date");
  return gaps;
}

// When someone follows an invite or password-reset email, Supabase redirects here with
// #access_token=...&type=invite (or type=recovery) in the URL. supabase-js's own
// auto-detection of this is turned off (see supabaseClient.js) because it ran
// asynchronously and reliably beat any check we did at render time -- by the time we
// looked, it had already consumed and stripped the hash, so the "set your password"
// screen this is supposed to trigger never appeared. Instead we capture it ourselves here,
// synchronously, the instant this module loads -- before anything else can touch it -- and
// the App component below establishes the session from these tokens itself.
const AUTH_HASH = (() => {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const type = params.get("type");
  if (!type) return null;
  return { type, accessToken: params.get("access_token"), refreshToken: params.get("refresh_token") };
})();

function inviteOrRecoveryType() {
  return AUTH_HASH?.type || null;
}

/* ------------------------------------------------------------------ */
/* Small UI atoms — same conventions as FixFlow so the two apps read   */
/* as one family rather than two differently-designed products.        */
/* ------------------------------------------------------------------ */

function Pill({ bg, color, style, children }) {
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ background: bg, color, ...style }}
    >
      {children}
    </span>
  );
}

function Field({ label, children }) {
  return (
    <label className="block mb-3">
      <span className="block text-xs font-medium mb-1" style={{ color: C.mid }}>{label}</span>
      {children}
    </label>
  );
}

const inputCls = "w-full rounded-lg px-3 py-2 text-sm outline-none";
const inputStyle = { background: C.sidebar, border: `1px solid ${C.border}`, color: C.text };

/* ------------------------------------------------------------------ */
/* Login                                                                */
/* ------------------------------------------------------------------ */

function LoginScreen({ onLogin }) {
  const [mode, setMode] = useState("login"); // "login" | "forgot"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetMsg, setResetMsg] = useState("");

  async function attemptLogin() {
    setError(""); setLoading(true);
    const { data, error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
    if (signInErr) { setError("Incorrect email or password."); setLoading(false); return; }
    const { data: profile, error: profErr } = await supabase.from("profiles").select("*").eq("id", data.user.id).single();
    if (profErr || !profile) {
      await supabase.auth.signOut();
      setError("Couldn't find an account for this login. Contact your admin."); setLoading(false); return;
    }
    if (profile.role !== "engineer") {
      await supabase.auth.signOut();
      setError("This login isn't an engineer account — staff/owners sign in at the FixFlow admin panel instead.");
      setLoading(false); return;
    }
    const { data: engRow, error: engErr } = await supabase.from("engineers").select("*, profile:profiles(name,phone,email,must_change_password,terms_accepted_at)").eq("profile_id", data.user.id).single();
    if (engErr || !engRow) {
      await supabase.auth.signOut();
      setError("Your account isn't fully set up yet — contact your admin."); setLoading(false); return;
    }
    onLogin(mapEngineer(engRow));
  }

  // Sends the standard Supabase recovery email. The link it contains lands the
  // engineer back here with #access_token=...&type=recovery in the hash, which
  // AUTH_HASH/inviteOrRecoveryType() above already know how to catch — App
  // renders SetPasswordScreen for that case exactly the same way it does for
  // an invite link, so no new landing screen is needed here.
  async function sendReset() {
    setError(""); setResetMsg("");
    if (!email) { setError("Enter your email above first."); return; }
    setLoading(true);
    const { error: resetErr } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
    setLoading(false);
    if (resetErr) { setError(resetErr.message); return; }
    setResetMsg("If an account exists for that email, we've sent a link to reset your password. Check your inbox.");
  }

  function switchMode(m) { setMode(m); setError(""); setResetMsg(""); }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: C.sidebar }}>
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center">
            <img src="/logo.png" alt="Easy Repair" className="h-20 w-auto" />
          </div>
          <p className="text-sm mt-3" style={{ color: C.light }}>Your bookings, earnings, and profile</p>
        </div>
        {mode === "login" ? (
          <form
            onSubmit={(e) => { e.preventDefault(); attemptLogin(); }}
            className="rounded-xl shadow-xl p-6"
            style={{ background: C.card, border: `1px solid ${C.border}` }}
          >
            <Field label="Email"><input className={inputCls} style={inputStyle} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@easyrepair.co.uk" /></Field>
            <Field label="Password"><input className={inputCls} style={inputStyle} type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" /></Field>
            <div className="text-right -mt-1 mb-3">
              <button type="button" onClick={() => switchMode("forgot")} className="text-xs font-semibold" style={{ background: "none", border: "none", padding: 0, color: C.light, cursor: "pointer" }}>Forgot your password?</button>
            </div>
            {error && <p className="text-sm mb-3" style={{ color: C.danger }}>{error}</p>}
            <button className="w-full font-bold rounded-lg py-2.5 transition" style={{ background: C.primary, color: C.sidebar, opacity: loading ? 0.7 : 1 }}>
              {loading ? "Signing in…" : "Log in"}
            </button>
          </form>
        ) : (
          <div className="rounded-xl shadow-xl p-6" style={{ background: C.card, border: `1px solid ${C.border}` }}>
            <p className="text-sm mb-4" style={{ color: C.light }}>Enter your email and we'll send you a link to reset your password.</p>
            <Field label="Email"><input className={inputCls} style={inputStyle} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@easyrepair.co.uk" onKeyDown={(e) => e.key === "Enter" && sendReset()} /></Field>
            {error && <p className="text-sm mb-3" style={{ color: C.danger }}>{error}</p>}
            {resetMsg && <p className="text-sm mb-3" style={{ color: C.success }}>{resetMsg}</p>}
            <button onClick={sendReset} className="w-full font-bold rounded-lg py-2.5 transition" style={{ background: C.primary, color: C.sidebar, opacity: loading ? 0.7 : 1 }}>
              {loading ? "Sending…" : "Send Reset Link →"}
            </button>
            <div className="text-center mt-4">
              <button onClick={() => switchMode("login")} className="text-xs font-semibold" style={{ background: "none", border: "none", padding: 0, color: C.light, cursor: "pointer" }}>← Back to login</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Set password (invite / reset link landing)                          */
/* ------------------------------------------------------------------ */

function SetPasswordScreen({ onDone }) {
  const [pass, setPass] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError("");
    if (pass.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (pass !== confirm) { setError("Passwords don't match."); return; }
    setBusy(true);
    const { error: updErr } = await supabase.auth.updateUser({ password: pass });
    setBusy(false);
    if (updErr) { setError(updErr.message); return; }
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
    onDone();
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: C.sidebar }}>
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <img src="/logo.png" alt="Easy Repair" className="h-10 w-auto mx-auto" />
          <p className="text-sm mt-3" style={{ color: C.light }}>Set your password to finish setting up your account</p>
        </div>
        <div className="rounded-xl shadow-xl p-6" style={{ background: C.card, border: `1px solid ${C.border}` }}>
          <Field label="New Password"><input type="password" className={inputCls} style={inputStyle} value={pass} onChange={(e) => setPass(e.target.value)} placeholder="••••••••" /></Field>
          <Field label="Confirm Password"><input type="password" className={inputCls} style={inputStyle} value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="••••••••" onKeyDown={(e) => e.key === "Enter" && submit()} /></Field>
          {error && <p className="text-sm mb-3" style={{ color: C.danger }}>{error}</p>}
          <button onClick={submit} className="w-full font-bold rounded-lg py-2.5 transition" style={{ background: C.primary, color: C.sidebar, opacity: busy ? 0.7 : 1 }}>
            {busy ? "Saving…" : "Set Password →"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Terms of service gate — shown once, on a new engineer's first login, */
/* until they accept. Placeholder summary text; the full agreement     */
/* lives on the website.                                                */
/* ------------------------------------------------------------------ */

const TERMS_SUMMARY_POINTS = [
  "You're an independent service provider, not an employee of Easy Repair.",
  "You're responsible for holding valid Public Liability Insurance for all work you carry out.",
  "Jobs must be completed to a professional standard and within the agreed timeframe.",
  "Payment terms and rates are as set out in your engineer profile and the full agreement.",
  "Easy Repair may suspend or terminate access for breach of these terms or repeated customer complaints.",
];
const TERMS_URL = "https://www.easyrepair.co.uk/service-provider-terms";

function TermsGateScreen({ onAccept }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  // onAccept (App's onAcceptTerms) throws if the database write itself
  // failed -- previously this just called `await onAccept()` with no
  // error handling at all, so a failed write (RLS misconfigured, network
  // blip, the terms_accepted_at/terms_version columns not existing yet
  // because 0002_provisioning_and_terms.sql hadn't been run) still hid this
  // screen for the rest of that session even though nothing was actually
  // saved -- it would silently reappear next time they logged in, with no
  // indication anything had gone wrong. Now a failure keeps them on this
  // screen with a visible error instead of a false "accepted".
  async function accept() {
    setErr(""); setBusy(true);
    try {
      await onAccept();
    } catch (e) {
      setErr(e?.message || "Something went wrong saving your acceptance. Please try again.");
    }
    setBusy(false);
  }
  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: C.sidebar }}>
      <div className="w-full max-w-lg">
        <div className="text-center mb-6">
          <img src="/logo.png" alt="Easy Repair" className="h-10 w-auto mx-auto" />
          <p className="text-sm mt-3" style={{ color: C.light }}>Before you get started</p>
        </div>
        <div className="rounded-xl shadow-xl p-6" style={{ background: C.card, border: `1px solid ${C.border}` }}>
          <h2 className="text-base font-bold mb-3" style={{ color: C.text }}>Service Provider Terms</h2>
          <ul className="mb-4 space-y-2">
            {TERMS_SUMMARY_POINTS.map((point, i) => (
              <li key={i} className="text-sm flex gap-2" style={{ color: C.mid }}>
                <span style={{ color: C.primary }}>•</span>
                <span>{point}</span>
              </li>
            ))}
          </ul>
          <a href={TERMS_URL} target="_blank" rel="noreferrer" className="text-sm underline block mb-5" style={{ color: C.primary }}>
            Read the full Service Provider Terms
          </a>
          {err && (
            <div className="text-sm font-semibold rounded-lg px-3 py-2 mb-4" style={{ background: "rgba(248,113,113,0.15)", color: "#f87171" }}>
              {err}
            </div>
          )}
          <button onClick={accept} disabled={busy} className="w-full font-bold rounded-lg py-2.5 transition" style={{ background: C.primary, color: C.sidebar, opacity: busy ? 0.7 : 1 }}>
            {busy ? "Saving…" : "I Accept"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Nav icons                                                            */
/* ------------------------------------------------------------------ */

// Stroke SVGs (not emoji) for the nav items that have one -- matches the
// icon set swapped into FixFlow's admin panel, so the two apps stay
// visually consistent. Emoji ignore the active/inactive `color` set on
// the button, so anything switched to one of these also picks up the
// proper active-state tint for free. Support keeps its emoji for now
// (no replacement icon supplied yet) -- PORTAL_NAV entries without an
// `Ic` just render their `ic` emoji instead, see Sidebar/MobileTabBar.
const navIconBase = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" };
const IconLayout = ({ size = 18 }) => ( // Dashboard
  <svg width={size} height={size} {...navIconBase}>
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
    <line x1="9" y1="3" x2="9" y2="21" />
  </svg>
);
const IconMenuLines = ({ size = 18 }) => ( // Bookings
  <svg width={size} height={size} {...navIconBase}>
    <line x1="3" y1="6" x2="21" y2="6" />
    <line x1="3" y1="12" x2="21" y2="12" />
    <line x1="3" y1="18" x2="21" y2="18" />
  </svg>
);
const IconGear = ({ size = 18 }) => ( // Settings
  <svg width={size} height={size} {...navIconBase}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

/* ------------------------------------------------------------------ */
/* Sidebar                                                              */
/* ------------------------------------------------------------------ */

// Shared between the desktop sidebar and the mobile bottom tab bar so the two
// never drift out of sync -- one list of destinations, two layouts.
// "payments" deliberately isn't listed here any more -- it's now a tab
// inside Bookings (see BookingsView) rather than its own top-level
// destination, since Payments is really just "completed bookings, viewed
// for what's owed" and didn't need a whole nav slot of its own.
// "support" is hidden too -- it's now a card at the bottom of Dashboard
// (see SupportCard) instead of its own page.
const PORTAL_NAV = [
  { key: "dashboard", label: "Dashboard", Ic: IconLayout },
  { key: "bookings", label: "Bookings", Ic: IconMenuLines },
  { key: "settings", label: "Settings", Ic: IconGear },
];

function Sidebar({ currentUser, activeView, setActiveView, onLogout }) {
  return (
    <div className="hidden md:flex md:flex-col w-56 shrink-0 min-h-screen" style={{ background: C.sidebar, color: C.mid }}>
      <div className="px-5 py-5 flex items-center" style={{ borderBottom: `1px solid ${C.border}` }}>
        <img src="/logo.png" alt="Easy Repair" className="h-6 w-auto" />
      </div>
      <nav className="flex-1 py-4 space-y-1 px-3">
        {PORTAL_NAV.map((n) => {
          const active = activeView === n.key;
          return (
            <button
              key={n.key}
              onClick={() => setActiveView(n.key)}
              className="w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition"
              style={{
                background: active ? C.primarySoft : "transparent",
                color: active ? C.primary : C.text,
                borderLeft: `2px solid ${active ? C.primary : "transparent"}`,
              }}
            >
              <span className="mr-2 inline-flex align-middle">{n.Ic ? <n.Ic size={17} /> : n.ic}</span>{n.label}
            </button>
          );
        })}
      </nav>
      <div className="px-4 py-4" style={{ borderTop: `1px solid ${C.border}` }}>
        <p className="text-sm font-medium" style={{ color: C.text }}>{currentUser.name}</p>
        <p className="text-xs mb-3" style={{ color: C.text }}>Engineer</p>
        <button onClick={onLogout} className="text-xs underline" style={{ color: C.text }}>Log out</button>
      </div>
    </div>
  );
}

// Mobile equivalent of the sidebar -- a fixed bar of tabs along the bottom of
// the screen, the pattern people actually expect on a phone. Sidebar and this
// only ever show one at a time (see the "hidden md:flex" / "md:hidden"
// classes), driven purely by CSS breakpoints so there's no resize listener or
// layout flash to manage.
function MobileTabBar({ activeView, setActiveView }) {
  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 flex z-50"
      style={{ background: C.sidebar, borderTop: `1px solid ${C.border}`, paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {PORTAL_NAV.map((n) => {
        const active = activeView === n.key;
        return (
          <button
            key={n.key}
            onClick={() => setActiveView(n.key)}
            className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2"
            style={{ color: active ? C.primary : C.light }}
          >
            <span className="text-lg leading-none">{n.Ic ? <n.Ic size={19} /> : n.ic}</span>
            <span className="text-[10px] font-medium leading-none">{n.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

/* ------------------------------------------------------------------ */
/* Dashboard                                                            */
/* ------------------------------------------------------------------ */

function DashboardView({ currentUser, jobs, setActiveView }) {
  const myJobs = jobs.filter((j) => j.engineerId === currentUser.engineerRowId);
  const todaysJobs = myJobs.filter((j) => j.scheduledDate && j.scheduledDate.startsWith(todayStr()));
  const pendingTimeOff = (currentUser.timeOff || []).filter((t) => t.status === "pending");
  const rate = successRate(currentUser);
  const completionGaps = profileCompletionGaps(currentUser);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1" style={{ color: C.text }}>Welcome back, {currentUser.name.split(" ")[0]}</h1>
      <p className="text-sm mb-6" style={{ color: C.mid }}>Here's where things stand today.</p>

      {completionGaps.length > 0 && (
        <div className="rounded-xl p-4 mb-6 flex items-center justify-between gap-4" style={{ background: C.warnSoft, border: `1px solid rgba(251,191,36,0.3)` }}>
          <div>
            <p className="font-medium mb-1" style={{ color: C.warn }}>Finish setting up your profile</p>
            <p className="text-sm" style={{ color: C.warn, opacity: 0.85 }}>Still needed: {completionGaps.join(", ")}.</p>
          </div>
          <button onClick={() => setActiveView("settings")} className="text-sm font-bold rounded-lg px-4 py-2 whitespace-nowrap" style={{ background: C.warn, color: "#1a1300" }}>
            Go to Settings
          </button>
        </div>
      )}

      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="rounded-xl p-5" style={{ background: C.card, borderLeft: `4px solid ${C.primary}` }}>
          <p className="text-sm" style={{ color: C.mid }}>Bookings today</p>
          <p className="text-3xl font-bold" style={{ color: C.text }}>{todaysJobs.length}</p>
        </div>
        <div className="rounded-xl p-5" style={{ background: C.card, borderLeft: `4px solid ${C.border}` }}>
          <p className="text-sm" style={{ color: C.mid }}>Success rate</p>
          <p className="text-3xl font-bold" style={{ color: rateColor(rate) }}>{rate}%</p>
        </div>
        <div className="rounded-xl p-5" style={{ background: C.card, borderLeft: `4px solid ${C.border}` }}>
          <p className="text-sm" style={{ color: C.mid }}>Repaired / BER</p>
          <p className="text-3xl font-bold" style={{ color: C.text }}>{currentUser.stats.completed} / {currentUser.stats.ber}</p>
        </div>
      </div>

      {pendingTimeOff.length > 0 && (
        <div className="rounded-xl p-4 mb-6" style={{ background: C.warnSoft, border: `1px solid rgba(251,191,36,0.3)` }}>
          <p className="font-medium mb-1" style={{ color: C.warn }}>You have {pendingTimeOff.length} time-off request{pendingTimeOff.length !== 1 ? "s" : ""} awaiting approval</p>
          <p className="text-sm" style={{ color: C.warn, opacity: 0.85 }}>Check Settings → Holidays & Time Off for details.</p>
        </div>
      )}

      <h2 className="text-lg font-semibold mb-3" style={{ color: C.text }}>Today's schedule</h2>
      <div className="rounded-xl" style={{ background: C.card, border: `1px solid ${C.border}` }}>
        {todaysJobs.length === 0 && <p className="p-4 text-sm" style={{ color: C.mid }}>Nothing scheduled today.</p>}
        {todaysJobs.map((j, i) => (
          <div key={j.id} className="p-4 flex items-center justify-between" style={{ borderTop: i > 0 ? `1px solid ${C.border}` : "none" }}>
            <div>
              <p className="font-medium" style={{ color: C.text }}>{j.customerName} — {j.applianceType} ({j.brand})</p>
              <p className="text-sm" style={{ color: C.mid }}>{fmtDateTime(j.scheduledDate)} · {j.address}</p>
            </div>
            <Pill bg={STATUS_STYLES[j.status].bg} color={STATUS_STYLES[j.status].t}>{j.status.replace("_", " ")}</Pill>
          </div>
        ))}
      </div>

      <h2 className="text-lg font-semibold mb-3 mt-8" style={{ color: C.text }}>Support</h2>
      <SupportCard />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Bookings (Bookings / Schedule / Reviews)                             */
/* ------------------------------------------------------------------ */

// Statuses that mean a booking is done and belongs under the "Completed"
// sub-tab below (see STATUS_ROW_TO_PORTAL above for the full status set).
const CLOSED_STATUSES = ["completed", "beyond_repair", "cancelled"];

function BookingsView({ currentUser, jobs, onUpdateJob, onDeclineJob, declineWindowMinutes }) {
  const [tab, setTab] = useState("bookings");
  const [subTab, setSubTab] = useState("active");
  const [declining, setDeclining] = useState(null);
  const [declineErr, setDeclineErr] = useState("");
  const myJobs = jobs.filter((j) => j.engineerId === currentUser.engineerRowId);

  // Ticks every 15s purely to force a re-render so the decline-window
  // countdown below stays live without a per-job timer.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(id);
  }, []);

  const tabs = [
    { key: "bookings", label: "Bookings" },
    { key: "schedule", label: "Schedule" },
    { key: "payments", label: "Payments" },
    { key: "reviews", label: "Reviews" },
  ];
  const pageTitle = tabs.find((t) => t.key === tab)?.label || "Bookings";

  const activeJobs = myJobs.filter((j) => !CLOSED_STATUSES.includes(j.status));
  const completedJobs = myJobs.filter((j) => CLOSED_STATUSES.includes(j.status));
  const subTabs = [
    { key: "active", label: "Active", count: activeJobs.length },
    { key: "completed", label: "Completed", count: completedJobs.length },
  ];
  const shownJobs = subTab === "active" ? activeJobs : completedJobs;

  // `assignedAt` is stamped by a DB trigger whenever engineer_id changes
  // (see 0003_decline_and_settings.sql) -- the Decline button below
  // disappears once declineWindowMinutes has passed since that timestamp.
  const declineDeadline = (j) => {
    if (!j.assignedAt) return null;
    return new Date(j.assignedAt).getTime() + declineWindowMinutes * 60000;
  };
  const minutesLeft = (j) => {
    const deadline = declineDeadline(j);
    if (deadline == null) return null;
    return Math.max(0, Math.ceil((deadline - now) / 60000));
  };

  const handleDecline = async (j) => {
    setDeclineErr("");
    setDeclining(j.id);
    try {
      await onDeclineJob(j);
    } catch (e) {
      setDeclineErr(e.message || "Failed to decline booking.");
    } finally {
      setDeclining(null);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6" style={{ color: C.text }}>{pageTitle}</h1>
      <div className="flex gap-2 mb-5">
        {tabs.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className="px-3 py-1.5 rounded-lg text-sm font-medium"
              style={{ background: active ? C.primary : C.card, color: active ? C.sidebar : C.mid }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "bookings" && (
        <>
          <div className="flex gap-2 mb-4">
            {subTabs.map((t) => {
              const active = subTab === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => setSubTab(t.key)}
                  className="px-3 py-1 rounded-full text-xs font-semibold"
                  style={{ background: active ? C.primarySoft : "transparent", color: active ? C.primary : C.mid, border: `1px solid ${active ? C.primary : C.border}` }}
                >
                  {t.label} ({t.count})
                </button>
              );
            })}
          </div>

          {declineErr && (
            <div className="rounded-lg p-3 mb-3 text-sm" style={{ background: C.dangerSoft, color: C.danger }}>{declineErr}</div>
          )}

          <div className="rounded-xl" style={{ background: C.card, border: `1px solid ${C.border}` }}>
            {shownJobs.length === 0 && (
              <p className="p-4 text-sm" style={{ color: C.mid }}>
                {subTab === "active" ? "No active bookings." : "No completed bookings yet."}
              </p>
            )}
            {shownJobs.map((j, i) => {
              const mins = subTab === "active" ? minutesLeft(j) : null;
              const canDecline = subTab === "active" && mins != null && mins > 0;
              return (
                <div key={j.id} className="p-4" style={{ borderTop: i > 0 ? `1px solid ${C.border}` : "none" }}>
                  <div className="flex items-start justify-between mb-1">
                    <p className="font-medium" style={{ color: C.text }}>{j.customerName} — {j.applianceType} ({j.brand})</p>
                    <Pill bg={STATUS_STYLES[j.status].bg} color={STATUS_STYLES[j.status].t}>{j.status.replace("_", " ")}</Pill>
                  </div>
                  <p className="text-sm" style={{ color: C.mid }}>{j.address} · {j.phone}</p>
                  <p className="text-sm" style={{ color: C.mid }}>{j.faultDescription}</p>
                  <p className="text-xs mt-1" style={{ color: C.light }}>Scheduled: {fmtDateTime(j.scheduledDate)}</p>
                  {subTab === "active" && (
                    <div className="flex gap-2 mt-3 items-center flex-wrap">
                      <button onClick={() => onUpdateJob({ ...j, status: "in_progress" })} className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ background: C.orangeSoft, color: C.orange }}>Mark In Progress</button>
                      <button onClick={() => onUpdateJob({ ...j, status: "completed", completedDate: new Date().toISOString() })} className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ background: C.successSoft, color: C.success }}>Mark Completed</button>
                      <button onClick={() => onUpdateJob({ ...j, status: "beyond_repair" })} className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ background: C.dangerSoft, color: C.danger }}>Beyond Repair</button>
                      {canDecline && (
                        <button
                          onClick={() => handleDecline(j)}
                          disabled={declining === j.id}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                          style={{ background: C.dangerSoft, color: C.danger, opacity: declining === j.id ? 0.6 : 1 }}
                        >
                          {declining === j.id ? "Declining…" : `Decline (${mins}m left)`}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {tab === "schedule" && (
        <div className="rounded-xl" style={{ background: C.card, border: `1px solid ${C.border}` }}>
          {[...myJobs].filter((j) => j.scheduledDate).sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate)).map((j, i) => (
            <div key={j.id} className="p-4 flex items-center justify-between" style={{ borderTop: i > 0 ? `1px solid ${C.border}` : "none" }}>
              <div>
                <p className="font-medium" style={{ color: C.text }}>{fmtDateTime(j.scheduledDate)}</p>
                <p className="text-sm" style={{ color: C.mid }}>{j.customerName} — {j.applianceType} · {j.address}</p>
              </div>
              <Pill bg={STATUS_STYLES[j.status].bg} color={STATUS_STYLES[j.status].t}>{j.status.replace("_", " ")}</Pill>
            </div>
          ))}
          {myJobs.filter((j) => j.scheduledDate).length === 0 && <p className="p-4 text-sm" style={{ color: C.mid }}>Nothing on your schedule.</p>}
        </div>
      )}

      {tab === "payments" && <PaymentsView currentUser={currentUser} jobs={jobs} showTitle={false} />}

      {tab === "reviews" && (
        <div className="rounded-xl p-6 text-center" style={{ background: C.card, border: `1px solid ${C.border}` }}>
          <p className="text-sm" style={{ color: C.mid }}>Customer reviews aren't collected yet — this tab is ready for when that's wired up.</p>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Payments                                                             */
/* ------------------------------------------------------------------ */

// showTitle=false when this renders inside the Bookings > Payments tab,
// where the tab bar's own page title above already says "Payments" -- a
// second "Payments" heading right under it would just be noise.
function PaymentsView({ currentUser, jobs, showTitle = true }) {
  const completedJobs = jobs.filter((j) => j.engineerId === currentUser.engineerRowId && j.status === "completed");
  const unpaidJobs = completedJobs.filter((j) => !j.paid);
  const jobEarnings = completedJobs.reduce((s, j) => s + currentUser.payRate, 0);

  return (
    <div>
      {showTitle && <h1 className="text-2xl font-bold mb-6" style={{ color: C.text }}>Payments</h1>}

      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="rounded-xl p-5" style={{ background: C.card, borderLeft: `4px solid ${C.primary}` }}>
          <p className="text-sm" style={{ color: C.mid }}>Earnings (completed)</p>
          <p className="text-2xl font-bold" style={{ color: C.text }}>{fmtMoney(jobEarnings)}</p>
        </div>
        <div className="rounded-xl p-5" style={{ background: C.card, borderLeft: `4px solid ${C.warn}` }}>
          <p className="text-sm" style={{ color: C.mid }}>Unpaid bookings</p>
          <p className="text-2xl font-bold" style={{ color: C.warn }}>{unpaidJobs.length}</p>
        </div>
      </div>

      <h2 className="text-lg font-semibold mb-3" style={{ color: C.text }}>Completed bookings</h2>
      <div className="rounded-xl" style={{ background: C.card, border: `1px solid ${C.border}` }}>
        {completedJobs.length === 0 && <p className="p-4 text-sm" style={{ color: C.mid }}>No completed bookings yet.</p>}
        {completedJobs.map((j, i) => (
          <div key={j.id} className="p-4 flex items-center justify-between" style={{ borderTop: i > 0 ? `1px solid ${C.border}` : "none" }}>
            <div>
              <p className="font-medium" style={{ color: C.text }}>{j.customerName} — {j.applianceType}</p>
              <p className="text-sm" style={{ color: C.mid }}>Completed {fmtDateTime(j.completedDate)}</p>
            </div>
            <div className="text-right">
              <p className="font-semibold" style={{ color: C.text }}>{fmtMoney(currentUser.payRate)}</p>
              <Pill bg={j.paid ? C.successSoft : C.warnSoft} color={j.paid ? C.success : C.warn}>{j.paid ? "Paid" : "Unpaid"}</Pill>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Support                                                              */
/* ------------------------------------------------------------------ */

// Used to be its own top-level page (see PORTAL_NAV); now rendered inline
// at the bottom of the Dashboard instead -- a dedicated Support nav slot
// was more than this one static contact card needed.
function SupportCard() {
  return (
    <div className="rounded-xl p-6" style={{ background: C.card, border: `1px solid ${C.border}` }}>
      <p className="text-sm mb-4" style={{ color: C.mid }}>Need help with a booking, a payment, or your account? Get in touch with the office directly.</p>
      <div className="space-y-2 text-sm" style={{ color: C.text }}>
        <p><span style={{ color: C.mid }}>Phone:</span> 0800 123 4567</p>
        <p><span style={{ color: C.mid }}>Email:</span> support@easyrepair.co.uk</p>
        <p><span style={{ color: C.mid }}>Office hours:</span> Mon–Fri, 8am–6pm</p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Settings (Holidays & Time Off / Skills / Coverage / Documents)       */
/* ------------------------------------------------------------------ */

const DAYS = [["mon", "Monday"], ["tue", "Tuesday"], ["wed", "Wednesday"], ["thu", "Thursday"], ["fri", "Friday"], ["sat", "Saturday"], ["sun", "Sunday"]];
const DOC_KINDS = [
  { key: "id", label: "Photo ID", pathField: "idDocumentPath", uploadedField: "idDocumentUploadedAt", column: "id_document_path", uploadedColumn: "id_document_uploaded_at" },
  {
    key: "insurance", label: "Public Liability Insurance", pathField: "insuranceDocumentPath", uploadedField: "insuranceDocumentUploadedAt", column: "insurance_document_path", uploadedColumn: "insurance_document_uploaded_at",
    requiresExpiry: true, expiryField: "insuranceExpiryDate", expiryColumn: "insurance_expiry_date",
  },
];

function SettingsView({ currentUser, onAddTimeOff, onRemoveTimeOff, onProfileFieldsChanged }) {
  const [tab, setTab] = useState("skills");
  const [availabilityTab, setAvailabilityTab] = useState("hours");
  const canEdit = currentUser.selfServiceEnabled;
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [note, setNote] = useState("");
  const [hours, setHours] = useState(currentUser.workingHours || {});
  const [hoursSaving, setHoursSaving] = useState(false);
  const [hoursSaved, setHoursSaved] = useState(false);
  const [uploading, setUploading] = useState(null);
  const [uploadErr, setUploadErr] = useState("");
  const [expiryInputs, setExpiryInputs] = useState(() => {
    const init = {};
    DOC_KINDS.forEach((k) => { if (k.requiresExpiry) init[k.key] = currentUser[k.expiryField] || ""; });
    return init;
  });
  const [savingExpiry, setSavingExpiry] = useState(null);

  function setDay(day, patch) {
    setHours((h) => ({ ...h, [day]: { ...(h[day] || {}), ...patch } }));
    setHoursSaved(false);
  }

  async function saveHours() {
    setHoursSaving(true);
    const { error } = await supabase.from("engineers").update({ working_hours: hours }).eq("profile_id", currentUser.id);
    setHoursSaving(false);
    if (!error) { setHoursSaved(true); onProfileFieldsChanged?.({ workingHours: hours }); }
  }

  async function uploadDocument(kind, file) {
    if (!file) return;
    const expiryDate = kind.requiresExpiry ? expiryInputs[kind.key] : null;
    if (kind.requiresExpiry && !expiryDate) {
      setUploadErr(`Enter the ${kind.label} expiry date before uploading the document.`);
      return;
    }
    setUploadErr(""); setUploading(kind.key);
    const ext = file.name.split(".").pop() || "pdf";
    const path = `${currentUser.id}/${kind.key}-document.${ext}`;
    const { error: upErr } = await supabase.storage.from("engineer-documents").upload(path, file, { upsert: true });
    if (upErr) { setUploadErr(upErr.message); setUploading(null); return; }
    const nowIso = new Date().toISOString();
    const patch = { [kind.column]: path, [kind.uploadedColumn]: nowIso };
    const localPatch = { [kind.pathField]: path, [kind.uploadedField]: nowIso };
    if (kind.requiresExpiry) { patch[kind.expiryColumn] = expiryDate; localPatch[kind.expiryField] = expiryDate; }
    const { error: dbErr } = await supabase.from("engineers")
      .update(patch)
      .eq("profile_id", currentUser.id);
    setUploading(null);
    if (dbErr) { setUploadErr(dbErr.message); return; }
    onProfileFieldsChanged?.(localPatch);
  }

  // Lets an engineer correct/update the expiry date on its own (e.g. a typo,
  // or the insurer emailed a renewed date ahead of the actual certificate)
  // without forcing a full document re-upload.
  async function saveExpiryDate(kind) {
    const value = expiryInputs[kind.key];
    if (!value) return;
    setUploadErr(""); setSavingExpiry(kind.key);
    const { error } = await supabase.from("engineers").update({ [kind.expiryColumn]: value }).eq("profile_id", currentUser.id);
    setSavingExpiry(null);
    if (error) { setUploadErr(error.message); return; }
    onProfileFieldsChanged?.({ [kind.expiryField]: value });
  }

  const upcoming = [...(currentUser.timeOff || [])].sort((a, b) => a.startDate.localeCompare(b.startDate));

  function submit() {
    if (!start || !end || end < start) return;
    onAddTimeOff({ id: `t-${start}-${end}`, startDate: start, endDate: end, note: note.trim() });
    setStart(""); setEnd(""); setNote("");
  }

  const pillBtn = (key, label, activeKey, onSelect) => (
    <button
      key={key}
      onClick={() => onSelect(key)}
      className="px-3 py-1.5 rounded-lg text-sm font-medium"
      style={{ background: activeKey === key ? C.primary : C.card, color: activeKey === key ? C.sidebar : C.mid }}
    >
      {label}
    </button>
  );
  const tabBtn = (key, label) => pillBtn(key, label, tab, setTab);
  const availabilityTabBtn = (key, label) => pillBtn(key, label, availabilityTab, setAvailabilityTab);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1" style={{ color: C.text }}>Settings</h1>
      <p className="text-sm mb-6" style={{ color: C.mid }}>
        {canEdit ? "You can manage your own profile here." : "Your admin manages most of this for you right now — you can see it here, but changes go through them."}
      </p>

      <div className="flex gap-2 mb-5">
        {tabBtn("skills", "Skills")}
        {tabBtn("coverage", "Coverage")}
        {tabBtn("documents", "Documents")}
        {tabBtn("availability", "Availability")}
      </div>

      {tab === "availability" && (
        <div className="flex gap-2 mb-5">
          {availabilityTabBtn("hours", "Working Hours")}
          {availabilityTabBtn("timeoff", "Holidays & Time Off")}
        </div>
      )}

      {tab === "availability" && availabilityTab === "timeoff" && (
        <div>
          {canEdit ? (
            <div className="rounded-xl p-5 mb-6" style={{ background: C.card, border: `1px solid ${C.border}` }}>
              <p className="text-sm font-semibold mb-3" style={{ color: C.text }}>Add time off</p>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <Field label="Start date"><input type="date" className={inputCls} style={inputStyle} value={start} onChange={(e) => setStart(e.target.value)} /></Field>
                <Field label="End date"><input type="date" className={inputCls} style={inputStyle} value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
              </div>
              <Field label="Note (optional)"><input className={inputCls} style={inputStyle} placeholder="e.g. Family holiday" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
              <button onClick={submit} className="px-4 py-2 rounded-lg text-sm font-bold" style={{ background: C.primary, color: C.sidebar }}>
                {currentUser.timeOffApprovalRequired ? "Submit for approval" : "Add time off"}
              </button>
              <p className="text-xs mt-2" style={{ color: C.mid }}>
                {currentUser.timeOffApprovalRequired
                  ? "This needs to be approved by your admin before it's confirmed — you'll still be assignable until then."
                  : "You won't be auto-assigned any bookings that fall within a period you've added here."}
              </p>
            </div>
          ) : (
            <div className="rounded-xl p-4 mb-6 text-sm" style={{ background: C.warnSoft, border: `1px solid rgba(251,191,36,0.3)`, color: C.warn }}>
              Self-service is off for your account — ask your admin to add or change time off for you.
            </div>
          )}
          <div className="rounded-xl" style={{ background: C.card, border: `1px solid ${C.border}` }}>
            {upcoming.length === 0 && <p className="p-4 text-sm" style={{ color: C.mid }}>No time off scheduled.</p>}
            {upcoming.map((t, i) => (
              <div key={t.id} className="p-4 flex items-center justify-between" style={{ borderTop: i > 0 ? `1px solid ${C.border}` : "none" }}>
                <div>
                  <p className="font-medium" style={{ color: C.text }}>
                    {t.startDate === t.endDate ? t.startDate : `${t.startDate} → ${t.endDate}`}
                    {t.status === "pending" && <span className="ml-2"><Pill bg={C.warnSoft} color={C.warn}>Pending approval</Pill></span>}
                    {t.status === "approved" && <span className="ml-2"><Pill bg={C.successSoft} color={C.success}>Approved</Pill></span>}
                  </p>
                  {t.note && <p className="text-sm" style={{ color: C.mid }}>{t.note}</p>}
                </div>
                {canEdit && <button onClick={() => onRemoveTimeOff(t.id)} className="text-xs font-medium" style={{ color: C.danger }}>Remove</button>}
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "skills" && (
        <div className="rounded-xl p-5" style={{ background: C.card, border: `1px solid ${C.border}` }}>
          {!canEdit && <p className="text-xs rounded-lg p-3 mb-4" style={{ color: C.warn, background: C.warnSoft, border: `1px solid rgba(251,191,36,0.3)` }}>View only — ask your admin to change your skills.</p>}
          <div className="space-y-3">
            {APPLIANCE_TYPES.map((type) => {
              const active = currentUser.applianceTypes.includes(type);
              const excludedBrands = currentUser.brandExclusions[type] || [];
              return (
                <div key={type} className="border rounded-lg p-3" style={{ borderColor: C.border, opacity: active ? 1 : 0.5 }}>
                  <p className="text-sm font-medium" style={{ color: C.text }}>{type} {active ? "✓" : ""}</p>
                  {active && excludedBrands.length > 0 && <p className="text-xs mt-1" style={{ color: C.mid }}>Won't repair: {excludedBrands.join(", ")}</p>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tab === "coverage" && (
        <div className="rounded-xl p-5" style={{ background: C.card, border: `1px solid ${C.border}` }}>
          {!canEdit && <p className="text-xs rounded-lg p-3 mb-4" style={{ color: C.warn, background: C.warnSoft, border: `1px solid rgba(251,191,36,0.3)` }}>View only — ask your admin to change your coverage area.</p>}
          <p className="text-sm font-semibold mb-2" style={{ color: C.text }}>Postcode areas you cover</p>
          <div className="flex flex-wrap gap-1">
            {currentUser.postcodes.length ? currentUser.postcodes.map((p) => <Pill key={p} bg={C.primarySoft} color={C.primary}>{p}</Pill>) : <p className="text-sm" style={{ color: C.mid }}>None set yet.</p>}
          </div>
        </div>
      )}

      {tab === "availability" && availabilityTab === "hours" && (
        <div className="rounded-xl p-5" style={{ background: C.card, border: `1px solid ${C.border}` }}>
          <p className="text-sm mb-4" style={{ color: C.mid }}>Set the hours you're generally available for bookings.</p>
          <div className="space-y-2">
            {DAYS.map(([key, label]) => {
              const d = hours[key] || {};
              return (
                <div key={key} className="flex items-center gap-3 text-sm rounded-lg px-3 py-2" style={{ background: C.sidebar }}>
                  <span className="w-28" style={{ color: C.text }}>{label}</span>
                  <label className="flex items-center gap-1.5" style={{ color: C.mid }}>
                    <input type="checkbox" checked={!!d.off} onChange={(e) => setDay(key, { off: e.target.checked })} />
                    Day off
                  </label>
                  {!d.off && (
                    <>
                      <input type="time" className={inputCls} style={{ ...inputStyle, width: 130 }} value={d.start || "09:00"} onChange={(e) => setDay(key, { start: e.target.value })} />
                      <span style={{ color: C.mid }}>to</span>
                      <input type="time" className={inputCls} style={{ ...inputStyle, width: 130 }} value={d.end || "17:00"} onChange={(e) => setDay(key, { end: e.target.value })} />
                    </>
                  )}
                </div>
              );
            })}
          </div>
          <button onClick={saveHours} disabled={hoursSaving} className="mt-4 px-4 py-2 rounded-lg text-sm font-bold" style={{ background: C.primary, color: C.sidebar, opacity: hoursSaving ? 0.7 : 1 }}>
            {hoursSaving ? "Saving…" : "Save Working Hours"}
          </button>
          {hoursSaved && <span className="ml-3 text-sm" style={{ color: C.success }}>Saved.</span>}
        </div>
      )}

      {tab === "documents" && (
        <div className="rounded-xl p-5" style={{ background: C.card, border: `1px solid ${C.border}` }}>
          <p className="text-sm mb-4" style={{ color: C.mid }}>
            Upload a clear photo or scan. Only you and Easy Repair staff can see these files.
          </p>
          {uploadErr && <p className="text-sm mb-3" style={{ color: C.danger }}>{uploadErr}</p>}
          <div className="space-y-2">
            {DOC_KINDS.map((kind) => {
              const uploadedAt = currentUser[kind.uploadedField];
              const expiryValue = kind.requiresExpiry ? (expiryInputs[kind.key] || "") : null;
              const expiryDirty = kind.requiresExpiry && expiryValue && expiryValue !== (currentUser[kind.expiryField] || "");
              const expiryStatus = kind.requiresExpiry ? insuranceExpiryStatus(currentUser[kind.expiryField]) : null;
              const canUpload = !kind.requiresExpiry || !!expiryValue;
              return (
                <div key={kind.key} className="text-sm rounded-lg px-3 py-2" style={{ background: C.sidebar, color: C.text }}>
                  <div className="flex items-center justify-between">
                    <div>
                      <span>{kind.label}</span>
                      {uploadedAt && <span className="ml-2 text-xs" style={{ color: C.mid }}>Uploaded {fmtDateTime(uploadedAt)}</span>}
                      {expiryStatus && <span className="ml-2 text-xs font-medium" style={{ color: expiryStatus.color }}>{expiryStatus.label}</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      {uploadedAt ? <Pill bg={C.successSoft} color={C.success}>Uploaded</Pill> : <Pill bg={C.border} color={C.mid}>Not uploaded</Pill>}
                      <label
                        className="text-xs font-bold rounded-lg px-3 py-1.5 cursor-pointer"
                        style={{ background: C.primary, color: C.sidebar, opacity: uploading === kind.key || !canUpload ? 0.5 : 1 }}
                        onClick={(e) => {
                          if (!canUpload) {
                            e.preventDefault();
                            setUploadErr(`Enter the ${kind.label} expiry date before uploading the document.`);
                          }
                        }}
                      >
                        {uploading === kind.key ? "Uploading…" : uploadedAt ? "Replace" : "Upload"}
                        <input type="file" accept="image/*,.pdf" className="hidden" onChange={(e) => uploadDocument(kind, e.target.files?.[0])} />
                      </label>
                    </div>
                  </div>
                  {kind.requiresExpiry && (
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-xs" style={{ color: C.mid }}>Expiry date{!uploadedAt && " (required to upload)"}:</span>
                      <input
                        type="date"
                        className={inputCls}
                        style={{ ...inputStyle, width: 150, padding: "4px 8px" }}
                        value={expiryValue}
                        onChange={(e) => setExpiryInputs((s) => ({ ...s, [kind.key]: e.target.value }))}
                      />
                      {expiryDirty && (
                        <button
                          onClick={() => saveExpiryDate(kind)}
                          disabled={savingExpiry === kind.key}
                          className="text-xs font-bold rounded-lg px-2.5 py-1"
                          style={{ background: C.border, color: C.text, opacity: savingExpiry === kind.key ? 0.7 : 1 }}
                        >
                          {savingExpiry === kind.key ? "Saving…" : "Save date"}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* App                                                                  */
/* ------------------------------------------------------------------ */

export default function App() {
  const [jobs, setJobs] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [activeView, setActiveView] = useState("dashboard");
  // How long the Decline button stays visible after a job's assigned_at --
  // shared config row (`app_settings`, seeded in 0003_decline_and_settings.sql)
  // so admin can tune it without a redeploy; decline-booking's Edge Function
  // re-checks the same value server-side so a stale tab can't sneak past it.
  const [declineWindowMinutes, setDeclineWindowMinutes] = useState(30);

  // Restore session on load (real Supabase auth now, not local demo state).
  useEffect(() => {
    async function restore() {
      // If this page load is an invite/recovery link, establish the session from its
      // tokens ourselves now that supabase-js's own auto-detection is off (AUTH_HASH above).
      if (AUTH_HASH?.accessToken && AUTH_HASH?.refreshToken) {
        await supabase.auth.setSession({ access_token: AUTH_HASH.accessToken, refresh_token: AUTH_HASH.refreshToken });
      }
      const { data } = await supabase.auth.getSession();
      if (data?.session?.user) {
        const { data: profile } = await supabase.from("profiles").select("*").eq("id", data.session.user.id).single();
        if (profile?.role === "engineer") {
          const { data: engRow } = await supabase.from("engineers").select("*, profile:profiles(name,phone,email,must_change_password,terms_accepted_at)").eq("profile_id", data.session.user.id).single();
          if (engRow) setCurrentUser(mapEngineer(engRow));
        } else if (profile) {
          await supabase.auth.signOut();
        }
      }
      setAuthChecked(true);
    }
    restore();
  }, []);

  // Loads this engineer's own bookings. RLS's "bookings: engineer sees own"
  // policy already restricts the query to their rows, but filtering by
  // engineer_id here too keeps this explicit rather than relying purely on
  // RLS being configured correctly.
  async function loadBookings(engineerRowId) {
    const { data, error } = await supabase
      .from("bookings")
      .select("*")
      .eq("engineer_id", engineerRowId)
      .order("scheduled_date", { ascending: true });
    if (!error) setJobs((data || []).map(mapBookingRow));
  }

  // Reads the admin-configurable decline window (see state comment above).
  async function loadDeclineWindow() {
    const { data, error } = await supabase.from("app_settings").select("value").eq("key", "decline_window_minutes").single();
    if (!error && data?.value != null) setDeclineWindowMinutes(Number(data.value));
  }

  // Runs whenever a session lands us a real engineer (fresh login via
  // LoginScreen's own onLogin, or the restore() above finding an existing
  // session) -- both paths call setCurrentUser directly, so this is the one
  // place bookings actually get loaded rather than duplicating the fetch in
  // both call sites.
  useEffect(() => {
    if (currentUser?.engineerRowId) {
      loadBookings(currentUser.engineerRowId);
      loadDeclineWindow();
    }
  }, [currentUser?.engineerRowId]);

  async function updateJob(updated) {
    const patch = bookingPatchFromUpdate(updated);
    const { error } = await supabase.from("bookings").update(patch).eq("id", updated.id);
    if (!error && currentUser?.engineerRowId) await loadBookings(currentUser.engineerRowId);
  }

  // Declines a job assigned to this engineer. Goes through the decline-booking
  // Edge Function rather than a direct table update -- reassigning to a
  // *different* engineer needs data/writes this engineer's own RLS policy
  // doesn't allow (see supabase/functions/decline-booking/index.ts). Throws
  // on failure so BookingsView's handleDecline can surface the message.
  async function declineJob(job) {
    const { data, error } = await supabase.functions.invoke("decline-booking", {
      body: { bookingId: job.id },
    });
    if (error) throw new Error(error.message || "Failed to decline booking.");
    if (data?.error) throw new Error(data.error);
    if (currentUser?.engineerRowId) await loadBookings(currentUser.engineerRowId);
  }

  function addOwnTimeOff(entry) {
    if (!currentUser.selfServiceEnabled) return;
    const status = currentUser.timeOffApprovalRequired ? "pending" : "approved";
    const fullEntry = { ...entry, status };
    setCurrentUser((cu) => ({ ...cu, timeOff: [...(cu.timeOff || []), fullEntry] }));
  }

  function removeOwnTimeOff(entryId) {
    if (!currentUser.selfServiceEnabled) return;
    setCurrentUser((cu) => ({ ...cu, timeOff: (cu.timeOff || []).filter((t) => t.id !== entryId) }));
  }

  async function logout() {
    await supabase.auth.signOut();
    setCurrentUser(null);
  }

  // Clears the forced-password-change flag once they've set their own —
  // covers both provisioning paths (they typed the temp password directly,
  // or clicked the emailed link) since this runs after either one lands
  // them here with a real session.
  async function onPasswordChanged() {
    if (currentUser) await supabase.from("profiles").update({ must_change_password: false }).eq("id", currentUser.id);
    window.location.reload();
  }

  async function onAcceptTerms() {
    const nowIso = new Date().toISOString();
    const { error } = await supabase.from("profiles").update({ terms_accepted_at: nowIso, terms_version: "v1" }).eq("id", currentUser.id);
    // Surface a failed write instead of silently letting them through --
    // TermsGateScreen (above) catches this and shows it, and keeps the gate
    // up so an unsaved acceptance can't be mistaken for a real one.
    if (error) throw new Error(error.message || "Something went wrong saving your acceptance. Please try again.");
    setCurrentUser((cu) => ({ ...cu, termsAcceptedAt: nowIso }));
  }

  if (!authChecked) return null;
  if (["invite", "recovery"].includes(inviteOrRecoveryType())) {
    return <SetPasswordScreen onDone={() => window.location.reload()} />;
  }
  if (!currentUser) return <LoginScreen onLogin={setCurrentUser} />;
  if (currentUser.mustChangePassword) return <SetPasswordScreen onDone={onPasswordChanged} />;
  if (!currentUser.termsAcceptedAt) return <TermsGateScreen onAccept={onAcceptTerms} />;

  return (
    <div className="flex min-h-screen font-sans" style={{ background: C.bg }}>
      <Sidebar currentUser={currentUser} activeView={activeView} setActiveView={setActiveView} onLogout={logout} />
      <main className="flex-1 p-8 pb-24 md:pb-8">
        {activeView === "dashboard" && <DashboardView currentUser={currentUser} jobs={jobs} setActiveView={setActiveView} />}
        {activeView === "bookings" && <BookingsView currentUser={currentUser} jobs={jobs} onUpdateJob={updateJob} onDeclineJob={declineJob} declineWindowMinutes={declineWindowMinutes} />}
        {activeView === "settings" && (
          <SettingsView currentUser={currentUser} onAddTimeOff={addOwnTimeOff} onRemoveTimeOff={removeOwnTimeOff}
            onProfileFieldsChanged={(patch) => setCurrentUser((cu) => ({ ...cu, ...patch }))} />
        )}
      </main>
      <MobileTabBar activeView={activeView} setActiveView={setActiveView} />
    </div>
  );
}
