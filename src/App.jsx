import React, { useState, useEffect } from "react";
import { supabase } from "./lib/supabaseClient";

/* ------------------------------------------------------------------ */
/* Constants & sample data                                            */
/* Real identity/auth + the engineer's own profile fields (postcodes, */
/* appliance types, brand exclusions, pay rate, self-service toggle)  */
/* now come from the same Supabase project FixFlow writes to — see    */
/* mapEngineer()/loadEngineerProfile() below. Bookings/time-off stay  */
/* local demo data for now (a separate, larger migration — see the    */
/* project README), so they're keyed by the real engineer id but      */
/* won't show anything until that data model is wired up too.         */
/* ------------------------------------------------------------------ */

const APPLIANCE_TYPES = ["Washing Machine", "Fridge/Freezer", "Dishwasher", "Oven/Cooker", "Tumble Dryer", "Microwave"];
const BRANDS = ["Bosch", "Samsung", "LG", "Hotpoint", "Beko", "Zanussi", "Whirlpool", "Indesit", "AEG", "Miele"];

const todayStr = () => new Date().toISOString().slice(0, 10);

const initialJobs = [
  {
    id: "j-1001",
    customerName: "Linda Carter",
    phone: "07911 111222",
    address: "14 Ashfield Road, Manchester",
    postcode: "M14 5TG",
    applianceType: "Washing Machine",
    brand: "Bosch",
    applianceAge: "4 years",
    isIntegrated: false,
    faultDescription: "Not spinning, leaves clothes soaking wet",
    scheduledDate: `${todayStr()}T10:00`,
    completedDate: null,
    engineerId: "demo-placeholder-1",
    status: "assigned",
    priority: "normal",
    paid: false,
  },
  {
    id: "j-1003",
    customerName: "Emma Wright",
    phone: "07933 333444",
    address: "22 Broad Street, Birmingham",
    postcode: "B1 2HF",
    applianceType: "Fridge/Freezer",
    brand: "Samsung",
    applianceAge: "2 years",
    isIntegrated: true,
    faultDescription: "Fridge warm, freezer fine — food spoiling",
    scheduledDate: `${todayStr()}T09:00`,
    completedDate: `${todayStr()}T09:50`,
    engineerId: "demo-placeholder-1",
    status: "completed",
    priority: "urgent",
    paid: false,
  },
];

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

