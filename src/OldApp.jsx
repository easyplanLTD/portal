import React, { useState } from "react";

/* ------------------------------------------------------------------ */
/* Constants & sample data                                            */
/* This mirrors the same engineers/jobs/leads shape used in FixFlow,  */
/* since both apps will eventually read from the same Supabase        */
/* database. For now this is local demo data, same as FixFlow started */
/* out as, so the two can be reviewed side by side before wiring in    */
/* the real backend.                                                  */
/* ------------------------------------------------------------------ */

const APPLIANCE_TYPES = ["Washing Machine", "Fridge/Freezer", "Dishwasher", "Oven/Cooker", "Tumble Dryer", "Microwave"];
const BRANDS = ["Bosch", "Samsung", "LG", "Hotpoint", "Beko", "Zanussi", "Whirlpool", "Indesit", "AEG", "Miele"];

const todayStr = () => new Date().toISOString().slice(0, 10);
const nextWeekStr = (daysFromNow) => {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
};

const initialEngineers = [
  {
    id: "u-eng-dave",
    name: "Dave Thompson",
    email: "dave@fixflow.co.uk",
    password: "eng123",
    phone: "07700 900010",
    payRate: 45,
    engineerAgreedDiscount: 0,
    postcodes: ["M", "SK"],
    applianceTypes: ["Washing Machine", "Fridge/Freezer", "Dishwasher"],
    brandExclusions: { "Fridge/Freezer": ["Miele"] },
    integratedExclusions: ["Dishwasher"],
    stats: { completed: 142, ber: 18 },
    engineerType: "both",
    portalSettingsEnabled: true,
    timeOffApprovalRequired: true,
    timeOff: [
      { id: "t-1", startDate: nextWeekStr(7), endDate: nextWeekStr(10), note: "Family holiday", status: "approved" },
      { id: "t-3", startDate: nextWeekStr(20), endDate: nextWeekStr(20), note: "Dentist appointment", status: "pending" },
    ],
    leadPrefs: { active: true, dailyLeadTarget: 10, pricePerLead: 12, cardLast4: "4242" },
  },
  {
    id: "u-eng-sarah",
    name: "Sarah Ahmed",
    email: "sarah@fixflow.co.uk",
    password: "eng123",
    phone: "07700 900011",
    payRate: 50,
    engineerAgreedDiscount: 5,
    postcodes: ["LS", "BD"],
    applianceTypes: ["Oven/Cooker", "Tumble Dryer", "Washing Machine"],
    brandExclusions: {},
    integratedExclusions: ["Oven/Cooker"],
    stats: { completed: 98, ber: 6 },
    engineerType: "jobs",
    portalSettingsEnabled: false,
    timeOffApprovalRequired: true,
    timeOff: [],
    leadPrefs: { active: true, dailyLeadTarget: 15, pricePerLead: 15, cardLast4: "1881" },
  },
  {
    id: "u-eng-mike",
    name: "Mike O'Connor",
    email: "mike@fixflow.co.uk",
    password: "eng123",
    phone: "07700 900012",
    payRate: 42,
    engineerAgreedDiscount: 0,
    postcodes: ["B", "DY"],
    applianceTypes: ["Dishwasher", "Fridge/Freezer", "Microwave"],
    brandExclusions: { Dishwasher: ["AEG"] },
    integratedExclusions: [],
    stats: { completed: 61, ber: 14 },
    engineerType: "leads",
    portalSettingsEnabled: false,
    timeOffApprovalRequired: false,
    timeOff: [{ id: "t-2", startDate: todayStr(), endDate: todayStr(), note: "Sick day", status: "approved" }],
    leadPrefs: { active: true, dailyLeadTarget: 5, pricePerLead: 10, cardLast4: "3300" },
  },
];

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
    engineerId: "u-eng-dave",
    status: "assigned",
    priority: "normal",
    paid: false,
  },
  {
    id: "j-1002",
    customerName: "Raj Patel",
    phone: "07922 222333",
    address: "8 Kirkgate, Leeds",
    postcode: "LS1 6HD",
    applianceType: "Oven/Cooker",
    brand: "AEG",
    applianceAge: "7 years",
    isIntegrated: false,
    faultDescription: "Oven not heating up at all",
    scheduledDate: `${todayStr()}T13:30`,
    completedDate: null,
    engineerId: "u-eng-sarah",
    status: "in_progress",
    priority: "high",
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
    engineerId: "u-eng-mike",
    status: "completed",
    priority: "urgent",
    paid: false,
  },
];

