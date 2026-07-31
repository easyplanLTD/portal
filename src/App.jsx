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
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function successRate(engineer) {
  const { completed, ber } = engineer.stats;
  const total = completed + ber;
  if (total === 0) return 0;
  return Math.round((completed / total) * 100);
}

function rateColor(rate) {
  if (rate >= 80) return "text-emerald-600";
  if (rate >= 60) return "text-amber-600";
  return "text-rose-600";
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
  unassigned: "bg-amber-100 text-amber-800",
  assigned: "bg-blue-100 text-blue-800",
  in_progress: "bg-indigo-100 text-indigo-800",
  completed: "bg-emerald-100 text-emerald-800",
  beyond_repair: "bg-rose-100 text-rose-800",
};
const PRIORITY_STYLES = {
  normal: "bg-slate-100 text-slate-600",
  high: "bg-amber-100 text-amber-800",
  urgent: "bg-rose-100 text-rose-800",
};

/* ------------------------------------------------------------------ */
/* Small UI atoms — same conventions as FixFlow so the two apps read   */
/* as one family rather than two differently-designed products.        */
/* ------------------------------------------------------------------ */

function Pill({ className, children }) {
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${className}`}>{children}</span>;
}

function Field({ label, children }) {
  return (
    <label className="block mb-3">
      <span className="block text-xs font-medium text-slate-500 mb-1">{label}</span>
      {children}
    </label>
  );
}

const inputCls = "w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500";

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
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 text-white">
            <div className="w-9 h-9 rounded-lg bg-teal-500 flex items-center justify-center font-bold">E</div>
            <span className="text-2xl font-bold tracking-tight">Easy Repair Portal</span>
          </div>
          <p className="text-slate-400 text-sm mt-2">Your jobs, leads, earnings, and profile</p>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); attemptLogin(email, password); }} className="bg-white rounded-xl shadow-xl p-6">
          <Field label="Email"><input className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@fixflow.co.uk" /></Field>
          <Field label="Password"><input className={inputCls} type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" /></Field>
          {error && <p className="text-rose-600 text-sm mb-3">{error}</p>}
          <button className="w-full bg-teal-600 hover:bg-teal-700 text-white font-medium rounded-lg py-2.5 transition">Log in</button>
        </form>
        <div className="mt-5 bg-slate-800 rounded-lg p-4 text-xs text-slate-300">
          <p className="font-semibold text-slate-200 mb-3">Demo logins — click to log straight in</p>
          <div className="space-y-1.5">
            {engineers.map((e) => (
              <button
                key={e.id}
                onClick={() => attemptLogin(e.email, e.password)}
                className="w-full flex items-center justify-between bg-slate-700 hover:bg-slate-600 rounded-md px-3 py-2 transition text-left"
              >
                <span className="text-slate-200 font-medium">{e.name}</span>
                <span className="text-slate-400">{e.email}</span>
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
    <div className="w-56 bg-slate-900 text-slate-300 flex flex-col shrink-0 min-h-screen">
      <div className="px-5 py-5 flex items-center gap-2 border-b border-slate-800">
        <div className="w-8 h-8 rounded-lg bg-teal-500 flex items-center justify-center font-bold text-white text-sm">E</div>
        <span className="text-white font-bold tracking-tight">Easy Repair Portal</span>
      </div>
      <nav className="flex-1 py-4 space-y-1 px-3">
        {nav.map((n) => (
          <button
            key={n.key}
            onClick={() => setActiveView(n.key)}
            className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition ${activeView === n.key ? "bg-teal-600 text-white" : "hover:bg-slate-800 text-slate-300"}`}
          >
            {n.label}
          </button>
        ))}
      </nav>
      <div className="px-4 py-4 border-t border-slate-800">
        <p className="text-sm font-medium text-white">{currentUser.name}</p>
        <p className="text-xs text-slate-400 mb-3">
          {currentUser.engineerType === "both" ? "Jobs & Leads" : currentUser.engineerType === "jobs" ? "Jobs only" : "Leads only"} engineer
        </p>
        <button onClick={onLogout} className="text-xs text-slate-400 hover:text-white underline">Log out</button>
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
      <h1 className="text-2xl font-bold text-slate-800 mb-1">Welcome back, {currentUser.name.split(" ")[0]}</h1>
      <p className="text-sm text-slate-500 mb-6">Here's where things stand today.</p>

      <div className="grid grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="text-sm text-slate-500">Jobs today</p>
          <p className="text-3xl font-bold text-slate-800">{todaysJobs.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="text-sm text-slate-500">Leads today</p>
          <p className="text-3xl font-bold text-violet-600">{leadsToday} / {currentUser.leadPrefs.dailyLeadTarget}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="text-sm text-slate-500">Success rate</p>
          <p className={`text-3xl font-bold ${rateColor(rate)}`}>{rate}%</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="text-sm text-slate-500">Repaired / BER</p>
          <p className="text-3xl font-bold text-slate-800">{currentUser.stats.completed} / {currentUser.stats.ber}</p>
        </div>
      </div>

      {pendingTimeOff.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
          <p className="font-medium text-amber-800 mb-1">You have {pendingTimeOff.length} time-off request{pendingTimeOff.length !== 1 ? "s" : ""} awaiting approval</p>
          <p className="text-sm text-amber-700">Check Settings → Holidays & Time Off for details.</p>
        </div>
      )}

      <h2 className="text-lg font-semibold text-slate-800 mb-3">Today's schedule</h2>
      <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
        {todaysJobs.length === 0 && <p className="p-4 text-sm text-slate-500">Nothing scheduled today.</p>}
        {todaysJobs.map((j) => (
          <div key={j.id} className="p-4 flex items-center justify-between">
            <div>
              <p className="font-medium text-slate-800">{j.customerName} — {j.applianceType} ({j.brand})</p>
              <p className="text-sm text-slate-500">{fmtDateTime(j.scheduledDate)} · {j.address}</p>
            </div>
            <Pill className={STATUS_STYLES[j.status]}>{j.status.replace("_", " ")}</Pill>
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
      <h1 className="text-2xl font-bold text-slate-800 mb-6">Bookings</h1>
      <div className="flex gap-2 mb-5">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium ${tab === t.key ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-600"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "jobs" && (
        <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
          {myJobs.length === 0 && <p className="p-4 text-sm text-slate-500">No jobs assigned.</p>}
          {myJobs.map((j) => (
            <div key={j.id} className="p-4">
              <div className="flex items-start justify-between mb-1">
                <p className="font-medium text-slate-800">{j.customerName} — {j.applianceType} ({j.brand})</p>
                <Pill className={STATUS_STYLES[j.status]}>{j.status.replace("_", " ")}</Pill>
              </div>
              <p className="text-sm text-slate-500">{j.address} · {j.phone}</p>
              <p className="text-sm text-slate-500">{j.faultDescription}</p>
              <p className="text-xs text-slate-400 mt-1">Scheduled: {fmtDateTime(j.scheduledDate)}</p>
              <div className="flex gap-2 mt-3">
                <button onClick={() => onUpdateJob({ ...j, status: "in_progress" })} className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-medium">Mark In Progress</button>
                <button onClick={() => onUpdateJob({ ...j, status: "completed", completedDate: new Date().toISOString() })} className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-medium">Mark Completed</button>
                <button onClick={() => onUpdateJob({ ...j, status: "beyond_repair" })} className="px-3 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-medium">Beyond Repair</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "leads" && (
        <div>
          <div className="bg-violet-50 border border-violet-200 rounded-xl p-5 mb-5">
            <p className="text-sm font-semibold text-slate-700 mb-1">How many leads would you like per day?</p>
            <p className="text-xs text-slate-500 mb-3">
              We'll assign you up to this many leads a day, matched to your area and the appliances you repair, at {fmtMoney(currentUser.leadPrefs.pricePerLead)} each.
            </p>
            <div className="flex items-center gap-4">
              <input
                type="range" min={0} max={30} step={1}
                value={currentUser.leadPrefs.dailyLeadTarget}
                onChange={(e) => onUpdateLeadTarget(Number(e.target.value))}
                className="flex-1 accent-violet-600"
              />
              <span className="w-24 text-right text-2xl font-bold text-violet-700">{currentUser.leadPrefs.dailyLeadTarget}/day</span>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
            {myLeads.length === 0 && <p className="p-4 text-sm text-slate-500">No leads assigned yet.</p>}
            {myLeads.map((l) => (
              <div key={l.id} className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <p className="font-medium text-slate-800">{l.customerName}</p>
                  <Pill className="bg-violet-100 text-violet-800">{l.status}</Pill>
                </div>
                <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm text-slate-700 mb-2">
                  <p><span className="text-slate-500">Phone:</span> {l.phone}</p>
                  <p><span className="text-slate-500">Address:</span> {l.address} ({l.postcode})</p>
                  <p><span className="text-slate-500">Appliance:</span> {l.applianceType}{l.isIntegrated ? " (Integrated)" : ""}</p>
                  <p><span className="text-slate-500">Brand:</span> {l.brand}</p>
                  <p><span className="text-slate-500">Age:</span> {l.applianceAge || "Not given"}</p>
                  <p><span className="text-slate-500">Priority:</span> {l.priority}</p>
                </div>
                <p className="text-sm text-slate-600 mb-2">{l.description}</p>
                <p className="text-xs text-slate-400">Price: {fmtMoney(l.price)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "schedule" && (
        <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
          {[...myJobs].filter((j) => j.scheduledDate).sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate)).map((j) => (
            <div key={j.id} className="p-4 flex items-center justify-between">
              <div>
                <p className="font-medium text-slate-800">{fmtDateTime(j.scheduledDate)}</p>
                <p className="text-sm text-slate-500">{j.customerName} — {j.applianceType} · {j.address}</p>
              </div>
              <Pill className={STATUS_STYLES[j.status]}>{j.status.replace("_", " ")}</Pill>
            </div>
          ))}
          {myJobs.filter((j) => j.scheduledDate).length === 0 && <p className="p-4 text-sm text-slate-500">Nothing on your schedule.</p>}
        </div>
      )}

      {tab === "reviews" && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 text-center">
          <p className="text-sm text-slate-500">Customer reviews aren't collected yet — this tab is ready for when that's wired up.</p>
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
      <h1 className="text-2xl font-bold text-slate-800 mb-6">Payments</h1>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="text-sm text-slate-500">Job earnings (completed)</p>
          <p className="text-2xl font-bold text-slate-800">{fmtMoney(jobEarnings)}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="text-sm text-slate-500">Unpaid jobs</p>
          <p className="text-2xl font-bold text-amber-600">{unpaidJobs.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="text-sm text-slate-500">Lead charges tonight</p>
          <p className="text-2xl font-bold text-violet-600">{fmtMoney(owedTonight)}</p>
        </div>
      </div>

      <h2 className="text-lg font-semibold text-slate-800 mb-3">Completed jobs</h2>
      <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
        {completedJobs.length === 0 && <p className="p-4 text-sm text-slate-500">No completed jobs yet.</p>}
        {completedJobs.map((j) => (
          <div key={j.id} className="p-4 flex items-center justify-between">
            <div>
              <p className="font-medium text-slate-800">{j.customerName} — {j.applianceType}</p>
              <p className="text-sm text-slate-500">Completed {fmtDateTime(j.completedDate)}</p>
            </div>
            <div className="text-right">
              <p className="font-semibold text-slate-800">{fmtMoney(currentUser.payRate)}</p>
              <Pill className={j.paid ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}>{j.paid ? "Paid" : "Unpaid"}</Pill>
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
      <h1 className="text-2xl font-bold text-slate-800 mb-6">Support</h1>
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <p className="text-sm text-slate-600 mb-4">Need help with a job, a payment, or your account? Get in touch with the office directly.</p>
        <div className="space-y-2 text-sm">
          <p><span className="text-slate-500">Phone:</span> 0800 123 4567</p>
          <p><span className="text-slate-500">Email:</span> support@easyrepair.co.uk</p>
          <p><span className="text-slate-500">Office hours:</span> Mon–Fri, 8am–6pm</p>
        </div>
      </div>
      <p className="text-xs text-slate-400 mt-4">A ticketing/chat system can be added here later — this is a placeholder contact page for now.</p>
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

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-800 mb-1">Settings</h1>
      <p className="text-sm text-slate-500 mb-6">
        {canEdit ? "You can manage your own profile here." : "Your admin manages most of this for you right now — you can see it here, but changes go through them."}
      </p>

      <div className="flex gap-2 mb-5">
        <button onClick={() => setTab("timeoff")} className={`px-3 py-1.5 rounded-lg text-sm font-medium ${tab === "timeoff" ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-600"}`}>Holidays & Time Off</button>
        <button onClick={() => setTab("skills")} className={`px-3 py-1.5 rounded-lg text-sm font-medium ${tab === "skills" ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-600"}`}>Skills</button>
        <button onClick={() => setTab("coverage")} className={`px-3 py-1.5 rounded-lg text-sm font-medium ${tab === "coverage" ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-600"}`}>Coverage</button>
        <button onClick={() => setTab("documents")} className={`px-3 py-1.5 rounded-lg text-sm font-medium ${tab === "documents" ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-600"}`}>Documents</button>
      </div>

      {tab === "timeoff" && (
        <div>
          {canEdit ? (
            <div className="bg-white rounded-xl border border-slate-200 p-5 mb-6">
              <p className="text-sm font-semibold text-slate-700 mb-3">Add time off</p>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <Field label="Start date"><input type="date" className={inputCls} value={start} onChange={(e) => setStart(e.target.value)} /></Field>
                <Field label="End date"><input type="date" className={inputCls} value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
              </div>
              <Field label="Note (optional)"><input className={inputCls} placeholder="e.g. Family holiday" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
              <button onClick={submit} className="px-4 py-2 rounded-lg bg-teal-600 text-white text-sm font-medium">
                {currentUser.timeOffApprovalRequired ? "Submit for approval" : "Add time off"}
              </button>
              <p className="text-xs text-slate-500 mt-2">
                {currentUser.timeOffApprovalRequired
                  ? "This needs to be approved by your admin before it's confirmed — you'll still be assignable until then."
                  : "You won't be auto-assigned any jobs or leads that fall within a period you've added here."}
              </p>
            </div>
          ) : (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 text-sm text-amber-800">
              Self-service is off for your account — ask your admin to add or change time off for you.
            </div>
          )}
          <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
            {upcoming.length === 0 && <p className="p-4 text-sm text-slate-500">No time off scheduled.</p>}
            {upcoming.map((t) => (
              <div key={t.id} className="p-4 flex items-center justify-between">
                <div>
                  <p className="font-medium text-slate-800">
                    {t.startDate === t.endDate ? t.startDate : `${t.startDate} → ${t.endDate}`}
                    {t.status === "pending" && <Pill className="bg-amber-100 text-amber-700 ml-2">Pending approval</Pill>}
                    {t.status === "approved" && <Pill className="bg-emerald-100 text-emerald-700 ml-2">Approved</Pill>}
                  </p>
                  {t.note && <p className="text-sm text-slate-500">{t.note}</p>}
                </div>
                {canEdit && <button onClick={() => onRemoveTimeOff(t.id)} className="text-xs text-rose-600 font-medium">Remove</button>}
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "skills" && (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          {!canEdit && <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">View only — ask your admin to change your skills.</p>}
          <div className="space-y-3">
            {APPLIANCE_TYPES.map((type) => {
              const active = currentUser.applianceTypes.includes(type);
              const excludedBrands = currentUser.brandExclusions[type] || [];
              const avoidsIntegrated = (currentUser.integratedExclusions || []).includes(type);
              return (
                <div key={type} className={`border rounded-lg p-3 ${active ? "border-slate-200" : "border-slate-100 opacity-50"}`}>
                  <p className="text-sm font-medium text-slate-700">{type} {active ? "✓" : ""}</p>
                  {active && (
                    <>
                      {excludedBrands.length > 0 && <p className="text-xs text-slate-500 mt-1">Won't repair: {excludedBrands.join(", ")}</p>}
                      {avoidsIntegrated && <p className="text-xs text-slate-500">Won't do integrated/built-in units for this type</p>}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tab === "coverage" && (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          {!canEdit && <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">View only — ask your admin to change your coverage area.</p>}
          <p className="text-sm font-semibold text-slate-700 mb-2">Postcode areas you cover</p>
          <div className="flex flex-wrap gap-1">
            {currentUser.postcodes.map((p) => <Pill key={p} className="bg-slate-100 text-slate-700">{p}</Pill>)}
          </div>
        </div>
      )}

      {tab === "documents" && (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="text-sm text-slate-500 mb-4">
            Document uploads (insurance, certifications, ID) aren't wired up yet — this needs file storage set up on the
            backend first. This tab is a placeholder for that.
          </p>
          <div className="space-y-2">
            {["Public Liability Insurance", "Gas Safe Certificate", "PAT Testing Certificate", "Photo ID"].map((doc) => (
              <div key={doc} className="flex items-center justify-between text-sm bg-slate-50 rounded-lg px-3 py-2">
                <span>{doc}</span>
                <Pill className="bg-slate-200 text-slate-500">Not uploaded</Pill>
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
    <div className="flex min-h-screen bg-slate-50 font-sans">
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