const STATUS_STYLES = {
  unassigned: { bg: C.warnSoft, t: C.warn },
  assigned: { bg: C.primarySoft, t: C.primary },
  in_progress: { bg: C.orangeSoft, t: C.orange },
  completed: { bg: C.successSoft, t: C.success },
  beyond_repair: { bg: C.dangerSoft, t: C.danger },
};
const PRIORITY_STYLES = {
  normal: { bg: "rgba(255,255,255,0.06)", t: C.mid },
  high: { bg: C.warnSoft, t: C.warn },
  urgent: { bg: C.dangerSoft, t: C.danger },
};

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
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: C.sidebar }}>
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center">
            <img src="/logo.png" alt="Easy Repair" className="h-10 w-auto" />
          </div>
          <p className="text-sm mt-3" style={{ color: C.light }}>Your bookings, earnings, and profile</p>
        </div>
        <form
          onSubmit={(e) => { e.preventDefault(); attemptLogin(); }}
          className="rounded-xl shadow-xl p-6"
          style={{ background: C.card, border: `1px solid ${C.border}` }}
        >
          <Field label="Email"><input className={inputCls} style={inputStyle} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@easyrepair.co.uk" /></Field>
          <Field label="Password"><input className={inputCls} style={inputStyle} type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" /></Field>
          {error && <p className="text-sm mb-3" style={{ color: C.danger }}>{error}</p>}
          <button className="w-full font-bold rounded-lg py-2.5 transition" style={{ background: C.primary, color: C.sidebar, opacity: loading ? 0.7 : 1 }}>
            {loading ? "Signing in…" : "Log in"}
          </button>
        </form>
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
  async function accept() {
    setBusy(true);
    await onAccept();
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
          <button onClick={accept} disabled={busy} className="w-full font-bold rounded-lg py-2.5 transition" style={{ background: C.primary, color: C.sidebar, opacity: busy ? 0.7 : 1 }}>
            {busy ? "Saving…" : "I Accept"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sidebar                                                              */
/* ------------------------------------------------------------------ */

function Sidebar({ currentUser, activeView, setActiveView, onLogout }) {
  const nav = [
    { key: "dashboard", label: "Dashboard" },
    { key: "bookings", label: "Bookings" },
    { key: "payments", label: "Payments" },
    { key: "support", label: "Support" },
    { key: "settings", label: "Settings" },
  ];
  return (
    <div className="w-56 flex flex-col shrink-0 min-h-screen" style={{ background: C.sidebar, color: C.mid }}>
      <div className="px-5 py-5 flex items-center" style={{ borderBottom: `1px solid ${C.border}` }}>
        <img src="/logo.png" alt="Easy Repair" className="h-6 w-auto" />
      </div>
      <nav className="flex-1 py-4 space-y-1 px-3">
        {nav.map((n) => {
          const active = activeView === n.key;
          return (
            <button
              key={n.key}
              onClick={() => setActiveView(n.key)}
              className="w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition"
              style={{
                background: active ? C.primarySoft : "transparent",
                color: active ? C.primary : C.light,
                borderLeft: `2px solid ${active ? C.primary : "transparent"}`,
              }}
            >
              {n.label}
            </button>
          );
        })}
      </nav>
      <div className="px-4 py-4" style={{ borderTop: `1px solid ${C.border}` }}>
        <p className="text-sm font-medium" style={{ color: C.text }}>{currentUser.name}</p>
        <p className="text-xs mb-3" style={{ color: C.light }}>Engineer</p>
        <button onClick={onLogout} className="text-xs underline" style={{ color: C.light }}>Log out</button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Dashboard                                                            */
/* ------------------------------------------------------------------ */

function DashboardView({ currentUser, jobs, setActiveView }) {
  const myJobs = jobs.filter((j) => j.engineerId === currentUser.id);
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
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Bookings (Bookings / Schedule / Reviews)                             */
/* ------------------------------------------------------------------ */

function BookingsView({ currentUser, jobs, onUpdateJob }) {
  const [tab, setTab] = useState("bookings");
  const myJobs = jobs.filter((j) => j.engineerId === currentUser.id);

  const tabs = [
    { key: "bookings", label: "Bookings" },
    { key: "schedule", label: "Schedule" },
    { key: "reviews", label: "Reviews" },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6" style={{ color: C.text }}>Bookings</h1>
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
        <div className="rounded-xl" style={{ background: C.card, border: `1px solid ${C.border}` }}>
          {myJobs.length === 0 && <p className="p-4 text-sm" style={{ color: C.mid }}>No bookings assigned.</p>}
          {myJobs.map((j, i) => (
            <div key={j.id} className="p-4" style={{ borderTop: i > 0 ? `1px solid ${C.border}` : "none" }}>
              <div className="flex items-start justify-between mb-1">
                <p className="font-medium" style={{ color: C.text }}>{j.customerName} — {j.applianceType} ({j.brand})</p>
                <Pill bg={STATUS_STYLES[j.status].bg} color={STATUS_STYLES[j.status].t}>{j.status.replace("_", " ")}</Pill>
              </div>
              <p className="text-sm" style={{ color: C.mid }}>{j.address} · {j.phone}</p>
              <p className="text-sm" style={{ color: C.mid }}>{j.faultDescription}</p>
              <p className="text-xs mt-1" style={{ color: C.light }}>Scheduled: {fmtDateTime(j.scheduledDate)}</p>
              <div className="flex gap-2 mt-3">
                <button onClick={() => onUpdateJob({ ...j, status: "in_progress" })} className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ background: C.orangeSoft, color: C.orange }}>Mark In Progress</button>
                <button onClick={() => onUpdateJob({ ...j, status: "completed", completedDate: new Date().toISOString() })} className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ background: C.successSoft, color: C.success }}>Mark Completed</button>
                <button onClick={() => onUpdateJob({ ...j, status: "beyond_repair" })} className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ background: C.dangerSoft, color: C.danger }}>Beyond Repair</button>
              </div>
            </div>
          ))}
        </div>
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

function PaymentsView({ currentUser, jobs }) {
  const completedJobs = jobs.filter((j) => j.engineerId === currentUser.id && j.status === "completed");
  const unpaidJobs = completedJobs.filter((j) => !j.paid);
  const jobEarnings = completedJobs.reduce((s, j) => s + currentUser.payRate, 0);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6" style={{ color: C.text }}>Payments</h1>

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

function SupportView() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6" style={{ color: C.text }}>Support</h1>
      <div className="rounded-xl p-6" style={{ background: C.card, border: `1px solid ${C.border}` }}>
        <p className="text-sm mb-4" style={{ color: C.mid }}>Need help with a booking, a payment, or your account? Get in touch with the office directly.</p>
        <div className="space-y-2 text-sm" style={{ color: C.text }}>
          <p><span style={{ color: C.mid }}>Phone:</span> 0800 123 4567</p>
          <p><span style={{ color: C.mid }}>Email:</span> support@easyrepair.co.uk</p>
          <p><span style={{ color: C.mid }}>Office hours:</span> Mon–Fri, 8am–6pm</p>
        </div>
      </div>
      <p className="text-xs mt-4" style={{ color: C.light }}>A ticketing/chat system can be added here later — this is a placeholder contact page for now.</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Settings (Holidays & Time Off / Skills / Coverage / Documents)       */
/* ------------------------------------------------------------------ */

const DAYS = [["mon", "Monday"], ["tue", "Tuesday"], ["wed", "Wednesday"], ["thu", "Thursday"], ["fri", "Friday"], ["sat", "Saturday"], ["sun", "Sunday"]];
const DOC_KINDS = [
  { key: "id", label: "Photo ID", pathField: "idDocumentPath", uploadedField: "idDocumentUploadedAt", column: "id_document_path", uploadedColumn: "id_document_uploaded_at" },
  { key: "insurance", label: "Public Liability Insurance", pathField: "insuranceDocumentPath", uploadedField: "insuranceDocumentUploadedAt", column: "insurance_document_path", uploadedColumn: "insurance_document_uploaded_at" },
];

function SettingsView({ currentUser, onAddTimeOff, onRemoveTimeOff, onProfileFieldsChanged }) {
  const [tab, setTab] = useState("timeoff");
  const canEdit = currentUser.selfServiceEnabled;
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [note, setNote] = useState("");
  const [hours, setHours] = useState(currentUser.workingHours || {});
  const [hoursSaving, setHoursSaving] = useState(false);
  const [hoursSaved, setHoursSaved] = useState(false);
  const [uploading, setUploading] = useState(null);
  const [uploadErr, setUploadErr] = useState("");

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
    setUploadErr(""); setUploading(kind.key);
    const ext = file.name.split(".").pop() || "pdf";
    const path = `${currentUser.id}/${kind.key}-document.${ext}`;
    const { error: upErr } = await supabase.storage.from("engineer-documents").upload(path, file, { upsert: true });
    if (upErr) { setUploadErr(upErr.message); setUploading(null); return; }
    const nowIso = new Date().toISOString();
    const { error: dbErr } = await supabase.from("engineers")
      .update({ [kind.column]: path, [kind.uploadedColumn]: nowIso })
      .eq("profile_id", currentUser.id);
    setUploading(null);
    if (dbErr) { setUploadErr(dbErr.message); return; }
    onProfileFieldsChanged?.({ [kind.pathField]: path, [kind.uploadedField]: nowIso });
  }

  const upcoming = [...(currentUser.timeOff || [])].sort((a, b) => a.startDate.localeCompare(b.startDate));

  function submit() {
    if (!start || !end || end < start) return;
    onAddTimeOff({ id: `t-${start}-${end}`, startDate: start, endDate: end, note: note.trim() });
    setStart(""); setEnd(""); setNote("");
  }

  const tabBtn = (key, label) => (
    <button
      onClick={() => setTab(key)}
      className="px-3 py-1.5 rounded-lg text-sm font-medium"
      style={{ background: tab === key ? C.primary : C.card, color: tab === key ? C.sidebar : C.mid }}
    >
      {label}
    </button>
  );

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1" style={{ color: C.text }}>Settings</h1>
      <p className="text-sm mb-6" style={{ color: C.mid }}>
        {canEdit ? "You can manage your own profile here." : "Your admin manages most of this for you right now — you can see it here, but changes go through them."}
      </p>

      <div className="flex gap-2 mb-5">
        {tabBtn("timeoff", "Holidays & Time Off")}
        {tabBtn("skills", "Skills")}
        {tabBtn("coverage", "Coverage")}
        {tabBtn("hours", "Working Hours")}
        {tabBtn("documents", "Documents")}
      </div>

      {tab === "timeoff" && (
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

      {tab === "hours" && (
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
              return (
                <div key={kind.key} className="flex items-center justify-between text-sm rounded-lg px-3 py-2" style={{ background: C.sidebar, color: C.text }}>
                  <div>
                    <span>{kind.label}</span>
                    {uploadedAt && <span className="ml-2 text-xs" style={{ color: C.mid }}>Uploaded {fmtDateTime(uploadedAt)}</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    {uploadedAt ? <Pill bg={C.successSoft} color={C.success}>Uploaded</Pill> : <Pill bg={C.border} color={C.mid}>Not uploaded</Pill>}
                    <label className="text-xs font-bold rounded-lg px-3 py-1.5 cursor-pointer" style={{ background: C.primary, color: C.sidebar, opacity: uploading === kind.key ? 0.7 : 1 }}>
                      {uploading === kind.key ? "Uploading…" : uploadedAt ? "Replace" : "Upload"}
                      <input type="file" accept="image/*,.pdf" className="hidden" onChange={(e) => uploadDocument(kind, e.target.files?.[0])} />
                    </label>
                  </div>
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
  const [jobs, setJobs] = useState(initialJobs);
  const [currentUser, setCurrentUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [activeView, setActiveView] = useState("dashboard");

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

  function updateJob(updated) {
    setJobs((js) => js.map((j) => (j.id === updated.id ? updated : j)));
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
    await supabase.from("profiles").update({ terms_accepted_at: new Date().toISOString(), terms_version: "v1" }).eq("id", currentUser.id);
    setCurrentUser((cu) => ({ ...cu, termsAcceptedAt: "just-accepted" }));
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
      <main className="flex-1 p-8">
        {activeView === "dashboard" && <DashboardView currentUser={currentUser} jobs={jobs} setActiveView={setActiveView} />}
        {activeView === "bookings" && <BookingsView currentUser={currentUser} jobs={jobs} onUpdateJob={updateJob} />}
        {activeView === "payments" && <PaymentsView currentUser={currentUser} jobs={jobs} />}
        {activeView === "support" && <SupportView />}
        {activeView === "settings" && (
          <SettingsView currentUser={currentUser} onAddTimeOff={addOwnTimeOff} onRemoveTimeOff={removeOwnTimeOff}
            onProfileFieldsChanged={(patch) => setCurrentUser((cu) => ({ ...cu, ...patch }))} />
        )}
      </main>
    </div>
  );
}