const initialLeads = [
  {
    id: "l-2001",
    customerName: "Priya Nair",
    phone: "07955 555666",
    address: "3 Merrion Street, Leeds",
    postcode: "LS2 8NG",
    applianceType: "Tumble Dryer",
    brand: "Hotpoint",
    applianceAge: "6 years",
    isIntegrated: false,
    priority: "normal",
    description: "Dryer runs but no heat",
    engineerId: "u-eng-sarah",
    status: "assigned",
    price: 15,
    billed: false,
    assignedAt: `${todayStr()}T08:15`,
  },
  {
    id: "l-2002",
    customerName: "George Wallis",
    phone: "07966 666777",
    address: "19 Deansgate, Manchester",
    postcode: "M3 2FW",
    applianceType: "Washing Machine",
    brand: "Miele",
    applianceAge: "3 years",
    isIntegrated: false,
    priority: "high",
    description: "Drum not turning, loud clicking noise",
    engineerId: "u-eng-dave",
    status: "assigned",
    price: 12,
    billed: false,
    assignedAt: `${todayStr()}T09:00`,
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

function leadsAssignedToday(leads, engineerId) {
  const today = todayStr();
  return leads.filter((l) => l.engineerId === engineerId && l.assignedAt && l.assignedAt.startsWith(today)).length;
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

function LoginScreen({ engineers, onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  function attemptLogin(emailVal, passwordVal) {
    const e = engineers.find(
      (e) => e.email.trim().toLowerCase() === emailVal.trim().toLowerCase() && e.password === passwordVal.trim()
    );
    if (e) { setError(""); onLogin(e); } else { setError("Incorrect email or password."); }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: C.sidebar }}>
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center">
            <img src="/logo.png" alt="Easy Repair" className="h-10 w-auto" />
          </div>
          <p className="text-sm mt-3" style={{ color: C.light }}>Your jobs, leads, earnings, and profile</p>
        </div>
        <form
          onSubmit={(e) => { e.preventDefault(); attemptLogin(email, password); }}
          className="rounded-xl shadow-xl p-6"
          style={{ background: C.card, border: `1px solid ${C.border}` }}
        >
          <Field label="Email"><input className={inputCls} style={inputStyle} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@fixflow.co.uk" /></Field>
          <Field label="Password"><input className={inputCls} style={inputStyle} type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" /></Field>
          {error && <p className="text-sm mb-3" style={{ color: C.danger }}>{error}</p>}
          <button className="w-full font-bold rounded-lg py-2.5 transition" style={{ background: C.primary, color: C.sidebar }}>Log in</button>
        </form>
        <div className="mt-5 rounded-lg p-4 text-xs" style={{ background: C.sidebar, border: `1px solid ${C.border}`, color: C.mid }}>
          <p className="font-semibold mb-3 uppercase tracking-wide" style={{ color: C.light }}>Demo logins — click to log straight in</p>
          <div className="space-y-1.5">
            {engineers.map((e) => (
              <button
                key={e.id}
                onClick={() => attemptLogin(e.email, e.password)}
                className="w-full flex items-center justify-between rounded-md px-3 py-2 transition text-left"
                style={{ background: C.card }}
                onMouseOver={(ev) => (ev.currentTarget.style.background = C.border)}
                onMouseOut={(ev) => (ev.currentTarget.style.background = C.card)}
              >
                <span className="font-medium" style={{ color: C.text }}>{e.name}</span>
                <span style={{ color: C.light }}>{e.email}</span>
              </button>
            ))}
          </div>
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
        <p className="text-xs mb-3" style={{ color: C.light }}>
          {currentUser.engineerType === "both" ? "Jobs & Leads" : currentUser.engineerType === "jobs" ? "Jobs only" : "Leads only"} engineer
        </p>
        <button onClick={onLogout} className="text-xs underline" style={{ color: C.light }}>Log out</button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Dashboard                                                            */
/* ------------------------------------------------------------------ */

function DashboardView({ currentUser, jobs, leads }) {
  const myJobs = jobs.filter((j) => j.engineerId === currentUser.id);
  const myLeads = leads.filter((l) => l.engineerId === currentUser.id);
  const todaysJobs = myJobs.filter((j) => j.scheduledDate && j.scheduledDate.startsWith(todayStr()));
  const leadsToday = leadsAssignedToday(leads, currentUser.id);
  const pendingTimeOff = (currentUser.timeOff || []).filter((t) => t.status === "pending");
  const rate = successRate(currentUser);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1" style={{ color: C.text }}>Welcome back, {currentUser.name.split(" ")[0]}</h1>
      <p className="text-sm mb-6" style={{ color: C.mid }}>Here's where things stand today.</p>

      <div className="grid grid-cols-4 gap-4 mb-8">
        <div className="rounded-xl p-5" style={{ background: C.card, borderLeft: `4px solid ${C.primary}` }}>
          <p className="text-sm" style={{ color: C.mid }}>Jobs today</p>
          <p className="text-3xl font-bold" style={{ color: C.text }}>{todaysJobs.length}</p>
        </div>
        <div className="rounded-xl p-5" style={{ background: C.card, borderLeft: `4px solid ${C.purple}` }}>
          <p className="text-sm" style={{ color: C.mid }}>Leads today</p>
          <p className="text-3xl font-bold" style={{ color: C.purple }}>{leadsToday} / {currentUser.leadPrefs.dailyLeadTarget}</p>
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
/* Bookings (Jobs / Leads / Schedule / Reviews)                         */
/* ------------------------------------------------------------------ */

function BookingsView({ currentUser, jobs, leads, onUpdateJob, onUpdateLeadTarget }) {
  const [tab, setTab] = useState(currentUser.engineerType === "leads" ? "leads" : "jobs");
  const myJobs = jobs.filter((j) => j.engineerId === currentUser.id);
  const myLeads = leads.filter((l) => l.engineerId === currentUser.id);

  const tabs = [
    ...(currentUser.engineerType !== "leads" ? [{ key: "jobs", label: "Jobs" }] : []),
    ...(currentUser.engineerType !== "jobs" ? [{ key: "leads", label: "Leads" }] : []),
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

      {tab === "jobs" && (
        <div className="rounded-xl" style={{ background: C.card, border: `1px solid ${C.border}` }}>
          {myJobs.length === 0 && <p className="p-4 text-sm" style={{ color: C.mid }}>No jobs assigned.</p>}
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

      {tab === "leads" && (
        <div>
          <div className="rounded-xl p-5 mb-5" style={{ background: C.purpleSoft, border: `1px solid rgba(192,132,252,0.3)` }}>
            <p className="text-sm font-semibold mb-1" style={{ color: C.text }}>How many leads would you like per day?</p>
            <p className="text-xs mb-3" style={{ color: C.mid }}>
              We'll assign you up to this many leads a day, matched to your area and the appliances you repair, at {fmtMoney(currentUser.leadPrefs.pricePerLead)} each.
            </p>
            <div className="flex items-center gap-4">
              <input
                type="range" min={0} max={30} step={1}
                value={currentUser.leadPrefs.dailyLeadTarget}
                onChange={(e) => onUpdateLeadTarget(Number(e.target.value))}
                className="flex-1"
                style={{ accentColor: C.purple }}
              />
              <span className="w-24 text-right text-2xl font-bold" style={{ color: C.purple }}>{currentUser.leadPrefs.dailyLeadTarget}/day</span>
            </div>
          </div>
          <div className="rounded-xl" style={{ background: C.card, border: `1px solid ${C.border}` }}>
            {myLeads.length === 0 && <p className="p-4 text-sm" style={{ color: C.mid }}>No leads assigned yet.</p>}
            {myLeads.map((l, i) => (
              <div key={l.id} className="p-4" style={{ borderTop: i > 0 ? `1px solid ${C.border}` : "none" }}>
                <div className="flex items-start justify-between mb-2">
                  <p className="font-medium" style={{ color: C.text }}>{l.customerName}</p>
                  <Pill bg={C.purpleSoft} color={C.purple}>{l.status}</Pill>
                </div>
                <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm mb-2" style={{ color: C.text }}>
                  <p><span style={{ color: C.mid }}>Phone:</span> {l.phone}</p>
                  <p><span style={{ color: C.mid }}>Address:</span> {l.address} ({l.postcode})</p>
                  <p><span style={{ color: C.mid }}>Appliance:</span> {l.applianceType}{l.isIntegrated ? " (Integrated)" : ""}</p>
                  <p><span style={{ color: C.mid }}>Brand:</span> {l.brand}</p>
                  <p><span style={{ color: C.mid }}>Age:</span> {l.applianceAge || "Not given"}</p>
                  <p><span style={{ color: C.mid }}>Priority:</span> {l.priority}</p>
                </div>
                <p className="text-sm mb-2" style={{ color: C.mid }}>{l.description}</p>
                <p className="text-xs" style={{ color: C.light }}>Price: {fmtMoney(l.price)}</p>
              </div>
            ))}
          </div>
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

function PaymentsView({ currentUser, jobs, leads }) {
  const completedJobs = jobs.filter((j) => j.engineerId === currentUser.id && j.status === "completed");
  const unpaidJobs = completedJobs.filter((j) => !j.paid);
  const jobEarnings = completedJobs.reduce((s, j) => s + currentUser.payRate, 0);

  const today = todayStr();
  const leadsToday = leads.filter((l) => l.engineerId === currentUser.id && l.assignedAt?.startsWith(today));
  const owedTonight = leadsToday.reduce((s, l) => s + (l.price || 0), 0);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6" style={{ color: C.text }}>Payments</h1>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="rounded-xl p-5" style={{ background: C.card, borderLeft: `4px solid ${C.primary}` }}>
          <p className="text-sm" style={{ color: C.mid }}>Job earnings (completed)</p>
          <p className="text-2xl font-bold" style={{ color: C.text }}>{fmtMoney(jobEarnings)}</p>
        </div>
        <div className="rounded-xl p-5" style={{ background: C.card, borderLeft: `4px solid ${C.warn}` }}>
          <p className="text-sm" style={{ color: C.mid }}>Unpaid jobs</p>
          <p className="text-2xl font-bold" style={{ color: C.warn }}>{unpaidJobs.length}</p>
        </div>
        <div className="rounded-xl p-5" style={{ background: C.card, borderLeft: `4px solid ${C.purple}` }}>
          <p className="text-sm" style={{ color: C.mid }}>Lead charges tonight</p>
          <p className="text-2xl font-bold" style={{ color: C.purple }}>{fmtMoney(owedTonight)}</p>
        </div>
      </div>

      <h2 className="text-lg font-semibold mb-3" style={{ color: C.text }}>Completed jobs</h2>
      <div className="rounded-xl" style={{ background: C.card, border: `1px solid ${C.border}` }}>
        {completedJobs.length === 0 && <p className="p-4 text-sm" style={{ color: C.mid }}>No completed jobs yet.</p>}
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
        <p className="text-sm mb-4" style={{ color: C.mid }}>Need help with a job, a payment, or your account? Get in touch with the office directly.</p>
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

function SettingsView({ currentUser, onAddTimeOff, onRemoveTimeOff }) {
  const [tab, setTab] = useState("timeoff");
  const canEdit = currentUser.portalSettingsEnabled;
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [note, setNote] = useState("");

  const upcoming = [...(currentUser.timeOff || [])].sort((a, b) => a.startDate.localeCompare(b.startDate));

  function submit() {
    if (!start || !end || end < start) return;
    onAddTimeOff({ id: `t-${Date.now()}`, startDate: start, endDate: end, note: note.trim() });
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
                  : "You won't be auto-assigned any jobs or leads that fall within a period you've added here."}
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
              const avoidsIntegrated = (currentUser.integratedExclusions || []).includes(type);
              return (
                <div key={type} className="border rounded-lg p-3" style={{ borderColor: C.border, opacity: active ? 1 : 0.5 }}>
                  <p className="text-sm font-medium" style={{ color: C.text }}>{type} {active ? "✓" : ""}</p>
                  {active && (
                    <>
                      {excludedBrands.length > 0 && <p className="text-xs mt-1" style={{ color: C.mid }}>Won't repair: {excludedBrands.join(", ")}</p>}
                      {avoidsIntegrated && <p className="text-xs" style={{ color: C.mid }}>Won't do integrated/built-in units for this type</p>}
                    </>
                  )}
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
            {currentUser.postcodes.map((p) => <Pill key={p} bg={C.primarySoft} color={C.primary}>{p}</Pill>)}
          </div>
        </div>
      )}

      {tab === "documents" && (
        <div className="rounded-xl p-5" style={{ background: C.card, border: `1px solid ${C.border}` }}>
          <p className="text-sm mb-4" style={{ color: C.mid }}>
            Document uploads (insurance, certifications, ID) aren't wired up yet — this needs file storage set up on the
            backend first. This tab is a placeholder for that.
          </p>
          <div className="space-y-2">
            {["Public Liability Insurance", "Gas Safe Certificate", "PAT Testing Certificate", "Photo ID"].map((doc) => (
              <div key={doc} className="flex items-center justify-between text-sm rounded-lg px-3 py-2" style={{ background: C.sidebar, color: C.text }}>
                <span>{doc}</span>
                <Pill bg={C.border} color={C.mid}>Not uploaded</Pill>
              </div>
            ))}
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
  const [engineers, setEngineers] = useState(initialEngineers);
  const [jobs, setJobs] = useState(initialJobs);
  const [leads] = useState(initialLeads);
  const [currentUser, setCurrentUser] = useState(null);
  const [activeView, setActiveView] = useState("dashboard");

  function updateJob(updated) {
    setJobs((js) => js.map((j) => (j.id === updated.id ? updated : j)));
  }

  function updateLeadTarget(newTarget) {
    setEngineers((es) => es.map((e) => (e.id === currentUser.id ? { ...e, leadPrefs: { ...e.leadPrefs, dailyLeadTarget: newTarget } } : e)));
    setCurrentUser((cu) => ({ ...cu, leadPrefs: { ...cu.leadPrefs, dailyLeadTarget: newTarget } }));
  }

  function addOwnTimeOff(entry) {
    if (!currentUser.portalSettingsEnabled) return;
    const status = currentUser.timeOffApprovalRequired ? "pending" : "approved";
    const fullEntry = { ...entry, status };
    setEngineers((es) => es.map((e) => (e.id === currentUser.id ? { ...e, timeOff: [...(e.timeOff || []), fullEntry] } : e)));
    setCurrentUser((cu) => ({ ...cu, timeOff: [...(cu.timeOff || []), fullEntry] }));
  }

  function removeOwnTimeOff(entryId) {
    if (!currentUser.portalSettingsEnabled) return;
    setEngineers((es) => es.map((e) => (e.id === currentUser.id ? { ...e, timeOff: (e.timeOff || []).filter((t) => t.id !== entryId) } : e)));
    setCurrentUser((cu) => ({ ...cu, timeOff: (cu.timeOff || []).filter((t) => t.id !== entryId) }));
  }

  if (!currentUser) return <LoginScreen engineers={engineers} onLogin={setCurrentUser} />;

  return (
    <div className="flex min-h-screen font-sans" style={{ background: C.bg }}>
      <Sidebar currentUser={currentUser} activeView={activeView} setActiveView={setActiveView} onLogout={() => setCurrentUser(null)} />
      <main className="flex-1 p-8">
        {activeView === "dashboard" && <DashboardView currentUser={currentUser} jobs={jobs} leads={leads} />}
        {activeView === "bookings" && (
          <BookingsView currentUser={currentUser} jobs={jobs} leads={leads} onUpdateJob={updateJob} onUpdateLeadTarget={updateLeadTarget} />
        )}
        {activeView === "payments" && <PaymentsView currentUser={currentUser} jobs={jobs} leads={leads} />}
        {activeView === "support" && <SupportView />}
        {activeView === "settings" && (
          <SettingsView currentUser={currentUser} onAddTimeOff={addOwnTimeOff} onRemoveTimeOff={removeOwnTimeOff} />
        )}
      </main>
    </div>
  );
}
