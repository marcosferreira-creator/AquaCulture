    const { useState, useEffect, useRef, createContext, useContext, useCallback, useMemo } = React;
    const { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend, PieChart, Pie, Cell } = Recharts;

// ═══════════════════════════════════════════════════════════════════════════════
// SUPABASE — Banco de dados na nuvem
// ═══════════════════════════════════════════════════════════════════════════════
var SB_URL = "https://emwiklhtgtyidlashdeo.supabase.co";
var SB_KEY = "sb_publishable_I4_rnUX6-I8GSfJhXqAYTw_ZG6A1I0A";

async function sbRequest(method, table, body, params) {
  var url = SB_URL + "/rest/v1/" + table;
  if (params) url += "?" + params;
  var opts = {
    method: method,
    headers: {
      "apikey": SB_KEY,
      "Authorization": "Bearer " + SB_KEY,
      "Content-Type": "application/json",
      "Prefer": method === "POST" ? "resolution=merge-duplicates,return=minimal" : "return=minimal"
    }
  };
  if (body) opts.body = JSON.stringify(body);
  try {
    var r = await fetch(url, opts);
    if (!r.ok) {
      var err = await r.text().catch(function(){ return ""; });
      console.warn("Supabase", method, table, r.status, err.slice(0,100));
      return null;
    }
    var txt = await r.text();
    return txt ? JSON.parse(txt) : null;
  } catch(e) {
    console.warn("Supabase offline:", e.message);
    return null;
  }
}

// ── DB helpers — TODOS filtrados por user_email ───────────────────────────────
var DB = {
  async getUsers() {
    var rows = await sbRequest("GET","ac_users","","select=*");
    return rows || [];
  },
  async saveUser(user) {
    return sbRequest("POST","ac_users",user,"");
  },
  async updateUser(user) {
    return sbRequest("PATCH","ac_users",user,"id=eq."+user.id);
  },
  async deleteUser(id) {
    return sbRequest("DELETE","ac_users",null,"id=eq."+id);
  },
  async getTanks(email) {
    var rows = await sbRequest("GET","ac_tanks","","select=*&user_email=eq."+encodeURIComponent(email));
    if (!rows || !rows.length) return [];
    return rows.map(function(r){ return r.data; });
  },
  async saveTank(tank, email) {
    return sbRequest("POST","ac_tanks",{ id:tank.id, data:tank, user_email:email, updated_at:new Date().toISOString() },"");
  },
  async deleteTank(id) {
    await sbRequest("DELETE","ac_logs",null,"tank_id=eq."+id);
    await sbRequest("DELETE","ac_expenses",null,"tank_id=eq."+id);
    return sbRequest("DELETE","ac_tanks",null,"id=eq."+id);
  },
  async getLogs(email) {
    var rows = await sbRequest("GET","ac_logs","","select=*&user_email=eq."+encodeURIComponent(email));
    if (!rows || !rows.length) return {};
    var result = {};
    rows.forEach(function(r) {
      if (!result[r.tank_id]) result[r.tank_id] = {};
      result[r.tank_id][r.log_date] = r.data;
    });
    return result;
  },
  async saveLog(tankId, date, data, email) {
    return sbRequest("POST","ac_logs",{ tank_id:tankId, log_date:date, data:data, user_email:email, updated_at:new Date().toISOString() },"");
  },
  async getExpenses(email) {
    var rows = await sbRequest("GET","ac_expenses","","select=*&user_email=eq."+encodeURIComponent(email));
    if (!rows || !rows.length) return {};
    var result = {};
    rows.forEach(function(r) { result[r.tank_id] = r.data; });
    return result;
  },
  async saveExpenses(tankId, data, email) {
    return sbRequest("POST","ac_expenses",{ tank_id:tankId, data:data, user_email:email, updated_at:new Date().toISOString() },"");
  },
  async getStock(email) {
    var rows = await sbRequest("GET","ac_stock","","user_email=eq."+encodeURIComponent(email)+"&select=data");
    return rows && rows[0] ? rows[0].data : null;
  },
  async saveStock(data, email) {
    return sbRequest("POST","ac_stock",{ id:email, data:data, user_email:email, updated_at:new Date().toISOString() },"");
  },
  async getCapex(email) {
    var rows = await sbRequest("GET","ac_capex","","user_email=eq."+encodeURIComponent(email)+"&select=data");
    return rows && rows[0] ? rows[0].data : [];
  },
  async saveCapex(data, email) {
    return sbRequest("POST","ac_capex",{ id:email, data:data, user_email:email, updated_at:new Date().toISOString() },"");
  },
  async getOpex(email) {
    var rows = await sbRequest("GET","ac_opex","","user_email=eq."+encodeURIComponent(email)+"&select=data");
    return rows && rows[0] ? rows[0].data : [];
  },
  async saveOpex(data, email) {
    return sbRequest("POST","ac_opex",{ id:email, data:data, user_email:email, updated_at:new Date().toISOString() },"");
  },
};

// ── Migration: move localStorage data to Supabase on first run ────────────────
async function migrateLocalToSupabase(email) {
  var migrated = localStorage.getItem("aq_migrated_v1");
  if (migrated) return;
  console.log("Migrando dados locais para Supabase...");
  try {
    var localTanks = JSON.parse(localStorage.getItem("aq_tanks")||"[]");
    for (var t of localTanks) { await DB.saveTank(t, email); }
    var localLogs = JSON.parse(localStorage.getItem("aq_logs")||"{}");
    for (var tankId in localLogs) {
      for (var date in localLogs[tankId]) {
        await DB.saveLog(tankId, date, localLogs[tankId][date], email);
      }
    }
    var localExp = JSON.parse(localStorage.getItem("aq_exp")||"{}");
    for (var tid in localExp) { await DB.saveExpenses(tid, localExp[tid], email); }
    var localStock = JSON.parse(localStorage.getItem("aq_stoc")||"null");
    if (localStock) await DB.saveStock(localStock, email);
    var localCapex = JSON.parse(localStorage.getItem("aq_capex")||"[]");
    if (localCapex.length) await DB.saveCapex(localCapex, email);
    var localOpex = JSON.parse(localStorage.getItem("aq_opex_g")||"[]");
    if (localOpex.length) await DB.saveOpex(localOpex, email);
    localStorage.setItem("aq_migrated_v1", "1");
    console.log("✅ Migração concluída!");
  } catch(e) {
    console.warn("Migração parcial:", e);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// UNIT SYSTEM
// ═══════════════════════════════════════════════════════════════════════════════
const UNITS_DEF = {
    area: { m2: { label: "m²", factor: 1 }, ha: { label: "ha", factor: 10000 } },
    depth: { m: { label: "m", factor: 1 }, cm: { label: "cm", factor: 0.01 } },
    weight: { g: { label: "g", factor: 1 }, kg: { label: "kg", factor: 1000 } },
    feed: { sack: { label: "sacos 25kg", factor: 25 }, kg: { label: "kg", factor: 1 } },
    length: { cm: { label: "cm", factor: 1 }, m: { label: "m", factor: 100 } },
    currency: { brl: { label: "R$", factor: 1 } },
};
function toBase(v, cat, u) { var _a, _b; return parseFloat(v || 0) * (((_b = (_a = UNITS_DEF[cat]) === null || _a === void 0 ? void 0 : _a[u]) === null || _b === void 0 ? void 0 : _b.factor) || 1); }
function fromBase(v, cat, u) { var _a, _b; return (v || 0) / (((_b = (_a = UNITS_DEF[cat]) === null || _a === void 0 ? void 0 : _a[u]) === null || _b === void 0 ? void 0 : _b.factor) || 1); }
function fmtU(v, cat, u, d = 2) { var _a, _b; if (v == null || isNaN(v)) return "—"; return `${fromBase(v, cat, u).toFixed(d)} ${((_b = (_a = UNITS_DEF[cat]) === null || _a === void 0 ? void 0 : _a[u]) === null || _b === void 0 ? void 0 : _b.label) || ""}`; }
function fmtBRL(v) { return `R$ ${(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
function sacos(kg) { return (kg / 25).toFixed(2); }
function sacosLabel(kg) { return `${sacos(kg)} sacos (${kg.toFixed(1)} kg)`; }

// ═══════════════════════════════════════════════════════════════════════════════
// SPECIES DATABASE
// ═══════════════════════════════════════════════════════════════════════════════
const FCR_META = { matrinxa: 2.5, tambaqui: 1.7 };
const FCR_ALERT = { matrinxa: 3.0, tambaqui: 2.2 };

function depthMultiplier(depthM) {
    if (depthM < 1.0) return 0.75;
    if (depthM < 1.2) return 0.90;
    if (depthM <= 1.8) return 1.00;
    if (depthM <= 2.5) return 1.10;
    return 1.05;
}
function calcCapacity(species, areaM2, depthM) {
    var _a;
    const sp = SP[species];
    if (!sp || !areaM2) return { byArea: 0, byVolume: 0, ideal: 0, limitingFactor: "—", multiplier: 1 };
    const mult = depthMultiplier(depthM || 1.5);
    const volM3 = areaM2 * (depthM || 1.5);
    const byArea = Math.floor(areaM2 * sp.densityPerM2 * mult);
    const byVolume = Math.floor(volM3 * sp.kgPerM3 * 1000 / (((_a = sp.phases[2]) === null || _a === void 0 ? void 0 : _a.minW) || 300));
    const ideal = Math.min(byArea, byVolume);
    const limitingFactor = byArea <= byVolume ? "Superfície (O₂/aeração)" : "Volume (diluição amônia)";
    return { byArea, byVolume, ideal, limitingFactor, multiplier: mult, volM3 };
}
function depthStatus(depthM) {
    if (depthM < 1.0) return { label: "⚠️ Rasa demais", color: "#ef4444", tip: "Volume insuficiente. Amônia se concentra rapidamente. Reduza estoque em 25%." };
    if (depthM < 1.2) return { label: "🟡 Abaixo do ideal", color: "#f59e0b", tip: "Reduza levemente a densidade recomendada (−10%)." };
    if (depthM <= 1.8) return { label: "✅ Profundidade ideal", color: "#22c55e", tip: "Faixa ideal para semi-intensivo com aeração." };
    if (depthM <= 2.5) return { label: "✅ Boa profundidade", color: "#22c55e", tip: "Volume extra melhora diluição. Verifique alcance dos aeradores." };
    return { label: "⚠️ Muito funda", color: "#f59e0b", tip: "Aeradores de superfície perdem eficiência. Risco de estratificação de O₂ nas camadas fundas." };
}
const SP = {
    matrinxa: {
        name: "Matrinxã", color: "#22c55e", icon: "🐟", imgSrc: "/icon.png",
        densityPerM2: 1.9, idealDensityPerHa: 19000, maxDensityPerHa: 20000,
        idealHarvestKg: 1.5, kgPerM2Harvest: 2.85, kgPerM3: 3.5,
        minDepthM: 1.5, idealDepthM: 2.0, maxDepthM: 3.0,
        minO2: 5, idealO2: 7, maxTemp: 30, minTemp: 22, idealTemp: 27, phMin: 6.5, phMax: 8.5,
        phases: [
            { name: "Alevino", minW: 0, maxW: 50, pct: 0.08, freq: 4, fcr: 2.5, protPct: 40 },
            { name: "Juvenil", minW: 50, maxW: 200, pct: 0.05, freq: 3, fcr: 2.5, protPct: 36 },
            { name: "Engorda I", minW: 200, maxW: 600, pct: 0.03, freq: 2, fcr: 2.5, protPct: 32 },
            { name: "Engorda II", minW: 600, maxW: 1500, pct: 0.02, freq: 2, fcr: 2.5, protPct: 28 },
        ],
        feedTable: [
            { range: "0–50g", pct: "8,0%", freq: "4x/dia", fcr: "2,5 ✦meta", protein: "40%", obs: "Extrusada P (micro)" },
            { range: "50–200g", pct: "5,0%", freq: "3x/dia", fcr: "2,5 ✦meta", protein: "36%", obs: "Extrusada P" },
            { range: "200–600g", pct: "3,0%", freq: "2x/dia", fcr: "2,5 ✦meta", protein: "32%", obs: "Extrusada M" },
            { range: "600–1500g", pct: "2,0%", freq: "2x/dia", fcr: "2,5 ✦meta", protein: "28%", obs: "Extrusada G" },
        ],
    },
    tambaqui: {
        name: "Tambaqui", color: "#f59e0b", icon: "🐠", imgSrc: "/icon.png",
        densityPerM2: 0.7, idealDensityPerHa: 7000, maxDensityPerHa: 8000,
        idealHarvestKg: 3.5, kgPerM2Harvest: 2.45, kgPerM3: 2.5,
        minDepthM: 1.5, idealDepthM: 2.0, maxDepthM: 3.0,
        minO2: 4, idealO2: 6, maxTemp: 32, minTemp: 24, idealTemp: 28, phMin: 6.0, phMax: 8.0,
        phases: [
            { name: "Alevino", minW: 0, maxW: 50, pct: 0.10, freq: 4, fcr: 1.1, protPct: 36 },
            { name: "Juvenil", minW: 50, maxW: 250, pct: 0.06, freq: 3, fcr: 1.3, protPct: 32 },
            { name: "Engorda I", minW: 250, maxW: 700, pct: 0.035, freq: 2, fcr: 1.5, protPct: 28 },
            { name: "Engorda II", minW: 700, maxW: 2000, pct: 0.025, freq: 2, fcr: 1.7, protPct: 24 },
        ],
        feedTable: [
            { range: "0–50g", pct: "10,0%", freq: "4x/dia", fcr: "1,1", protein: "36%", obs: "Extrusada P (micro)" },
            { range: "50–250g", pct: "6,0%", freq: "3x/dia", fcr: "1,3", protein: "32%", obs: "Extrusada P" },
            { range: "250–700g", pct: "3,5%", freq: "2x/dia", fcr: "1,5", protein: "28%", obs: "Extrusada M" },
            { range: "700–2000g", pct: "2,5%", freq: "2x/dia", fcr: "1,7", protein: "24%", obs: "Extrusada G" },
        ],
    },
    ilapia: {
        name: "Tilápia", color: "#6366f1", icon: "🐡",
        densityPerM2: 4, kgPerM3: 25, minDepthM: 1.0, idealDepthM: 1.5, maxDepthM: 2.5,
        minO2: 3, idealO2: 6, maxTemp: 32, minTemp: 20, idealTemp: 28, phMin: 6.0, phMax: 9.0,
        phases: [
            { name: "Alevino", minW: 0, maxW: 30, pct: 0.10, freq: 5, fcr: 1.0, protPct: 36 },
            { name: "Juvenil", minW: 30, maxW: 150, pct: 0.06, freq: 4, fcr: 1.2, protPct: 32 },
            { name: "Engorda I", minW: 150, maxW: 400, pct: 0.04, freq: 3, fcr: 1.4, protPct: 28 },
            { name: "Engorda II", minW: 400, maxW: 900, pct: 0.025, freq: 2, fcr: 1.5, protPct: 24 },
        ],
        feedTable: [
            { range: "0–30g", pct: "10,0%", freq: "5x/dia", fcr: "1,0", protein: "36%", obs: "Extrusada P (micro)" },
            { range: "30–150g", pct: "6,0%", freq: "4x/dia", fcr: "1,2", protein: "32%", obs: "Extrusada P" },
            { range: "150–400g", pct: "4,0%", freq: "3x/dia", fcr: "1,4", protein: "28%", obs: "Extrusada M" },
            { range: "400–900g", pct: "2,5%", freq: "2x/dia", fcr: "1,5", protein: "24%", obs: "Extrusada G" },
        ],
    },
};
function getPhase(sp, grams) {
    var _a;
    const p = ((_a = SP[sp]) === null || _a === void 0 ? void 0 : _a.phases) || [];
    return p.find(x => grams >= x.minW && grams < x.maxW) || p[p.length - 1];
}
function today() { return new Date().toISOString().split("T")[0]; }
function genId() { return Math.random().toString(36).slice(2, 9); }
function load(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } }
function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { } }

// ═══════════════════════════════════════════════════════════════════════════════
// CONTEXT
// ═══════════════════════════════════════════════════════════════════════════════
const Ctx = (0, createContext)(null);
function useApp() { return (0, useContext)(Ctx); }

// ═══════════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════════
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;600&display=swap');
*{box-sizing:border-box;margin:0;padding:0}
:root{
  --navy:#060e1a;--dark:#0b1626;--card:#111e30;--card2:#162438;
  --border:rgba(255,255,255,0.07);--border2:rgba(255,255,255,0.12);
  --text:#e8f4ff;--muted:#5a7a9a;--accent:#0ea5e9;--accent2:#38bdf8;
  --green:#22c55e;--red:#ef4444;--yellow:#f59e0b;--purple:#a78bfa;
  --font:'Sora',sans-serif;--mono:'JetBrains Mono',monospace;
}
body{background:var(--navy);color:var(--text);font-family:var(--font);min-height:100vh;}
::-webkit-scrollbar{width:4px;height:4px}::-webkit-scrollbar-track{background:var(--dark)}::-webkit-scrollbar-thumb{background:#1e3a5a;border-radius:4px}
input,select,textarea{outline:none;font-family:var(--font);}
.card{background:var(--card);border:1px solid var(--border);border-radius:14px;}
.card2{background:var(--card2);border:1px solid var(--border2);border-radius:10px;}
.inp{background:rgba(255,255,255,0.04);border:1px solid var(--border2);border-radius:9px;padding:9px 13px;color:var(--text);font-size:13px;width:100%;transition:border-color .2s;color-scheme:dark;}select.inp,select{color-scheme:dark;background:#0d1829!important;color:#e2e8f0!important;}option{background:#0d1829!important;color:#e2e8f0!important;}
.inp:focus{border-color:var(--accent);}
.inp option{background:#0b1626;}
.btn{border:none;border-radius:9px;padding:9px 18px;cursor:pointer;font-family:var(--font);font-weight:600;font-size:13px;transition:all .2s;}
.btn-p{background:linear-gradient(135deg,#0ea5e9,#0284c7);color:#fff;}
.btn-p:hover{opacity:.85;transform:translateY(-1px);}
.btn-g{background:rgba(255,255,255,0.05);border:1px solid var(--border2);color:var(--muted);}
.btn-g:hover{background:rgba(255,255,255,0.09);color:var(--text);}
.btn-r{background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.3);color:#f87171;}
.btn-r:hover{background:rgba(239,68,68,0.2);}
.badge{display:inline-flex;align-items:center;gap:4px;padding:3px 9px;border-radius:20px;font-size:11px;font-weight:600;}
lbl{display:block;font-size:11px;font-weight:600;color:var(--muted);letter-spacing:.5px;text-transform:uppercase;margin-bottom:5px;}
.pulse{animation:pulse 2s infinite;}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.55}}
.slide{animation:slide .25s ease;}
@keyframes slide{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:14px;}
.grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;}
.grid4{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;}
@media(max-width:700px){.grid2,.grid3,.grid4{grid-template-columns:1fr!important;}}
.kpi{padding:16px 18px;}
.kpi .val{font-size:22px;font-weight:700;font-family:var(--mono);margin:6px 0 2px;}
.kpi .lbl{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;}
.kpi .ico{font-size:20px;margin-bottom:4px;}
.alert-bar{padding:11px 16px;border-radius:10px;font-size:13px;display:flex;align-items:center;gap:10px;}
.tab-btn{padding:7px 15px;border-radius:8px;cursor:pointer;font-family:var(--font);font-weight:500;font-size:12px;transition:all .2s;border:1px solid var(--border2);background:rgba(255,255,255,0.03);color:var(--muted);}
.tab-btn.active{background:linear-gradient(135deg,#0ea5e9,#0284c7);border-color:transparent;color:#fff;}
table{width:100%;border-collapse:collapse;}
th{background:rgba(14,165,233,0.12);color:var(--accent2);font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;padding:9px 12px;text-align:left;}
td{padding:8px 12px;font-size:13px;border-bottom:1px solid var(--border);}
tr:last-child td{border-bottom:none;}
tr:hover td{background:rgba(255,255,255,0.02);}
.section-hdr{font-size:11px;font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:1px;margin-bottom:12px;padding-bottom:6px;border-bottom:1px solid var(--border);}
.mono{font-family:var(--mono);}
.mob-menu{position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(6,14,26,0.97);z-index:200;display:flex;flex-direction:column;padding:70px 20px 30px;gap:6px;overflow-y:auto;}
.mob-item{display:flex;align-items:center;gap:14px;padding:14px 18px;border-radius:12px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.07);cursor:pointer;font-size:15px;font-weight:600;color:var(--text);transition:background .15s;}
.mob-item:active{background:rgba(14,165,233,0.15);}
.mob-item.active{background:rgba(14,165,233,0.12);border-color:rgba(14,165,233,0.3);color:var(--accent);}
.mob-divider{height:1px;background:var(--border);margin:8px 0;}
.mob-section{font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:1px;padding:4px 18px;}
.bottom-bar{position:fixed;bottom:0;left:0;right:0;background:rgba(6,14,26,0.97);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border-top:1px solid var(--border);display:flex;z-index:150;padding-bottom:env(safe-area-inset-bottom);}
.pwa-top-fix{padding-top:env(safe-area-inset-top)!important;height:calc(52px + env(safe-area-inset-top, 20px))!important;}
@supports(padding-top:env(safe-area-inset-top)){nav{padding-top:env(safe-area-inset-top);height:calc(52px + env(safe-area-inset-top));}}
.bottom-tab{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:10px 4px 8px;cursor:pointer;border:none;background:none;color:var(--muted);font-family:var(--font);font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:.4px;gap:4px;transition:color .15s;}
.bottom-tab .ico{font-size:20px;line-height:1;}
.bottom-tab.active{color:var(--accent);}
.bottom-tab.active .ico{transform:scale(1.1);}
.compact-nav{height:52px;padding:0 16px;display:flex;align-items:center;gap:10;}
.hamburger{background:none;border:none;cursor:pointer;padding:8px;border-radius:8px;display:flex;flex-direction:column;gap:5px;}
.hamburger span{display:block;width:22px;height:2px;background:var(--text);border-radius:2px;transition:all .2s;}
.kpi-row{display:flex;gap:10px;overflow-x:auto;padding-bottom:6px;scrollbar-width:none;-webkit-overflow-scrolling:touch;}
.kpi-row::-webkit-scrollbar{display:none;}
.kpi-chip{flex:0 0 auto;background:var(--card);border:1px solid var(--border);border-radius:12px;padding:12px 14px;min-width:100px;text-align:center;}
.kpi-chip .val{font-size:15px;font-weight:700;font-family:var(--mono);}
.kpi-chip .lbl{font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.4px;margin-top:3px;}
.page-content{padding-bottom:90px;padding-top:8px;}
@media(max-width:600px){
  .grid2,.grid3,.grid4{grid-template-columns:1fr!important;}
  .kpi-row .kpi-chip{min-width:90px;}
}
@supports(padding-top:env(safe-area-inset-top)){
  nav{padding-top:max(env(safe-area-inset-top),12px)!important;}
  .mob-menu{padding-top:calc(max(env(safe-area-inset-top),12px) + 60px)!important;}
}
`;

// ═══════════════════════════════════════════════════════════════════════════════
// AUTH SYSTEM
// ═══════════════════════════════════════════════════════════════════════════════
const ROLES = {
  admin: {
    label:"Administrador", color:"#22c55e", icon:"👑",
    canManageUsers:true, canViewDashboard:true, canEditTanks:true,
    canRegisterDaily:true, canRegisterBio:true, canRegisterExpense:true,
    canViewExpenses:true, canViewFinance:true, canViewReports:true, canManageStock:true,
  },
  manejo: {
    label:"Manejo", color:"#0ea5e9", icon:"👷",
    canManageUsers:false, canViewDashboard:true, canEditTanks:false,
    canRegisterDaily:true, canRegisterBio:true, canRegisterExpense:false,
    canViewExpenses:false, canViewFinance:false, canViewReports:false, canManageStock:false,
  },
  financeiro: {
    label:"Financeiro", color:"#f59e0b", icon:"💼",
    canManageUsers:false, canViewDashboard:true, canEditTanks:false,
    canRegisterDaily:false, canRegisterBio:false, canRegisterExpense:true,
    canViewExpenses:false, canViewFinance:false, canViewReports:false, canManageStock:true,
  },
  cliente: {
    label:"Cliente (Fazenda)", color:"#a78bfa", icon:"🏢",
    canManageUsers:false, canViewDashboard:true, canEditTanks:true,
    canRegisterDaily:true, canRegisterBio:true, canRegisterExpense:true,
    canViewExpenses:true, canViewFinance:true, canViewReports:true, canManageStock:true,
  },
};

function auditStamp(session){
  if(!session) return {};
  return {
    _by: session.name, _role: session.role,
    _at: new Date().toLocaleString("pt-BR", {day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"}),
  };
}
function AuditBadge({ stamp, style }){
  if(!stamp || !stamp._by) return null;
  return React.createElement("div", { style:{ fontSize:10, color:"#5a7a9a", display:"flex", alignItems:"center", gap:4, ...style } },
    React.createElement("span", null, "\uD83D\uDC64"),
    React.createElement("span", null, stamp._by),
    React.createElement("span", { style:{color:"rgba(255,255,255,0.15)"} }, "·"),
    React.createElement("span", null, stamp._at)
  );
}

const DEFAULT_ADMIN = { id:"admin001", name:"Marcos Ferreira", email:"marcos.ferreira.026@icloud.com", role:"admin", password:"aqua@2024" };

function getUsers(){ try{ return JSON.parse(localStorage.getItem("aq_users")||"[]"); }catch(e){return [];} }
function saveUsers(u){ localStorage.setItem("aq_users",JSON.stringify(u)); }
function getSession(){ try{ return JSON.parse(localStorage.getItem("aq_session")||"null"); }catch(e){return null;} }
function saveSession(s){ if(s) localStorage.setItem("aq_session",JSON.stringify(s)); else localStorage.removeItem("aq_session"); }

(function initAuth(){
  try {
    var raw = localStorage.getItem("aq_users");
    var users = [];
    try { users = raw ? JSON.parse(raw) : []; if (!Array.isArray(users)) users = []; } catch(e) { users = []; }
    if (!users.find(function(u){ return u.id === "admin001"; })) {
      users.unshift(DEFAULT_ADMIN);
      localStorage.setItem("aq_users", JSON.stringify(users));
    } else {
      users = users.map(function(u){
        if (u.id === "admin001") return Object.assign({}, u, { email: DEFAULT_ADMIN.email, name: DEFAULT_ADMIN.name });
        return u;
      });
      localStorage.setItem("aq_users", JSON.stringify(users));
    }
  } catch(e) {
    localStorage.setItem("aq_users", JSON.stringify([DEFAULT_ADMIN]));
  }
})();

function LoginPage({ onLogin }){
  var email = (useState(function(){ return localStorage.getItem("aq_remember_email")||""; }));
  var setEmail = email[1]; email = email[0];
  var pass = (useState(function(){ return localStorage.getItem("aq_remember_pass")||""; }));
  var setPass = pass[1]; pass = pass[0];
  var remember = (useState(function(){ return !!localStorage.getItem("aq_remember_email"); }));
  var setRemember = remember[1]; remember = remember[0];
  var error = (useState("")); var setError = error[1]; error = error[0];
  var showPass = (useState(false)); var setShowPass = showPass[1]; showPass = showPass[0];
  var loading = (useState(false)); var setLoading = loading[1]; loading = loading[0];
  var showForgot = (useState(false)); var setShowForgot = showForgot[1]; showForgot = showForgot[0];

  function handleLogin(){
    setError(""); setLoading(true);
    DB.getUsers().then(function(dbUsers) {
      var users = (dbUsers && dbUsers.length > 0) ? dbUsers : getUsers();
      var user = users.find(function(u){ return u.email.toLowerCase()===email.trim().toLowerCase() && u.password===pass; });
      if(user){
        var session = { id:user.id, name:user.name, email:user.email, role:user.role, loginAt: new Date().toISOString() };
        saveSession(session);
        if(remember){ localStorage.setItem("aq_remember_email",email.trim()); localStorage.setItem("aq_remember_pass",pass); }
        else { localStorage.removeItem("aq_remember_email"); localStorage.removeItem("aq_remember_pass"); }
        onLogin(session);
      } else { setError("E-mail ou senha incorretos."); }
      setLoading(false);
    }).catch(function() {
      var users = getUsers();
      var user = users.find(function(u){ return u.email.toLowerCase()===email.trim().toLowerCase() && u.password===pass; });
      if(user){
        var session = { id:user.id, name:user.name, email:user.email, role:user.role, loginAt: new Date().toISOString() };
        saveSession(session);
        if(remember){ localStorage.setItem("aq_remember_email",email.trim()); localStorage.setItem("aq_remember_pass",pass); }
        else { localStorage.removeItem("aq_remember_email"); localStorage.removeItem("aq_remember_pass"); }
        onLogin(session);
      } else { setError("E-mail ou senha incorretos."); }
      setLoading(false);
    });
  }

  return React.createElement("div", { style:{minHeight:"100vh",background:"#060e1a",display:"flex",alignItems:"flex-start",justifyContent:"center",padding:"calc(env(safe-area-inset-top) + 40px) 20px 40px",overflowY:"auto",boxSizing:"border-box"} },
    React.createElement("div", {style:{width:"100%",maxWidth:380}},
      React.createElement("div", {style:{textAlign:"center",marginBottom:32}},
        React.createElement("img", {src:"/icon.png",style:{width:90,height:90,borderRadius:18,objectFit:"cover",marginBottom:16}}),
        React.createElement("div", {style:{fontWeight:800,fontSize:26,color:"#fff",letterSpacing:"-0.5px"}}, "AquaCulture"),
        React.createElement("div", {style:{fontSize:13,color:"#5a7a9a",marginTop:4}}, "Sistema de Gestão de Piscicultura")
      ),
      React.createElement("div", {style:{background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:16,padding:28}},
        React.createElement("div", {style:{fontSize:16,fontWeight:700,color:"#fff",marginBottom:20}}, "Entrar na sua conta"),
        React.createElement("div", {style:{marginBottom:14}},
          React.createElement("label", {style:{fontSize:11,fontWeight:700,color:"#5a7a9a",textTransform:"uppercase",letterSpacing:".5px",display:"block",marginBottom:6}}, "E-mail"),
          React.createElement("input", {type:"email",placeholder:"seu@email.com",value:email,onChange:function(e){ setEmail(e.target.value); },onKeyDown:function(e){ if(e.key==="Enter") handleLogin(); },style:{width:"100%",padding:"12px 14px",background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.12)",borderRadius:10,color:"#fff",fontSize:14,fontFamily:"inherit",outline:"none",boxSizing:"border-box"}})
        ),
        React.createElement("div", {style:{marginBottom:16,position:"relative"}},
          React.createElement("label", {style:{fontSize:11,fontWeight:700,color:"#5a7a9a",textTransform:"uppercase",letterSpacing:".5px",display:"block",marginBottom:6}}, "Senha"),
          React.createElement("input", {type:showPass?"text":"password",placeholder:"••••••••",value:pass,onChange:function(e){ setPass(e.target.value); },onKeyDown:function(e){ if(e.key==="Enter") handleLogin(); },style:{width:"100%",padding:"12px 40px 12px 14px",background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.12)",borderRadius:10,color:"#fff",fontSize:14,fontFamily:"inherit",outline:"none",boxSizing:"border-box"}}),
          React.createElement("button", {onClick:function(){ setShowPass(function(p){ return !p; }); },style:{position:"absolute",right:12,top:34,background:"none",border:"none",cursor:"pointer",color:"#5a7a9a",fontSize:16}}, showPass?"🙈":"👁️")
        ),
        React.createElement("div", {style:{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}},
          React.createElement("label", {style:{display:"flex",alignItems:"center",gap:7,cursor:"pointer",fontSize:13,color:"#5a7a9a"}},
            React.createElement("input", {type:"checkbox",checked:remember,onChange:function(e){ setRemember(e.target.checked); },style:{width:16,height:16,accentColor:"#0ea5e9",cursor:"pointer"}}),
            " Lembrar minha senha"
          ),
          React.createElement("button", {onClick:function(){ setShowForgot(true); },style:{background:"none",border:"none",cursor:"pointer",color:"#0ea5e9",fontSize:13,fontFamily:"inherit"}}, "Esqueci minha senha")
        ),
        error && React.createElement("div", {style:{background:"rgba(239,68,68,0.1)",border:"1px solid rgba(239,68,68,0.3)",borderRadius:8,padding:"10px 13px",fontSize:13,color:"#f87171",marginBottom:16}}, error),
        React.createElement("button", {onClick:handleLogin,disabled:loading||!email||!pass,style:{width:"100%",padding:13,background:loading||!email||!pass?"rgba(14,165,233,0.4)":"linear-gradient(135deg,#0ea5e9,#0284c7)",border:"none",borderRadius:10,color:"#fff",fontSize:15,fontWeight:700,cursor:loading||!email||!pass?"not-allowed":"pointer",fontFamily:"inherit"}}, loading?"Entrando...":"Entrar")
      ),
      React.createElement("div", {style:{textAlign:"center",marginTop:20,fontSize:12,color:"#5a7a9a"}}, "Não tem acesso? Entre em contato com o administrador.")
    ),
    showForgot && React.createElement("div", {style:{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",backdropFilter:"blur(10px)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:20}},
      React.createElement("div", {style:{background:"#0d1829",border:"1px solid rgba(255,255,255,0.12)",borderRadius:16,padding:28,width:"100%",maxWidth:360}},
        React.createElement("div", {style:{fontWeight:700,fontSize:16,color:"#fff",marginBottom:8}}, "Recuperar Senha"),
        React.createElement("div", {style:{fontSize:13,color:"#5a7a9a",marginBottom:18,lineHeight:1.6}},
          "Entre em contato com o administrador para redefinir sua senha:",
          React.createElement("a", {href:"mailto:marcos.ferreira.026@icloud.com",style:{color:"#0ea5e9",display:"block",marginTop:6}}, "marcos.ferreira.026@icloud.com")
        ),
        React.createElement("button", {onClick:function(){ setShowForgot(false); },style:{width:"100%",padding:12,background:"rgba(14,165,233,0.15)",border:"1px solid rgba(14,165,233,0.3)",borderRadius:9,color:"#0ea5e9",fontSize:14,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}, "Fechar")
      )
    )
  );
}

function UserManagementModal({ onClose, currentUser }){
  const [users, setUsersState] = useState(getUsers);
  (0, useEffect)(function(){
    DB.getUsers().then(function(dbUsers){
      if(dbUsers && dbUsers.length > 0){ saveUsers(dbUsers); setUsersState(dbUsers); }
    }).catch(function(){});
  }, []);
  const [tab, setTab] = useState("list");
  const [form, setForm] = useState({ name:"", email:"", role:"manejo", password:"" });
  const [editId, setEditId] = useState(null);
  const [msg, setMsg] = useState("");

  function refresh(){ setUsersState(getUsers()); }

  function saveUser(){
    if(!form.name||!form.email||(!editId&&!form.password)) return setMsg("Preencha todos os campos.");
    const all = getUsers();
    if(editId){
      const updUser = {...all.find(u=>u.id===editId), name:form.name, email:form.email, role:form.role, ...(form.password?{password:form.password}:{})};
      const updated = all.map(u=> u.id===editId ? updUser : u);
      saveUsers(updated); DB.saveUser(updUser);
    } else {
      if(all.find(u=>u.email.toLowerCase()===form.email.toLowerCase())) return setMsg("E-mail já cadastrado.");
      const newUser = { id:"u"+Date.now(), ...form };
      saveUsers([...all, newUser]); DB.saveUser(newUser);
    }
    setMsg(editId?"✅ Usuário atualizado!":"✅ Usuário criado!");
    setForm({name:"",email:"",role:"manejo",password:""}); setEditId(null); refresh();
    setTimeout(()=>setMsg(""),2500);
  }

  function deleteUser(id){
    if(id==="admin001") return setMsg("Não é possível remover o administrador.");
    if(!confirm("Remover este usuário?")) return;
    saveUsers(getUsers().filter(u=>u.id!==id)); DB.deleteUser(id); refresh();
  }

  function startEdit(u){ setForm({name:u.name, email:u.email, role:u.role, password:""}); setEditId(u.id); setTab("form"); }

  return (
    React.createElement("div", { style:{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",backdropFilter:"blur(12px)",zIndex:300,display:"flex",flexDirection:"column"} },
      React.createElement("div", { style:{padding:"14px 18px",borderBottom:"1px solid rgba(255,255,255,0.08)",display:"flex",alignItems:"center",gap:12,background:"#060e1a"} },
        React.createElement("span", { style:{fontSize:22} }, "👥"),
        React.createElement("div", { style:{flex:1} },
          React.createElement("div", { style:{fontWeight:800,fontSize:17,color:"#fff"} }, "Gerenciar Usuários"),
          React.createElement("div", { style:{fontSize:11,color:"#5a7a9a"} }, "Administradores · Funcionários · Clientes")
        ),
        React.createElement("button", { onClick:onClose, style:{background:"none",border:"none",color:"#5a7a9a",cursor:"pointer",fontSize:22} }, "✕")
      ),
      React.createElement("div", { style:{display:"flex",gap:4,padding:"10px 14px",borderBottom:"1px solid rgba(255,255,255,0.08)",background:"#060e1a"} },
        ["list","form"].map(t=>
          React.createElement("button", { key:t, onClick:()=>{setTab(t);setEditId(null);setForm({name:"",email:"",role:"manejo",password:""}); },
            style:{padding:"7px 16px",borderRadius:8,border:"none",cursor:"pointer",fontFamily:"inherit",fontWeight:600,fontSize:13,
              background:tab===t?"#0ea5e9":"rgba(255,255,255,0.05)",color:tab===t?"#fff":"#5a7a9a"} },
            t==="list"?"👥 Usuários":"➕ "+(editId?"Editar":"Novo")
          )
        )
      ),
      React.createElement("div", { style:{flex:1,overflowY:"auto",padding:16} },
        msg && React.createElement("div", { style:{background:msg.startsWith("✅")?"rgba(34,197,94,0.1)":"rgba(239,68,68,0.1)",border:`1px solid ${msg.startsWith("✅")?"rgba(34,197,94,0.3)":"rgba(239,68,68,0.3)"}`,borderRadius:9,padding:"10px 14px",fontSize:13,color:msg.startsWith("✅")?"#4ade80":"#f87171",marginBottom:14} }, msg),
        tab==="list" && React.createElement("div", { style:{display:"flex",flexDirection:"column",gap:10} },
          users.map(u=>{
            const role = ROLES[u.role]||ROLES.manejo;
            return React.createElement("div", { key:u.id, style:{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:12,padding:"14px 16px",display:"flex",alignItems:"center",gap:12} },
              React.createElement("div", { style:{width:40,height:40,borderRadius:"50%",background:`${role.color}22`,border:`2px solid ${role.color}44`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0} },
                u.role==="admin"?"👑":u.role==="manejo"?"👷":u.role==="financeiro"?"💼":"🏢"
              ),
              React.createElement("div", { style:{flex:1} },
                React.createElement("div", { style:{fontWeight:700,fontSize:14,color:"#fff"} }, u.name),
                React.createElement("div", { style:{fontSize:12,color:"#5a7a9a",marginTop:2} }, u.email),
                React.createElement("span", { style:{fontSize:10,fontWeight:700,color:role.color,background:`${role.color}15`,padding:"2px 8px",borderRadius:10,marginTop:4,display:"inline-block"} }, role.label)
              ),
              u.id!=="admin001" && React.createElement("div", { style:{display:"flex",gap:8} },
                React.createElement("button", { onClick:()=>startEdit(u), style:{background:"rgba(14,165,233,0.1)",border:"1px solid rgba(14,165,233,0.2)",borderRadius:7,padding:"6px 12px",cursor:"pointer",color:"#0ea5e9",fontSize:12,fontFamily:"inherit"} }, "✏️ Editar"),
                React.createElement("button", { onClick:()=>deleteUser(u.id), style:{background:"rgba(239,68,68,0.1)",border:"1px solid rgba(239,68,68,0.2)",borderRadius:7,padding:"6px 12px",cursor:"pointer",color:"#f87171",fontSize:12,fontFamily:"inherit"} }, "✕")
              )
            );
          }),
          users.length===0 && React.createElement("div", { style:{textAlign:"center",color:"#5a7a9a",padding:30} }, "Nenhum usuário cadastrado.")
        ),
        tab==="form" && React.createElement("div", { style:{display:"flex",flexDirection:"column",gap:14,maxWidth:480} },
          React.createElement("div", { style:{fontSize:14,fontWeight:700,color:"#fff",marginBottom:4} }, editId?"Editar Usuário":"Novo Usuário"),
          [
            {label:"Nome completo", key:"name", type:"text", placeholder:"ex: João Silva"},
            {label:"E-mail", key:"email", type:"email", placeholder:"joao@email.com"},
            {label:"Senha", key:"password", type:"password", placeholder:editId?"Deixe vazio para manter":"Mínimo 6 caracteres"},
          ].map(f=>
            React.createElement("div", { key:f.key },
              React.createElement("label", { style:{fontSize:11,fontWeight:700,color:"#5a7a9a",textTransform:"uppercase",letterSpacing:".5px",display:"block",marginBottom:6} }, f.label),
              React.createElement("input", { type:f.type, placeholder:f.placeholder, value:form[f.key],
                onChange:e=>setForm(p=>({...p,[f.key]:e.target.value})),
                style:{width:"100%",padding:"11px 13px",background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.12)",borderRadius:9,color:"#fff",fontSize:14,fontFamily:"inherit",outline:"none",boxSizing:"border-box"} })
            )
          ),
          React.createElement("div", null,
            React.createElement("label", { style:{fontSize:11,fontWeight:700,color:"#5a7a9a",textTransform:"uppercase",letterSpacing:".5px",display:"block",marginBottom:6} }, "Perfil de Acesso"),
            React.createElement("select", { value:form.role, onChange:e=>setForm(p=>({...p,role:e.target.value})),
              style:{width:"100%",padding:"11px 13px",background:"#0d1829",border:"1px solid rgba(255,255,255,0.12)",borderRadius:9,color:"#fff",fontSize:14,fontFamily:"inherit",outline:"none",colorScheme:"dark"} },
              React.createElement("option", {value:"admin"}, "👑 Administrador — acesso total"),
              React.createElement("option", {value:"manejo"}, "👷 Manejo — O₂, ração, biometria, qualidade água"),
              React.createElement("option", {value:"financeiro"}, "💼 Financeiro — lança despesas, sem ver totais"),
              React.createElement("option", {value:"cliente"}, "🏢 Cliente (Fazenda) — acesso total à própria fazenda")
            )
          ),
          React.createElement("button", { onClick:saveUser,
            style:{padding:13,background:"linear-gradient(135deg,#0ea5e9,#0284c7)",border:"none",borderRadius:10,color:"#fff",fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"inherit"} },
            editId ? "✅ Salvar Alterações" : "✅ Criar Usuário"
          )
        )
      )
    )
  );
}


// ═══════════════════════════════════════════════════════════════════════════════
// MAIN APP — com sincronização por email
// ═══════════════════════════════════════════════════════════════════════════════
function App() {
    const [session, setSession] = (0, useState)(()=>getSession());
    const [showUserMgmt, setShowUserMgmt] = (0, useState)(false);
    const [tanks, setTanks] = (0, useState)([]);
    const [logs, setLogs] = (0, useState)({});
    const [expenses, setExpenses] = (0, useState)({});
    const [stock, setStock] = (0, useState)(() => load("aq_stock", { bags: 0, costPerBag: 100, history: [], minAlert: 20 }));
    const [cycles, setCycles] = (0, useState)(() => load("aq_cycles", {}));
    const [capex, setCapex] = (0, useState)([]);
    const [opexG, setOpexG] = (0, useState)([]);
    const [schedule, setSchedule] = (0, useState)(() => load("aq_sched", []));
    const [units, setUnits] = (0, useState)(() => load("aq_units", { area: "m2", depth: "m", weight: "g", feed: "sack", length: "cm" }));
    const [waterTimes, setWaterTimes] = (0, useState)(() => load("aq_water_times", ["06:00", "12:00", "18:00"]));
    const [page, setPage] = (0, useState)("dashboard");
    const [tankId, setTankId] = (0, useState)(null);
    const [showNewTank, setShowNewTank] = (0, useState)(false);
    const [showFinanceiro, setShowFinanceiro] = (0, useState)(false);
    const [showRelatorios, setShowRelatorios] = (0, useState)(false);
    const [showEditTank, setShowEditTank] = (0, useState)(false);
    const [showSettings, setShowSettings] = (0, useState)(false);
    const [showStockIn, setShowStockIn] = (0, useState)(false);
    const [activeDate, setActiveDate] = (0, useState)(today());
    const [notifPerm, setNotifPerm] = (0, useState)("default");

    // ── Carrega dados do Supabase filtrado pelo email do usuário logado ──────
    (0, useEffect)(function(){
        async function loadFromDB() {
            try {
                var userEmail = session ? session.email : null;
                if (!userEmail) return;
                await migrateLocalToSupabase(userEmail);
                var [dbTanks, dbLogs, dbExp, dbStock, dbCapex, dbOpex] = await Promise.all([
                    DB.getTanks(userEmail), DB.getLogs(userEmail), DB.getExpenses(userEmail),
                    DB.getStock(userEmail), DB.getCapex(userEmail), DB.getOpex(userEmail)
                ]);
                if (dbTanks && dbTanks.length > 0) setTanks(dbTanks);
                if (dbLogs && Object.keys(dbLogs).length > 0) setLogs(dbLogs);
                if (dbExp && Object.keys(dbExp).length > 0) setExpenses(dbExp);
                if (dbStock && dbStock.bags !== undefined) setStock(dbStock);
                if (dbCapex && dbCapex.length > 0) setCapex(dbCapex);
                if (dbOpex && dbOpex.length > 0) setOpexG(dbOpex);
            } catch(e) {
                console.warn("Load from DB failed, using local:", e);
            }
        }
        loadFromDB();
    }, [session]);

    (0, useEffect)(() => { save("aq_tanks", tanks); }, [tanks]);
    (0, useEffect)(() => { save("aq_logs", logs); }, [logs]);
    (0, useEffect)(() => { save("aq_exp", expenses); }, [expenses]);
    (0, useEffect)(() => { save("aq_stock", stock); }, [stock]);
    (0, useEffect)(() => { save("aq_cycles", cycles); }, [cycles]);
    (0, useEffect)(() => { save("aq_capex", capex); }, [capex]);
    (0, useEffect)(() => { save("aq_opex_g", opexG); }, [opexG]);
    (0, useEffect)(() => { save("aq_sched", schedule); }, [schedule]);
    (0, useEffect)(() => { save("aq_units", units); }, [units]);
    (0, useEffect)(() => { save("aq_water_times", waterTimes); }, [waterTimes]);

    (0, useEffect)(() => { if ("Notification" in window) setNotifPerm(Notification.permission); }, []);
    function requestNotif() { if ("Notification" in window) Notification.requestPermission().then(p => setNotifPerm(p)); }
    function notify(title, body) { if (notifPerm === "granted") new Notification(title, { body, icon: "/icon.png" }); }

    (0, useEffect)(() => {
        if (stock.bags <= stock.minAlert && stock.bags > 0) {
            notify("⚠️ Estoque Baixo", `Apenas ${stock.bags} sacos de ração restantes!`);
        }
    }, [stock.bags]);

    const activeTank = tanks.find(t => t.id === tankId);
    function openTank(id) { setTankId(id); setPage("tank"); }
    function goHome() { setPage("dashboard"); setTankId(null); }

    // ── CRUD com email do usuário logado ─────────────────────────────────────
    function addTank(t) { DB.saveTank(t, session.email); setTanks(p => [...p, t]); }
    function updateTank(t) { DB.saveTank(t, session.email); setTanks(p => p.map(x => x.id === t.id ? t : x)); }
    function deleteTank(id) { DB.deleteTank(id); setTanks(p => p.filter(x => x.id !== id)); }

    function updateDayLog(tankId, date, fields) {
        const newData = { ...((logs[tankId]?.[date]) || {}), ...fields };
        DB.saveLog(tankId, date, newData, session.email);
        setLogs(prev => ({
            ...prev,
            [tankId]: { ...(prev[tankId] || {}), [date]: newData }
        }));
    }

    function addExpense(tankId, exp) {
        const newList = [...(expenses[tankId] || []), exp];
        DB.saveExpenses(tankId, newList, session.email);
        setExpenses(prev => ({ ...prev, [tankId]: newList }));
    }

    function addStockIn(nf) {
        const bags = parseInt(nf.bags) || 0;
        const cpp = parseFloat(nf.costPerBag) || 0;
        setStock(prev => {
            const newStock = {
                ...prev,
                bags: prev.bags + bags,
                costPerBag: cpp,
                history: [...prev.history, {
                    ...nf, id: Math.random().toString(36).slice(2, 9),
                    type: "in", bags, costPerBag: cpp,
                    total: nf.totalValue || bags * cpp,
                    registeredAt: new Date().toISOString(),
                }]
            };
            DB.saveStock(newStock, session.email);
            return newStock;
        });
    }

    function consumeStock(bags, tankId, note) {
        setStock(prev => {
            const newStock = {
                ...prev,
                bags: Math.max(0, prev.bags - bags),
                history: [...prev.history, { date: today(), type: "out", bags, tankId, note }]
            };
            DB.saveStock(newStock, session.email);
            return newStock;
        });
    }

    // Salvar capex/opex com email
    function saveCapexWithEmail(data) { DB.saveCapex(data, session.email); setCapex(data); }
    function saveOpexWithEmail(data) { DB.saveOpex(data, session.email); setOpexG(data); }

    // Alerts
    const alerts = [];
    function getFCR(t) {
        const tl = logs[t.id] || {};
        const fed = Object.values(tl).reduce((s, d) => s + ((d.feedGivenKg || (parseFloat(d.feedGiven || 0) * 25))), 0) / 25;
        const initB = (t.initFishCount || t.fishCount || 0) * (t.initWeightG || t.avgWeightG || 0) / 1000;
        const curB = (t.fishCount || 0) * (t.avgWeightG || 0) / 1000;
        const gain = curB - initB;
        return gain > 0.1 ? (fed / gain) : null;
    }
    tanks.forEach(t => {
        var _a, _b;
        const sp = SP[t.species];
        const dl = ((_a = logs[t.id]) === null || _a === void 0 ? void 0 : _a[today()]) || {};
        const o2 = parseFloat(dl.o2 || 0);
        if (o2 > 0 && o2 < ((sp === null || sp === void 0 ? void 0 : sp.minO2) || 5)) alerts.push({ level: "danger", tank: t.name, msg: `O₂ crítico: ${o2} mg/L`, tankId: t.id });
        const lastBio = (_b = t.bioHistory) === null || _b === void 0 ? void 0 : _b[t.bioHistory.length - 1];
        if (lastBio) {
            const days = Math.floor((new Date() - new Date(lastBio.date)) / 86400000);
            if (days > 30) alerts.push({ level: "warn", tank: t.name, msg: `Biometria há ${days} dias`, tankId: t.id });
        } else { alerts.push({ level: "warn", tank: t.name, msg: "Nenhuma biometria registrada", tankId: t.id }); }
        if (!dl.o2) alerts.push({ level: "info", tank: t.name, msg: "O₂ não registrado hoje", tankId: t.id });
        const sp2 = SP[t.species];
        if (t.depth && sp2 && t.depth < sp2.minDepthM) alerts.push({ level: "warn", tank: t.name, msg: `Profundidade ${t.depth}m abaixo do mínimo`, tankId: t.id });
        if (t.depth && sp2 && t.depth > sp2.maxDepthM) alerts.push({ level: "warn", tank: t.name, msg: `Profundidade ${t.depth}m acima do ideal`, tankId: t.id });
        const fcrNow = getFCR(t);
        if (fcrNow !== null && fcrNow > (FCR_ALERT[t.species] || 3.0)) alerts.push({ level: "danger", tank: t.name, msg: `FCR ${fcrNow.toFixed(2)} — crítico!`, tankId: t.id });
        else if (fcrNow !== null && fcrNow > (FCR_META[t.species] || 2.5)) alerts.push({ level: "warn", tank: t.name, msg: `FCR ${fcrNow.toFixed(2)} — acima da meta`, tankId: t.id });
    });
    if (stock.bags <= stock.minAlert) alerts.push({ level: "danger", tank: "Estoque", msg: `Ração baixa: ${stock.bags} sacos restantes` });

    const ctx = {
        tanks, logs, expenses, stock, cycles, units, setUnits,
        addTank, updateTank, deleteTank, updateDayLog, addExpense,
        addStockIn, consumeStock, setCycles, setStock,
        activeTank, openTank, goHome, alerts, notify,
        capex, setCapex: saveCapexWithEmail, opexG, setOpexG: saveOpexWithEmail,
        schedule, setSchedule,
        activeDate, setActiveDate, notifPerm, requestNotif,
        waterTimes, setWaterTimes,
        session,
    };

    if (!session) {
        return React.createElement(LoginPage, { onLogin: function(s){ setSession(s); } });
    }
    var role = ROLES[session.role] || ROLES.admin;

    return (React.createElement(Ctx.Provider, { value: ctx },
        React.createElement("style", null, CSS),
        React.createElement(Nav, { page: page, goHome: goHome, session: session, role: role, onNewTank: () => setShowNewTank(true), onSettings: () => setShowSettings(true), onFinanceiro: () => setShowFinanceiro(true), onRelatorios: () => setShowRelatorios(true), alerts: alerts, onStockIn: () => setShowStockIn(true), stock: stock, onLogout: () => { saveSession(null); setSession(null); }, onUserMgmt: () => setShowUserMgmt(true) }),
        React.createElement("div", { style: { maxWidth: 1280, margin: "0 auto", padding: "14px 14px" } },
            page === "dashboard" && React.createElement(Dashboard, { onEdit: t => { setTankId(t.id); setShowEditTank(true); } }),
            page === "tank" && activeTank && (React.createElement(TankPage, { onEdit: () => setShowEditTank(true) }))),
        showNewTank && React.createElement(TankModal, { mode: "new", onClose: () => setShowNewTank(false) }),
        showEditTank && activeTank && React.createElement(TankModal, { mode: "edit", tank: activeTank, onClose: () => setShowEditTank(false) }),
        showSettings && React.createElement(SettingsModal, { onClose: () => setShowSettings(false) }),
        showStockIn && React.createElement(StockInModal, { onClose: () => setShowStockIn(false) }),
        showUserMgmt && React.createElement(UserManagementModal, { onClose:()=>setShowUserMgmt(false), currentUser:session }),
        showFinanceiro && React.createElement(FinanceiroModal, { onClose: () => setShowFinanceiro(false) }),
        showRelatorios && React.createElement(RelatoriosModal, { onClose: () => setShowRelatorios(false) })));
}

// ═══════════════════════════════════════════════════════════════════════════════
// NAV
// ═══════════════════════════════════════════════════════════════════════════════
function Nav({ page, goHome, onNewTank, onSettings, onFinanceiro, onRelatorios, alerts, onStockIn, stock, session, role, onLogout, onUserMgmt }) {
  var _role = role || ROLES.admin;
    const [open, setOpen] = (0, useState)(false);
    const dangerCount = alerts.filter(a => a.level === "danger").length;
    const warnCount = alerts.filter(a => a.level === "warn").length;
    function close(fn) { return () => { setOpen(false); fn && fn(); }; }
    return (React.createElement(React.Fragment, null,
        React.createElement("nav", { style: { height: "calc(52px + env(safe-area-inset-top, 20px))", paddingTop: "max(env(safe-area-inset-top, 20px), 12px)", padding: "0 14px", paddingLeft: 14, paddingRight: 14, borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10, background: "rgba(6,14,26,0.97)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", position: "sticky", top: 0, zIndex: 150 } },
            React.createElement("button", { className: "hamburger", onClick: () => setOpen(o => !o), "aria-label": "Menu" },
                React.createElement("span", { style: { transform: open ? "rotate(45deg) translate(5px,5px)" : "none" } }),
                React.createElement("span", { style: { opacity: open ? 0 : 1 } }),
                React.createElement("span", { style: { transform: open ? "rotate(-45deg) translate(5px,-5px)" : "none" } })),
            React.createElement("button", { onClick: close(goHome), style: { background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 7, flex: 1 } },
                React.createElement("img", { src: "/icon.png", style: { width: 30, height: 30, objectFit: "cover", borderRadius: 6 } }),
                React.createElement("span", { style: { fontWeight: 800, fontSize: 16, color: "var(--text)", letterSpacing: "-0.5px" } }, "AquaGest\u00E3o")),
            dangerCount > 0 && (React.createElement("div", { className: "pulse badge", style: { background: "rgba(239,68,68,0.15)", color: "#f87171", border: "1px solid rgba(239,68,68,0.3)", fontSize: 10 } }, "\uD83D\uDD34 ", dangerCount)),
            React.createElement("div", { style: { background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)", borderRadius: 8, padding: "4px 9px", fontSize: 11, fontWeight: 700, color: "#4ade80", fontFamily: "var(--mono)", whiteSpace: "nowrap" } }, "\uD83D\uDCE6 ", stock.bags)),
        open && (React.createElement("div", { className: "mob-menu slide", onClick: () => setOpen(false) },
            React.createElement("div", { onClick: e => e.stopPropagation(), style: { display: "flex", flexDirection: "column", gap: 6 } },
                React.createElement("div", { className: "mob-section" }, "Navega\u00E7\u00E3o"),
                React.createElement("div", { className: "mob-item", onClick: close(goHome) },
                    React.createElement("span", { style: { fontSize: 22 } }, "\uD83C\uDFE0"),
                    React.createElement("div", null, React.createElement("div", null, "In\u00EDcio"), React.createElement("div", { style: { fontSize: 11, color: "var(--muted)", fontWeight: 400 } }, "Vis\u00E3o geral dos tanques"))),
                page === "tank" && (React.createElement("div", { className: "mob-item", onClick: close(goHome) },
                    React.createElement("span", { style: { fontSize: 22 } }, "\u2190 "),
                    React.createElement("div", null, React.createElement("div", null, "Voltar"), React.createElement("div", { style: { fontSize: 11, color: "var(--muted)", fontWeight: 400 } }, "Dashboard principal")))),
                React.createElement("div", { className: "mob-divider" }),
                React.createElement("div", { className: "mob-section" }, "A\u00E7\u00F5es"),
                _role.canEditTanks && React.createElement("div", { className: "mob-item", onClick: close(onNewTank) },
                    React.createElement("span", { style: { fontSize: 22 } }, "\u2795"),
                    React.createElement("div", null, React.createElement("div", null, "Novo Tanque"), React.createElement("div", { style: { fontSize: 11, color: "var(--muted)", fontWeight: 400 } }, "Cadastrar tanque de cria\u00E7\u00E3o"))),
                _role.canManageStock && React.createElement("div", { className: "mob-item", onClick: close(onStockIn) },
                    React.createElement("span", { style: { fontSize: 22 } }, "\uD83D\uDCE5"),
                    React.createElement("div", null, React.createElement("div", null, "Entrada de Ra\u00E7\u00E3o"), React.createElement("div", { style: { fontSize: 11, color: "var(--muted)", fontWeight: 400 } }, "Estoque atual: ", stock.bags, " sacos"))),
                React.createElement("div", { className: "mob-divider" }),
                React.createElement("div", { className: "mob-section" }, "Sistema"),
                (_role.canViewFinance||_role.canRegisterExpense) && React.createElement("div", { className: "mob-item", onClick: close(onFinanceiro) },
                    React.createElement("span", { style: { fontSize: 22 } }, "\uD83D\uDCB0"),
                    React.createElement("div", null, React.createElement("div", null, "Financeiro"), React.createElement("div", { style: { fontSize: 11, color: "var(--muted)", fontWeight: 400 } }, "CAPEX \u00B7 OPEX \u00B7 Cronograma"))),
                _role.canViewReports && React.createElement("div", { className: "mob-item", onClick: close(onRelatorios) },
                    React.createElement("span", { style: { fontSize: 22 } }, "\uD83D\uDCCB"),
                    React.createElement("div", null, React.createElement("div", null, "Relat\u00F3rios"), React.createElement("div", { style: { fontSize: 11, color: "var(--muted)", fontWeight: 400 } }, "Manejo por tanque \u00B7 Opera\u00E7\u00E3o completa"))),
                React.createElement("div", { className: "mob-item", onClick: close(onSettings) },
                    React.createElement("span", { style: { fontSize: 22 } }, "\u2699\uFE0F"),
                    React.createElement("div", null, React.createElement("div", null, "Configura\u00E7\u00F5es"), React.createElement("div", { style: { fontSize: 11, color: "var(--muted)", fontWeight: 400 } }, "Unidades, notifica\u00E7\u00F5es"))),
                React.createElement("div", { className: "mob-divider" }),
                React.createElement("div", { className: "mob-section" }, "Conta"),
                React.createElement("div", { className: "mob-item" },
                    React.createElement("span", { style: { fontSize: 22 } }, "\uD83D\uDC64"),
                    React.createElement("div", null,
                        React.createElement("div", null, (session&&session.name)||'Usuário'),
                        React.createElement("div", { style: { fontSize: 11, color: "var(--muted)", fontWeight: 400 } }, (ROLES[(session&&session.role)||'admin'] || ROLES.manejo).label))),
                (_role.canManageUsers || (session && session.role === "admin")) && React.createElement("div", { className: "mob-item", onClick: (e) => { e.stopPropagation(); setOpen(false); if(onUserMgmt) onUserMgmt(); } },
                    React.createElement("span", { style: { fontSize: 22 } }, "\uD83D\uDC65"),
                    React.createElement("div", null, React.createElement("div", null, "Gerenciar Usu\u00E1rios"), React.createElement("div", { style: { fontSize: 11, color: "var(--muted)", fontWeight: 400 } }, "Criar e editar acessos"))),
                React.createElement("div", { className: "mob-item", style: { borderColor: "rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.06)" }, onClick: (e) => { e.stopPropagation(); setOpen(false); if(onLogout) onLogout(); } },
                    React.createElement("span", { style: { fontSize: 22 } }, "\uD83D\uDEAA"),
                    React.createElement("div", null, React.createElement("div", { style: { color: "#f87171" } }, "Sair"), React.createElement("div", { style: { fontSize: 11, color: "var(--muted)", fontWeight: 400 } }, "Encerrar sess\u00E3o"))),
                (dangerCount + warnCount) > 0 && (React.createElement("div", { className: "mob-item", style: { borderColor: "rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.06)" } },
                    React.createElement("span", { style: { fontSize: 22 } }, "\uD83D\uDD14"),
                    React.createElement("div", null,
                        React.createElement("div", { style: { color: "#f87171" } }, "Alertas Ativos"),
                        React.createElement("div", { style: { fontSize: 11, color: "var(--muted)", fontWeight: 400 } }, dangerCount, " cr\u00EDtico", dangerCount !== 1 ? "s" : "", " \u00B7 ", warnCount, " aviso", warnCount !== 1 ? "s" : "")))))))));
}

// ═══════════════════════════════════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════════
function Dashboard({ onEdit }) {
    const { tanks, logs, alerts, stock, expenses, units, openTank } = useApp();
    const [activeTab, setActiveTab] = (0, useState)("tanques");
    const totalFish = tanks.reduce((s, t) => s + (t.fishCount || 0), 0);
    const totalBiomass = tanks.reduce((s, t) => s + ((t.fishCount || 0) * (t.avgWeightG || 0) / 1000), 0);
    const totalExpAll = Object.values(expenses).flat().reduce((s, e) => s + (e.amount || 0), 0);
    const tankRanking = tanks.map(t => {
        const tl = logs[t.id] || {};
        const fed = Object.values(tl).reduce((s, d) => s + ((d.feedGivenKg || parseFloat(d.feedGiven || 0) * 25)), 0) / 25;
        const initB = (t.initFishCount || t.fishCount || 0) * (t.initWeightG || t.avgWeightG || 0) / 1000;
        const curB = (t.fishCount || 0) * (t.avgWeightG || 0) / 1000;
        const gain = curB - initB;
        const fcr = gain > 0.1 ? (fed / gain).toFixed(2) : "—";
        const phase = getPhase(t.species, t.avgWeightG || 0);
        const biomassKg = (t.fishCount || 0) * (t.avgWeightG || 0) / 1000;
        const dailyFeed = biomassKg * ((phase === null || phase === void 0 ? void 0 : phase.pct) || 0);
        return { ...t, fcr, fedKg: fed, biomassKg, dailyFeedKg: dailyFeed };
    }).sort((a, b) => a.fcr === "—" ? 1 : b.fcr === "—" ? -1 : parseFloat(a.fcr) - parseFloat(b.fcr));
    const tabs = [
        { id: "tanques", label: "🏊 Tanques" },
        { id: "alertas", label: `🔔 Alertas (${alerts.length})` },
        { id: "ranking", label: "🏆 Ranking FCR" },
        { id: "feedtable", label: "📚 Educativo" },
        { id: "estoque", label: "📦 Estoque" },
    ];
    return (React.createElement("div", { className: "slide page-content" },
        React.createElement("div", { style: { marginBottom: 14 } },
            React.createElement("h1", { style: { fontWeight: 800, fontSize: 20, letterSpacing: "-0.5px", marginBottom: 2 } }, "Vis\u00E3o Geral"),
            React.createElement("p", { style: { color: "var(--muted)", fontSize: 12 } }, tanks.length, " tanque", tanks.length !== 1 ? "s" : "", " em produ\u00E7\u00E3o \u00B7 ", today())),
        React.createElement("div", { className: "kpi-row", style: { marginBottom: 16 } }, [
            { ico: "__LOGO__", val: totalFish.toLocaleString("pt-BR"), lbl: "Peixes" },
            { ico: "⚖️", val: `${totalBiomass.toFixed(1)} kg`, lbl: "Biomassa" },
            { ico: "📦", val: `${stock.bags} sacos`, lbl: "Estoque", warn: stock.bags <= stock.minAlert },
            { ico: "💸", val: fmtBRL(totalExpAll), lbl: "Gastos" },
        ].map(k => (React.createElement("div", { key: k.lbl, className: "kpi-chip", style: { borderColor: k.warn ? "rgba(239,68,68,0.4)" : "var(--border)" } },
            k.ico === "__LOGO__" ? React.createElement("img", { src: "/icon.png", style: { width: 22, height: 22, objectFit: "cover", borderRadius: 4, display: "inline-block" } }) : React.createElement("div", { style: { fontSize: 18 } }, k.ico),
            React.createElement("div", { className: "val", style: { color: k.warn ? "var(--red)" : "var(--text)" } }, k.val),
            React.createElement("div", { className: "lbl" }, k.lbl))))),
        React.createElement("div", { className: "bottom-bar" }, tabs.map(t => {
            const icons = { "tanques": "🏊", "alertas": "🔔", "ranking": "🏆", "feedtable": "📚", "estoque": "📦" };
            const labels = { "tanques": "Tanques", "alertas": "Alertas", "ranking": "Ranking", "feedtable": "Guia", "estoque": "Estoque" };
            return (React.createElement("button", { key: t.id, className: `bottom-tab ${activeTab === t.id ? "active" : ""}`, onClick: () => setActiveTab(t.id) },
                React.createElement("span", { className: "ico" }, icons[t.id]),
                React.createElement("span", null, labels[t.id], t.id === "alertas" && alerts.length > 0 ? ` (${alerts.length})` : "")));
        })),
        activeTab === "tanques" && (React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 14 } },
            tanks.length === 0 ? (React.createElement("div", { style: { gridColumn: "1/-1", textAlign: "center", padding: "60px 20px", color: "var(--muted)" } },
                React.createElement("div", { style: { fontSize: 52, marginBottom: 12 } }, "\uD83C\uDF0A"),
                React.createElement("p", { style: { fontSize: 15 } }, "Nenhum tanque. Clique em ", React.createElement("strong", { style: { color: "var(--accent)" } }, "+ Novo Tanque")))) :
            tankRanking.map(t => (React.createElement(TankCard, { key: t.id, tank: t, onOpen: () => openTank(t.id), onEdit: () => onEdit(t) }))))),
        activeTab === "alertas" && React.createElement(AlertsPanel, null),
        activeTab === "ranking" && React.createElement(RankingPanel, { ranking: tankRanking }),
        activeTab === "feedtable" && React.createElement(FeedTablePanel, null),
        activeTab === "estoque" && React.createElement(StockPanel, null)));
}

function TankCard({ tank, onOpen, onEdit }) {
    var _a, _b;
    const { logs } = useApp();
    const sp = SP[tank.species];
    const dl = ((_a = logs[tank.id]) === null || _a === void 0 ? void 0 : _a[today()]) || {};
    const o2 = parseFloat(dl.o2 || 0);
    const phase = getPhase(tank.species, tank.avgWeightG || 0);
    const shouldFeed = o2 === 0 || o2 >= ((sp === null || sp === void 0 ? void 0 : sp.minO2) || 5);
    const o2Color = o2 === 0 ? "var(--muted)" : o2 >= ((sp === null || sp === void 0 ? void 0 : sp.idealO2) || 7) ? "var(--green)" : o2 >= ((sp === null || sp === void 0 ? void 0 : sp.minO2) || 5) ? "var(--yellow)" : "var(--red)";
    return (React.createElement("div", { className: "card", style: { padding: 18, cursor: "pointer", transition: "border-color .2s,transform .15s" }, onMouseEnter: e => { e.currentTarget.style.borderColor = sp === null || sp === void 0 ? void 0 : sp.color; e.currentTarget.style.transform = "translateY(-2px)"; }, onMouseLeave: e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.transform = "none"; } },
        React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 } },
            React.createElement("div", { onClick: onOpen, style: { flex: 1 } },
                React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, marginBottom: 6 } },
                    React.createElement("span", { style: { fontSize: 18 } }, sp === null || sp === void 0 ? void 0 : sp.icon),
                    React.createElement("span", { style: { fontWeight: 700, fontSize: 15 } }, tank.name)),
                React.createElement("div", { style: { display: "flex", gap: 6, flexWrap: "wrap" } },
                    React.createElement("span", { className: "badge", style: { background: (sp === null || sp === void 0 ? void 0 : sp.color) + "22", color: sp === null || sp === void 0 ? void 0 : sp.color, border: `1px solid ${sp === null || sp === void 0 ? void 0 : sp.color}44` } }, sp === null || sp === void 0 ? void 0 : sp.name),
                    React.createElement("span", { className: "badge", style: { background: "rgba(255,255,255,0.05)", color: "var(--muted)", border: "1px solid var(--border2)" } }, phase === null || phase === void 0 ? void 0 : phase.name))),
            React.createElement("button", { onClick: e => { e.stopPropagation(); onEdit(); }, className: "btn btn-g", style: { fontSize: 11, padding: "5px 10px" } }, "\u270F\uFE0F Editar")),
        React.createElement("div", { onClick: onOpen, style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 } }, [
            { l: "Peixes", v: (tank.fishCount || 0).toLocaleString("pt-BR") },
            { l: "Peso Méd.", v: `${tank.avgWeightG || 0}g` },
            { l: "Biomassa", v: `${((_b = tank.biomassKg) === null || _b === void 0 ? void 0 : _b.toFixed(1)) || "0"} kg` },
            { l: "Ração/Dia", v: sacosLabel(tank.dailyFeedKg || 0) },
        ].map(i => (React.createElement("div", { key: i.l, style: { background: "rgba(255,255,255,0.025)", borderRadius: 8, padding: "8px 10px" } },
            React.createElement("div", { style: { fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".4px", fontWeight: 600 } }, i.l),
            React.createElement("div", { style: { fontSize: 13, fontWeight: 600, marginTop: 2, fontFamily: "var(--mono)" } }, i.v))))),
        React.createElement("div", { onClick: onOpen, style: { display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 10, borderTop: "1px solid var(--border)" } },
            React.createElement("span", { style: { fontSize: 12, color: o2Color, fontFamily: "var(--mono)" } }, "O\u2082: ", o2 || "—", " mg/L"),
            React.createElement("span", { style: { fontSize: 12, fontWeight: 700, color: shouldFeed ? "var(--green)" : "var(--red)" } }, o2 === 0 ? "⚪ Reg. O₂" : shouldFeed ? "✅ Alimentar" : "🚫 Não Alimentar")),
        (() => {
            const ds = depthStatus(tank.depth || 1.5);
            const cap = calcCapacity(tank.species, tank.areaM2, tank.depth || 1.5);
            return (React.createElement("div", { onClick: onOpen, style: { marginTop: 7, display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11 } },
                React.createElement("span", { style: { color: ds.color } }, ds.label, " (", tank.depth || 1.5, "m)"),
                React.createElement("span", { style: { color: "var(--muted)", fontFamily: "var(--mono)" } }, "cap. ", cap.ideal.toLocaleString("pt-BR"), " peixes")));
        })()));
}

function AlertsPanel() {
    const { alerts, openTank, notifPerm, requestNotif } = useApp();
    const colors = { danger: ["rgba(239,68,68,0.12)", "#f87171", "rgba(239,68,68,0.3)"], warn: ["rgba(245,158,11,0.12)", "#fbbf24", "rgba(245,158,11,0.3)"], info: ["rgba(14,165,233,0.08)", "#38bdf8", "rgba(14,165,233,0.2)"] };
    return (React.createElement("div", { className: "card", style: { padding: 20 } },
        React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 } },
            React.createElement("div", { className: "section-hdr", style: { margin: 0 } }, "Central de Alertas"),
            notifPerm !== "granted" && (React.createElement("button", { className: "btn btn-g", style: { fontSize: 11 }, onClick: requestNotif }, "\uD83D\uDD14 Ativar Notifica\u00E7\u00F5es"))),
        alerts.length === 0 ? (React.createElement("div", { style: { textAlign: "center", padding: 30, color: "var(--muted)" } }, "\u2705 Nenhum alerta ativo")) :
        alerts.map((a, i) => {
            const [bg, clr, br] = colors[a.level] || colors.info;
            return (React.createElement("div", { key: i, className: "alert-bar", style: { background: bg, border: `1px solid ${br}`, color: clr, marginBottom: 8, cursor: a.tankId ? "pointer" : "default" }, onClick: () => a.tankId && openTank(a.tankId) },
                React.createElement("span", null, a.level === "danger" ? "🔴" : a.level === "warn" ? "🟡" : "🔵"),
                React.createElement("strong", null, "[", a.tank, "]"),
                React.createElement("span", { style: { flex: 1 } }, a.msg),
                a.tankId && React.createElement("span", { style: { fontSize: 11, opacity: .7 } }, "Ver tanque \u2192")));
        })));
}

function RankingPanel({ ranking }) {
    return (React.createElement("div", { className: "card", style: { padding: 20 } },
        React.createElement("div", { className: "section-hdr" }, "Ranking por Convers\u00E3o Alimentar (FCR)"),
        React.createElement("p", { style: { fontSize: 12, color: "var(--muted)", marginBottom: 14 } }, "Menor FCR = melhor convers\u00E3o."),
        React.createElement("table", null,
            React.createElement("thead", null,
                React.createElement("tr", null,
                    React.createElement("th", null, "#"), React.createElement("th", null, "Tanque"), React.createElement("th", null, "Esp\u00E9cie"),
                    React.createElement("th", null, "Fase"), React.createElement("th", null, "FCR Real"), React.createElement("th", null, "FCR Ideal"),
                    React.createElement("th", null, "Biomassa"), React.createElement("th", null, "Ra\u00E7\u00E3o Total"))),
            React.createElement("tbody", null, ranking.map((t, i) => {
                var _a;
                const sp = SP[t.species];
                const phase = getPhase(t.species, t.avgWeightG || 0);
                const fcr = parseFloat(t.fcr);
                const ok = !isNaN(fcr) && fcr <= (FCR_META[t.species] || 2.5);
                const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}`;
                return (React.createElement("tr", { key: t.id },
                    React.createElement("td", null, medal),
                    React.createElement("td", null, React.createElement("strong", null, t.name)),
                    React.createElement("td", null, sp === null || sp === void 0 ? void 0 : sp.icon, " ", sp === null || sp === void 0 ? void 0 : sp.name),
                    React.createElement("td", null, React.createElement("span", { className: "badge", style: { background: (sp === null || sp === void 0 ? void 0 : sp.color) + "22", color: sp === null || sp === void 0 ? void 0 : sp.color } }, phase === null || phase === void 0 ? void 0 : phase.name)),
                    React.createElement("td", { style: { fontFamily: "var(--mono)", color: ok ? "var(--green)" : "var(--red)", fontWeight: 700 } }, t.fcr),
                    React.createElement("td", { style: { fontFamily: "var(--mono)", color: "var(--muted)" } }, FCR_META[t.species]),
                    React.createElement("td", { style: { fontFamily: "var(--mono)" } }, (_a = t.biomassKg) === null || _a === void 0 ? void 0 : _a.toFixed(1), " kg"),
                    React.createElement("td", { style: { fontFamily: "var(--mono)" } }, sacos(t.fedKg || 0), " sacos")));
            })))));
}


// ═══════════════════════════════════════════════════════════════════════════════
// FEED TABLE, STOCK PANEL, TANK PAGE — componentes sem alteração de lógica
// Carregados do código original sem modificação
// ═══════════════════════════════════════════════════════════════════════════════

function FeedTablePanel() {
    const [sp, setSp] = (0, useState)("matrinxa");
    const [section, setSection] = (0, useState)("racao");
    const species = SP[sp];
    const sections = [
        { id: "racao", label: "🍽️ Arraçoamento" },
        { id: "agua", label: "💧 Qualidade da Água" },
        { id: "fcr", label: "📊 Conversão (FCR)" },
        { id: "densidade", label: "📐 Densidade & Volume" },
    ];
    return (React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 14 } },
        React.createElement("div", { className: "card", style: { padding: 18 } },
            React.createElement("div", { style: { marginBottom: 14 } },
                React.createElement("h2", { style: { fontWeight: 800, fontSize: 18, letterSpacing: "-0.5px", marginBottom: 4 } }, "\uD83D\uDCDA Guia Educativo de Piscicultura"),
                React.createElement("p", { style: { fontSize: 12, color: "var(--muted)" } }, "Tabelas de refer\u00EAncia t\u00E9cnica por esp\u00E9cie")),
            React.createElement("div", { style: { display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 } },
                Object.entries(SP).map(([k, v]) => (React.createElement("button", { key: k, onClick: () => setSp(k),
                    style: { padding: "8px 16px", borderRadius: 10, cursor: "pointer", fontFamily: "var(--font)", fontWeight: 700, fontSize: 13,
                        background: sp === k ? v.color : "rgba(255,255,255,0.05)", border: sp === k ? "none" : "1px solid var(--border2)",
                        color: sp === k ? "#fff" : "var(--muted)", transition: "all .2s" } }, v.icon, " ", v.name)))),
            React.createElement("div", { style: { display: "flex", gap: 6, flexWrap: "wrap" } },
                sections.map(s => (React.createElement("button", { key: s.id, className: `tab-btn ${section === s.id ? "active" : ""}`, style: { fontSize: 12 }, onClick: () => setSection(s.id) }, s.label))))),
        section === "racao" && React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 12 } },
            React.createElement("div", { className: "card", style: { padding: 16, background: `${species.color}08`, borderColor: `${species.color}33` } },
                React.createElement("div", { style: { fontSize: 13, fontWeight: 700, color: species.color, marginBottom: 6 } }, species.icon, " ", species.name, " \u2014 Tabela de Arra\u00E7oamento"),
                React.createElement("div", { style: { fontSize: 12, color: "var(--muted)" } }, "FCR meta: ", React.createElement("strong", { style: { color: "var(--text)" } }, FCR_META[sp]))),
            species.phases.map((phase, i) => {
                const row = species.feedTable[i];
                return (React.createElement("div", { key: i, className: "card", style: { padding: 18, borderLeft: `4px solid ${species.color}` } },
                    React.createElement("div", { style: { fontWeight: 800, fontSize: 16, color: species.color, marginBottom: 4 } }, phase.name),
                    React.createElement("div", { style: { fontSize: 12, color: "var(--muted)", fontFamily: "var(--mono)", marginBottom: 12 } }, row === null || row === void 0 ? void 0 : row.range),
                    React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 } }, [
                        { l: "% Arraçoamento", v: row === null || row === void 0 ? void 0 : row.pct },
                        { l: "Frequência", v: row === null || row === void 0 ? void 0 : row.freq },
                        { l: "FCR esperado", v: row === null || row === void 0 ? void 0 : row.fcr },
                        { l: "Proteína", v: `${phase.protPct}%` },
                        { l: "Tipo ração", v: row === null || row === void 0 ? void 0 : row.obs },
                    ].map(s => (React.createElement("div", { key: s.l, style: { background: "rgba(255,255,255,0.03)", borderRadius: 9, padding: "10px 12px" } },
                        React.createElement("div", { style: { fontSize: 10, color: "var(--muted)", textTransform: "uppercase", fontWeight: 600, marginBottom: 4 } }, s.l),
                        React.createElement("div", { style: { fontFamily: "var(--mono)", fontSize: 14, fontWeight: 700 } }, s.v)))))));
            })),
        section === "agua" && React.createElement("div", { className: "card", style: { padding: 18 } },
            React.createElement("div", { style: { fontSize: 13, fontWeight: 700, color: "#0ea5e9", marginBottom: 14 } }, species.icon, " ", species.name, " \u2014 Par\u00E2metros de \u00C1gua"),
            React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 10 } }, [
                { l: "O₂ Mínimo", v: `${species.minO2} mg/L`, status: "danger" },
                { l: "O₂ Ideal", v: `${species.idealO2} mg/L`, status: "ok" },
                { l: "Temp. Mínima", v: `${species.minTemp}°C`, status: "warn" },
                { l: "Temp. Ideal", v: `${species.idealTemp}°C`, status: "ok" },
                { l: "Temp. Máxima", v: `${species.maxTemp}°C`, status: "warn" },
                { l: "pH", v: `${species.phMin}–${species.phMax}`, status: "ok" },
            ].map(p => {
                const sc = { ok: "var(--green)", warn: "var(--yellow)", danger: "var(--red)" };
                return (React.createElement("div", { key: p.l, style: { background: "rgba(255,255,255,0.025)", borderRadius: 10, padding: "12px 14px", borderLeft: `3px solid ${sc[p.status]}` } },
                    React.createElement("div", { style: { fontSize: 12, color: "var(--muted)" } }, p.l),
                    React.createElement("div", { style: { fontFamily: "var(--mono)", fontWeight: 700, fontSize: 14, color: sc[p.status], marginTop: 4 } }, p.v)));
            }))),
        section === "fcr" && React.createElement("div", { className: "card", style: { padding: 18 } },
            React.createElement("div", { style: { fontSize: 13, fontWeight: 700, marginBottom: 12 } }, "\uD83C\uDFC6 FCR \u2014 ", species.name),
            [
                { range: "< 2,0", label: "Excelente", color: "#22c55e" },
                { range: "2,0 – 2,5", label: "✦ Meta", color: "#22c55e" },
                { range: "2,5 – 3,0", label: "Aceitável", color: "#f59e0b" },
                { range: "> 3,0", label: "Crítico", color: "var(--red)" },
            ].map(r => (React.createElement("div", { key: r.range, style: { display: "flex", justifyContent: "space-between", padding: "9px 0", borderBottom: "1px solid var(--border)" } },
                React.createElement("span", { style: { fontFamily: "var(--mono)", fontSize: 13 } }, r.range),
                React.createElement("span", { style: { fontWeight: 700, color: r.color } }, r.label))))),
        section === "densidade" && React.createElement("div", { className: "card", style: { padding: 18 } },
            React.createElement("div", { style: { fontSize: 13, fontWeight: 700, color: species.color, marginBottom: 14 } }, species.icon, " ", species.name, " \u2014 Densidade"),
            React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 10 } }, [
                { l: "Densidade máx.", v: `${species.densityPerM2} peixe/m²` },
                { l: "Biomassa máx.", v: `${species.kgPerM3} kg/m³` },
                { l: "Profundidade mín.", v: `${species.minDepthM} m` },
                { l: "Profundidade ideal", v: `${species.idealDepthM} m` },
            ].map(i => (React.createElement("div", { key: i.l, style: { background: "rgba(255,255,255,0.025)", borderRadius: 9, padding: "11px 13px" } },
                React.createElement("div", { style: { fontSize: 11, color: "var(--muted)", fontWeight: 600, marginBottom: 4 } }, i.l),
                React.createElement("div", { style: { fontFamily: "var(--mono)", fontSize: 15, fontWeight: 700, color: species.color } }, i.v)))))));
}

function StockPanel() {
    const { stock, setStock } = useApp();
    return (React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 14 } },
        React.createElement("div", { className: "grid2" },
            React.createElement("div", { className: "card", style: { padding: 18 } },
                React.createElement("div", { className: "section-hdr" }, "\uD83D\uDCE6 Saldo Atual"),
                React.createElement("div", { style: { fontFamily: "var(--mono)", fontSize: 28, fontWeight: 700, color: stock.bags <= stock.minAlert ? "var(--red)" : "var(--green)", marginBottom: 4 } }, stock.bags, " sacos"),
                React.createElement("div", { style: { fontSize: 13, color: "var(--muted)", marginBottom: 14 } }, (stock.bags * 25).toFixed(0), " kg \u00B7 ", fmtBRL(stock.bags * stock.costPerBag)),
                React.createElement("div", { style: { fontSize: 12, color: "var(--muted)" } }, "Custo m\u00E9dio/saco: ", React.createElement("strong", { style: { color: "var(--text)" } }, fmtBRL(stock.costPerBag))),
                React.createElement("div", { style: { marginTop: 12, display: "flex", alignItems: "center", gap: 10 } },
                    React.createElement("span", { style: { fontSize: 12, color: "var(--muted)" } }, "Alerta m\u00EDnimo:"),
                    React.createElement("input", { className: "inp", type: "number", style: { width: 80 }, value: stock.minAlert, onChange: e => setStock(p => ({ ...p, minAlert: parseInt(e.target.value) || 0 })) }),
                    React.createElement("span", { style: { fontSize: 12, color: "var(--muted)" } }, "sacos")),
                stock.bags <= stock.minAlert && (React.createElement("div", { className: "alert-bar pulse", style: { background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)", color: "#f87171", marginTop: 12 } }, "\uD83D\uDEA8 Estoque abaixo do m\u00EDnimo!"))),
            React.createElement("div", { className: "card", style: { padding: 18 } },
                React.createElement("div", { className: "section-hdr" }, "\uD83D\uDCCA Consumo por Tanque"),
                (() => {
                    const byTank = {};
                    stock.history.filter(h => h.type === "out").forEach(h => { byTank[h.tankId || "geral"] = (byTank[h.tankId || "geral"] || 0) + h.bags; });
                    return Object.entries(byTank).length === 0 ?
                        React.createElement("p", { style: { color: "var(--muted)", fontSize: 13 } }, "Nenhum consumo registrado.") :
                        Object.entries(byTank).map(([tid, bags]) => (
                            React.createElement("div", { key: tid, style: { display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--border)", fontSize: 13 } },
                                React.createElement("span", { style: { color: "var(--muted)" } }, tid === "geral" ? "Geral" : tid),
                                React.createElement("span", { style: { fontFamily: "var(--mono)", fontWeight: 600 } }, bags, " sacos"))));
                })())),
        React.createElement("div", { className: "card", style: { padding: 18 } },
            React.createElement("div", { className: "section-hdr" }, "\uD83D\uDCCB Hist\u00F3rico"),
            React.createElement("table", null,
                React.createElement("thead", null,
                    React.createElement("tr", null,
                        React.createElement("th", null, "Data"), React.createElement("th", null, "Tipo"), React.createElement("th", null, "Fornecedor"),
                        React.createElement("th", null, "Sacos"), React.createElement("th", null, "R$/saco"), React.createElement("th", null, "Total"))),
                React.createElement("tbody", null,
                    [...stock.history].reverse().slice(0, 50).map((h, i) => (React.createElement("tr", { key: i },
                        React.createElement("td", { style: { fontFamily: "var(--mono)", fontSize: 12 } }, h.date),
                        React.createElement("td", null, React.createElement("span", { className: "badge", style: { background: h.type === "in" ? "rgba(34,197,94,0.12)" : "rgba(245,158,11,0.12)", color: h.type === "in" ? "var(--green)" : "var(--yellow)", fontSize: 10 } }, h.type === "in" ? "📥 Entrada" : "📤 Saída")),
                        React.createElement("td", { style: { fontSize: 12 } }, h.supplier || h.note || "—"),
                        React.createElement("td", { style: { fontFamily: "var(--mono)", fontWeight: 600 } }, h.bags),
                        React.createElement("td", { style: { fontFamily: "var(--mono)", fontSize: 12 } }, h.costPerBag ? fmtBRL(h.costPerBag) : "—"),
                        React.createElement("td", { style: { fontFamily: "var(--mono)", fontWeight: 600, color: "var(--green)" } }, h.total ? fmtBRL(h.total) : "—")))),
                    stock.history.length === 0 && React.createElement("tr", null, React.createElement("td", { colSpan: 6, style: { textAlign: "center", color: "var(--muted)", padding: 20 } }, "Nenhuma movimenta\u00E7\u00E3o")))))));
}


// ═══════════════════════════════════════════════════════════════════════════════
// TANK PAGE
// ═══════════════════════════════════════════════════════════════════════════════
function TankPage({ onEdit }) {
    var _a;
    const { activeTank: tank, logs } = useApp();
    const [tab, setTab] = (0, useState)("daily");
    const sp = SP[tank.species];
    const phase = getPhase(tank.species, tank.avgWeightG || 0);
    const biomassKg = ((tank.fishCount || 0) * (tank.avgWeightG || 0)) / 1000;
    const dailyFeedKg = biomassKg * ((phase === null || phase === void 0 ? void 0 : phase.pct) || 0);
    const tl = logs[tank.id] || {};
    const dl = tl[today()] || {};
    const readings = dl.readings || [];
    const lastReading = [...readings].reverse().find(r => parseFloat(r.o2) > 0);
    const o2 = lastReading ? parseFloat(lastReading.o2) : parseFloat(dl.o2 || 0);
    const shouldFeed = o2 === 0 || o2 >= ((sp === null || sp === void 0 ? void 0 : sp.minO2) || 5);
    const allLogs = Object.values(tl);
    const totalFed = allLogs.reduce((s, d) => s + parseFloat(d.feedGiven || 0), 0);
    const initB = (tank.initFishCount || tank.fishCount || 0) * (tank.initWeightG || tank.avgWeightG || 50) / 1000;
    const gainKg = biomassKg - initB;
    const fcr = gainKg > 0.1 ? (totalFed / gainKg).toFixed(2) : "—";
    const tabs = [
        { id: "daily", label: "📋 Diário" },
        { id: "bio", label: "⚖️ Biometria" },
        { id: "finance", label: "💸 Financeiro" },
        { id: "chart", label: "📈 Gráficos" },
        { id: "cycle", label: "🏁 Ciclo" },
        { id: "params", label: "📌 Parâmetros" },
    ];
    return (React.createElement("div", { className: "slide page-content" },
        React.createElement("div", { style: { marginBottom: 20 } },
            React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 12, marginBottom: 10 } },
                React.createElement("span", { style: { fontSize: 26 } }, sp === null || sp === void 0 ? void 0 : sp.icon),
                React.createElement("div", null,
                    React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10 } },
                        React.createElement("h1", { style: { fontWeight: 800, fontSize: 22, letterSpacing: "-0.5px" } }, tank.name),
                        React.createElement("button", { className: "btn btn-g", style: { fontSize: 11, padding: "4px 10px" }, onClick: onEdit }, "\u270F\uFE0F Editar")),
                    React.createElement("div", { style: { display: "flex", gap: 6, marginTop: 5, flexWrap: "wrap" } },
                        React.createElement("span", { className: "badge", style: { background: (sp === null || sp === void 0 ? void 0 : sp.color) + "22", color: sp === null || sp === void 0 ? void 0 : sp.color, border: `1px solid ${sp === null || sp === void 0 ? void 0 : sp.color}44` } }, sp === null || sp === void 0 ? void 0 : sp.name),
                        React.createElement("span", { className: "badge", style: { background: "rgba(255,255,255,0.05)", color: "var(--muted)", border: "1px solid var(--border2)" } }, phase === null || phase === void 0 ? void 0 : phase.name),
                        React.createElement("span", { className: "badge", style: { background: shouldFeed ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)", color: shouldFeed ? "var(--green)" : "var(--red)", border: `1px solid ${shouldFeed ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}` } }, o2 === 0 ? "⚪ Registre O₂" : shouldFeed ? "✅ Alimentar" : "🚫 Não Alimentar")))),
            React.createElement("div", { className: "kpi-row" }, [
                { ico: "__LOGO__", val: (tank.fishCount || 0).toLocaleString("pt-BR"), lbl: "Peixes" },
                { ico: "⚖️", val: `${tank.avgWeightG || 0}g`, lbl: "Peso" },
                { ico: "🏋️", val: `${biomassKg.toFixed(1)} kg`, lbl: "Biomassa" },
                { ico: "🍽️", val: `${(dailyFeedKg / 25).toFixed(2)}sc`, lbl: "Ração/Dia" },
                { ico: "📊", val: fcr, lbl: "FCR Real", warn: fcr !== "—" && parseFloat(fcr) > (FCR_META[tank.species] || 2.5) },
                { ico: "🎯", val: FCR_META[tank.species], lbl: "FCR Meta" },
                { ico: "💧", val: `${o2 || "—"}`, lbl: "O₂ mg/L", warn: o2 > 0 && o2 < ((sp === null || sp === void 0 ? void 0 : sp.minO2) || 5) },
                { ico: "📐", val: `${tank.areaM2}m²`, lbl: "Área" },
                { ico: "🌊", val: `${tank.depth || 1.5}m`, lbl: "Profund." },
            ].map(k => (React.createElement("div", { key: k.lbl, className: "kpi-chip", style: { borderColor: k.warn ? "rgba(239,68,68,0.4)" : "var(--border)" } },
                k.ico === "__LOGO__" ? React.createElement("img", { src: "/icon.png", style: { width: 22, height: 22, objectFit: "cover", borderRadius: 4, display: "inline-block" } }) : React.createElement("div", { style: { fontSize: 16 } }, k.ico),
                React.createElement("div", { className: "val", style: { fontSize: 14, color: k.warn ? "var(--red)" : "var(--text)" } }, k.val),
                React.createElement("div", { className: "lbl" }, k.lbl)))))),
        React.createElement("div", { className: "bottom-bar" }, tabs.map(t => {
            const icons = { "daily": "📋", "bio": "⚖️", "finance": "💸", "chart": "📈", "cycle": "🏁", "params": "📌" };
            const labels = { "daily": "Diário", "bio": "Biometria", "finance": "Financeiro", "chart": "Gráficos", "cycle": "Ciclo", "params": "Parâm." };
            return (React.createElement("button", { key: t.id, className: `bottom-tab ${tab === t.id ? "active" : ""}`, onClick: () => setTab(t.id) },
                React.createElement("span", { className: "ico" }, icons[t.id]),
                React.createElement("span", null, labels[t.id])));
        })),
        tab === "daily" && React.createElement(DailyTab, { tank: tank, phase: phase, dailyFeedKg: dailyFeedKg, sp: sp }),
        tab === "bio" && React.createElement(BioTab, { tank: tank }),
        tab === "finance" && React.createElement(FinanceTab, { tank: tank }),
        tab === "chart" && React.createElement(ChartTab, { tank: tank }),
        tab === "cycle" && React.createElement(CycleTab, { tank: tank, biomassKg: biomassKg }),
        tab === "params" && React.createElement(ParamsTab, { sp: sp, phase: phase, tank: tank })));
}


// ═══════════════════════════════════════════════════════════════════════════════
// DAILY TAB
// ═══════════════════════════════════════════════════════════════════════════════
function DailyTab({ tank, phase, dailyFeedKg, sp }) {
    var _a;
    const { updateDayLog, logs, activeDate, setActiveDate, consumeStock, stock, waterTimes, goHome } = useApp();
    const dl = ((_a = logs[tank.id]) === null || _a === void 0 ? void 0 : _a[activeDate]) || {};
    const emptyReadings = waterTimes.map(t => ({ time: t, o2: "", temp: "", ph: "" }));
    const [readings, setReadings] = (0, useState)(() => {
        var _a;
        if ((_a = dl.readings) === null || _a === void 0 ? void 0 : _a.length) return dl.readings.map((r, i) => ({ time: waterTimes[i] || r.time || emptyReadings[i].time, o2: r.o2 || "", temp: r.temp || "", ph: r.ph || "" }));
        return emptyReadings;
    });
    const [feedForm, setFeedForm] = (0, useState)({ feedGiven: "", feedRefused: "", mortality: dl.mortality || "", obs: dl.obs || "" });
    const [engVisit, setEngVisit] = (0, useState)(() => {
        var _a, _b, _c, _d, _e, _f, _g;
        return ({
            active: !!((_a = dl.engVisit) === null || _a === void 0 ? void 0 : _a.active),
            visitTime: (dl.engVisit && dl.engVisit.visitTime) || "",
            ph: ((_b = dl.engVisit) === null || _b === void 0 ? void 0 : _b.ph) || "",
            ammonia: ((_c = dl.engVisit) === null || _c === void 0 ? void 0 : _c.ammonia) || "",
            hardness: ((_d = dl.engVisit) === null || _d === void 0 ? void 0 : _d.hardness) || "",
            alkalinity: ((_e = dl.engVisit) === null || _e === void 0 ? void 0 : _e.alkalinity) || "",
            engineer: ((_f = dl.engVisit) === null || _f === void 0 ? void 0 : _f.engineer) || "",
            notes: ((_g = dl.engVisit) === null || _g === void 0 ? void 0 : _g.notes) || "",
        });
    });
    (0, useEffect)(() => {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j;
        const d = ((_a = logs[tank.id]) === null || _a === void 0 ? void 0 : _a[activeDate]) || {};
        if ((_b = d.readings) === null || _b === void 0 ? void 0 : _b.length) setReadings(d.readings.map((r, i) => ({ time: waterTimes[i] || r.time, o2: r.o2 || "", temp: r.temp || "", ph: r.ph || "" })));
        else setReadings(waterTimes.map(t => ({ time: t, o2: "", temp: "" })));
        setFeedForm({ feedGiven: "", feedRefused: "", mortality: d.mortality || "", obs: d.obs || "" });
        setEngVisit({
            active: !!((_c = d.engVisit) === null || _c === void 0 ? void 0 : _c.active),
            ph: ((_d = d.engVisit) === null || _d === void 0 ? void 0 : _d.ph) || "",
            ammonia: ((_e = d.engVisit) === null || _e === void 0 ? void 0 : _e.ammonia) || "",
            hardness: ((_f = d.engVisit) === null || _f === void 0 ? void 0 : _f.hardness) || "",
            alkalinity: ((_g = d.engVisit) === null || _g === void 0 ? void 0 : _g.alkalinity) || "",
            engineer: ((_h = d.engVisit) === null || _h === void 0 ? void 0 : _h.engineer) || "",
            notes: ((_j = d.engVisit) === null || _j === void 0 ? void 0 : _j.notes) || "",
        });
    }, [activeDate, tank.id]);

    const lastO2 = [...readings].reverse().find(r => parseFloat(r.o2) > 0);
    const o2ForAlert = lastO2 ? parseFloat(lastO2.o2) : 0;
    const feedAlert = o2ForAlert > 0 && o2ForAlert < ((sp === null || sp === void 0 ? void 0 : sp.minO2) || 5);
    const dailySacks = dailyFeedKg / 25;
    const sacosPerMeal = dailySacks / ((phase === null || phase === void 0 ? void 0 : phase.freq) || 1);

    const defaultMeals = ((phase === null || phase === void 0 ? void 0 : phase.freq) >= 4 ? ["06:00", "09:00", "12:00", "16:00"] :
        (phase === null || phase === void 0 ? void 0 : phase.freq) >= 3 ? ["06:00", "11:00", "16:00"] :
        (phase === null || phase === void 0 ? void 0 : phase.freq) >= 2 ? ["06:00", "15:00"] : ["08:00"]).map(t => ({ time: t, sacos: "", refused: "" }));

    const [meals, setMeals] = (0, useState)(() => {
        var _a;
        if ((_a = dl.meals) === null || _a === void 0 ? void 0 : _a.length) return dl.meals.map((m, i) => { var _a; return ({ time: m.time || (((_a = defaultMeals[i]) === null || _a === void 0 ? void 0 : _a.time) || "08:00"), sacos: m.sacos || "", refused: m.refused || "" }); });
        return defaultMeals;
    });

    (0, useEffect)(() => {
        var _a, _b, _c;
        const d = ((_a = logs[tank.id]) === null || _a === void 0 ? void 0 : _a[activeDate]) || {};
        if ((_b = d.meals) === null || _b === void 0 ? void 0 : _b.length) setMeals(d.meals.map((m, i) => { var _a; return ({ time: m.time || (((_a = defaultMeals[i]) === null || _a === void 0 ? void 0 : _a.time) || "08:00"), sacos: m.sacos || "", refused: m.refused || "" }); }));
        else setMeals(defaultMeals);
    }, [activeDate, tank.id]);

    function updateMeal(idx, field, val) { setMeals(prev => prev.map((m, i) => i === idx ? { ...m, [field]: val } : m)); }
    function addMeal() {
        const templates = ["06:00", "08:00", "10:00", "12:00", "14:00", "16:00", "18:00", "20:00"];
        setMeals(prev => [...prev, { time: templates[prev.length] || "08:00", sacos: "", refused: "" }]);
    }
    function removeMeal(idx) { setMeals(prev => prev.filter((_, i) => i !== idx)); }

    const totalGivenSacos = meals.reduce((s, m) => s + parseFloat(m.sacos || 0), 0);
    const totalRefusedSacos = meals.reduce((s, m) => s + parseFloat(m.refused || 0), 0);
    const totalConsumedSacos = totalGivenSacos - totalRefusedSacos;
    const totalGivenKg = totalGivenSacos * 25;
    const totalRefusedKg = totalRefusedSacos * 25;
    const validO2s = readings.map(r => parseFloat(r.o2)).filter(v => v > 0);
    const minO2today = validO2s.length ? Math.min(...validO2s).toFixed(1) : "—";
    const maxO2today = validO2s.length ? Math.max(...validO2s).toFixed(1) : "—";

    function updateReading(idx, field, val) { setReadings(prev => prev.map((r, i) => i === idx ? { ...r, [field]: val } : r)); }

    function handleSave() {
        var _a;
        const prevSacos = (dl.feedGivenKg || 0) / 25;
        const diff = totalGivenSacos - prevSacos;
        const payload = {
            readings, meals, o2: o2ForAlert || "",
            temp: ((_a = readings.find(r => r.temp)) === null || _a === void 0 ? void 0 : _a.temp) || "",
            feedGiven: totalGivenSacos, feedGivenKg: totalGivenKg, feedRefusedKg: totalRefusedKg,
            mortality: feedForm.mortality, obs: feedForm.obs,
            engVisit: engVisit.active ? engVisit : null,
            savedAt: new Date().toISOString()
        };
        updateDayLog(tank.id, activeDate, payload);
        if (diff > 0) consumeStock(diff, tank.id, `Arraçoamento ${tank.name} ${activeDate}`);
        goHome();
    }

    function o2Status(val) {
        const v = parseFloat(val);
        if (!v) return { color: "var(--muted)", label: "—" };
        if (v < ((sp === null || sp === void 0 ? void 0 : sp.minO2) || 5) - 1) return { color: "var(--red)", label: "🔴 Crítico" };
        if (v < ((sp === null || sp === void 0 ? void 0 : sp.minO2) || 5)) return { color: "var(--yellow)", label: "🟡 Atenção" };
        if (v >= ((sp === null || sp === void 0 ? void 0 : sp.idealO2) || 7)) return { color: "var(--green)", label: "✅ Ótimo" };
        return { color: "var(--green)", label: "✅ Ok" };
    }

    const slotLabels = ["🌅 Manhã", "☀️ Tarde", "🌙 Noite"];

    return (React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 14 } },
        React.createElement("div", { className: "card", style: { padding: 16 } },
            React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" } },
                React.createElement("div", null,
                    React.createElement("lbl", null, "Data"),
                    React.createElement("input", { type: "date", className: "inp", style: { width: 160 }, value: activeDate, onChange: e => setActiveDate(e.target.value) })),
                React.createElement("div", { style: { flex: 1 } }),
                React.createElement("div", { style: { textAlign: "right" } },
                    React.createElement("lbl", null, "Ra\u00E7\u00E3o Recomendada"),
                    React.createElement("div", { style: { fontFamily: "var(--mono)", fontSize: 18, fontWeight: 700, color: sp === null || sp === void 0 ? void 0 : sp.color } }, dailySacks.toFixed(3), " sacos/dia"),
                    React.createElement("div", { style: { fontSize: 11, color: "var(--muted)" } },
                        phase === null || phase === void 0 ? void 0 : phase.freq, "x \u00B7 ", (dailySacks / (phase === null || phase === void 0 ? void 0 : phase.freq)).toFixed(3), " sc/refei\u00E7\u00E3o \u00B7 ",
                        React.createElement("span", { style: { color: "#fbbf24", fontWeight: 700 } }, "prot. ", phase === null || phase === void 0 ? void 0 : phase.protPct, "%")),
                    React.createElement("div", { style: { fontSize: 11, color: "var(--muted)", marginTop: 2 } }, "Estoque: ", React.createElement("strong", { style: { color: stock.bags < 10 ? "var(--red)" : "var(--text)" } }, stock.bags, " sacos")))),
            feedAlert && (React.createElement("div", { className: "alert-bar pulse", style: { background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)", color: "#f87171", marginTop: 12 } },
                "\uD83D\uDEAB ", React.createElement("strong", null, "N\u00C3O ALIMENTAR"), " \u2014 O\u2082: ", o2ForAlert, " mg/L"))),
        React.createElement("div", { className: "card", style: { padding: 18 } },
            React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 } },
                React.createElement("div", { className: "section-hdr", style: { margin: 0 } }, "\uD83D\uDCA7 Qualidade da \u00C1gua \u2014 3 Leituras"),
                React.createElement("div", { style: { fontSize: 11, color: "var(--muted)" } }, "m\u00EDn O\u2082: ", sp === null || sp === void 0 ? void 0 : sp.minO2, " \u00B7 ideal: ", sp === null || sp === void 0 ? void 0 : sp.idealO2, " mg/L")),
            React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 } },
                readings.map((r, i) => {
                    const st = o2Status(r.o2);
                    return (React.createElement("div", { key: i, style: { background: "rgba(255,255,255,0.03)", borderRadius: 10, padding: 12, border: `1px solid ${r.o2 ? st.color + "44" : "var(--border)"}` } },
                        React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 } },
                            React.createElement("span", { style: { fontSize: 12, fontWeight: 700 } }, slotLabels[i]),
                            React.createElement("span", { style: { fontSize: 10, color: st.color, fontWeight: 600 } }, r.o2 ? st.label : "")),
                        React.createElement("div", { style: { fontSize: 11, color: "var(--muted)", marginBottom: 8, textAlign: "center", fontFamily: "var(--mono)" } }, r.time),
                        React.createElement("div", { style: { marginBottom: 8 } },
                            React.createElement("lbl", null, "O\u2082 (mg/L)"),
                            React.createElement("input", { className: "inp", type: "number", step: "0.1", placeholder: `≥${sp === null || sp === void 0 ? void 0 : sp.idealO2}`, value: r.o2,
                                style: { textAlign: "center", fontWeight: 700, fontSize: 15, color: r.o2 ? (parseFloat(r.o2) < ((sp === null || sp === void 0 ? void 0 : sp.minO2) || 5) ? "var(--red)" : "var(--green)") : "var(--text)" },
                                onChange: e => updateReading(i, "o2", e.target.value) })),
                        React.createElement("div", null,
                            React.createElement("lbl", null, "Temp (\u00B0C)"),
                            React.createElement("input", { className: "inp", type: "number", step: "0.1", placeholder: `${sp === null || sp === void 0 ? void 0 : sp.idealTemp}°C`, value: r.temp, style: { textAlign: "center" }, onChange: e => updateReading(i, "temp", e.target.value) }))));
                }))),
        React.createElement("div", { className: "card", style: { padding: 18 } },
            React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14, flexWrap: "wrap", gap: 10 } },
                React.createElement("div", null,
                    React.createElement("div", { className: "section-hdr", style: { margin: 0, marginBottom: 6 } }, "\uD83C\uDF7D\uFE0F Alimenta\u00E7\u00E3o \u2014 Refei\u00E7\u00F5es do Dia"),
                    React.createElement("div", { style: { fontSize: 12, color: "var(--muted)" } }, "Recomendado: ", React.createElement("strong", { style: { color: sp === null || sp === void 0 ? void 0 : sp.color, fontFamily: "var(--mono)" } }, dailySacks.toFixed(3), " sacos/dia")))),
            React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 } },
                meals.map((meal, i) => {
                    const sacs = parseFloat(meal.sacos || 0);
                    const ref = parseFloat(meal.refused || 0);
                    return (React.createElement("div", { key: i, style: { background: "rgba(255,255,255,0.03)", borderRadius: 10, padding: "12px 14px", border: "1px solid var(--border)" } },
                        React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10, marginBottom: 10 } },
                            React.createElement("div", { style: { width: 28, height: 28, borderRadius: "50%", background: (sp === null || sp === void 0 ? void 0 : sp.color) + "22", border: `1px solid ${sp === null || sp === void 0 ? void 0 : sp.color}44`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: sp === null || sp === void 0 ? void 0 : sp.color, flexShrink: 0 } }, i + 1),
                            React.createElement("input", { type: "time", className: "inp", style: { width: 110, fontFamily: "var(--mono)", fontSize: 14, fontWeight: 600, textAlign: "center", padding: "6px 8px" }, value: meal.time, onChange: e => updateMeal(i, "time", e.target.value) }),
                            React.createElement("div", { style: { flex: 1 } }),
                            meals.length > 1 && (React.createElement("button", { onClick: () => removeMeal(i), style: { background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 7, padding: "4px 10px", cursor: "pointer", color: "#f87171", fontSize: 12, fontFamily: "var(--font)" } }, "\u2715"))),
                        React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 } },
                            React.createElement("div", null,
                                React.createElement("lbl", null, "Sacos ofertados"),
                                React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 6, marginTop: 4 } },
                                    React.createElement("button", { onClick: () => updateMeal(i, "sacos", Math.max(0, sacs - 0.5).toFixed(3)), style: { width: 32, height: 36, borderRadius: 7, border: "1px solid var(--border2)", background: "rgba(255,255,255,0.04)", cursor: "pointer", color: "var(--text)", fontSize: 18 } }, "\u2212"),
                                    React.createElement("input", { className: "inp", type: "number", step: "0.001", min: "0", style: { textAlign: "center", fontFamily: "var(--mono)", fontWeight: 700, fontSize: 15, flex: 1 }, placeholder: sacosPerMeal.toFixed(3), value: meal.sacos, onChange: e => updateMeal(i, "sacos", e.target.value) }),
                                    React.createElement("button", { onClick: () => updateMeal(i, "sacos", (sacs + 0.5).toFixed(3)), style: { width: 32, height: 36, borderRadius: 7, border: "1px solid var(--border2)", background: "rgba(255,255,255,0.04)", cursor: "pointer", color: "var(--text)", fontSize: 18 } }, "+"))),
                            React.createElement("div", null,
                                React.createElement("lbl", null, "Recusado / sobra"),
                                React.createElement("input", { className: "inp", type: "number", step: "0.001", min: "0", style: { textAlign: "center", fontFamily: "var(--mono)", fontSize: 13 }, placeholder: "0", value: meal.refused, onChange: e => updateMeal(i, "refused", e.target.value) })))));
                })),
            React.createElement("button", { onClick: addMeal, className: "btn btn-g", style: { width: "100%", marginBottom: 14, fontSize: 13 } }, "+ Adicionar Refei\u00E7\u00E3o"),
            totalGivenSacos > 0 && (React.createElement("div", { style: { background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.25)", borderRadius: 10, padding: "12px 14px" } },
                React.createElement("div", { style: { fontFamily: "var(--mono)", fontSize: 18, fontWeight: 700, color: "var(--green)" } }, totalGivenSacos.toFixed(3), " sacos (", totalGivenKg.toFixed(1), " kg)"),
                React.createElement("div", { style: { fontSize: 12, color: "var(--muted)", marginTop: 4 } }, meals.length, " refei\u00E7\u00E3o", meals.length !== 1 ? "ões" : "")))),
        React.createElement("div", { className: "card", style: { padding: 18 } },
            React.createElement("div", { className: "section-hdr" }, "\uD83D\uDCDD Mortalidade & Observa\u00E7\u00F5es"),
            React.createElement("div", { className: "grid2", style: { marginBottom: 14 } },
                React.createElement("div", null,
                    React.createElement("lbl", null, "Mortalidade (unid.)"),
                    React.createElement("input", { className: "inp", type: "number", placeholder: "0", value: feedForm.mortality, onChange: e => setFeedForm(p => ({ ...p, mortality: e.target.value })) })),
                React.createElement("div", null,
                    React.createElement("lbl", null, "Observa\u00E7\u00F5es"),
                    React.createElement("input", { className: "inp", placeholder: "Comportamento, a\u00E7\u00E3o...", value: feedForm.obs, onChange: e => setFeedForm(p => ({ ...p, obs: e.target.value })) }))),
            React.createElement("button", { className: "btn btn-p", style: { width: "100%", padding: 12, fontSize: 14 }, onClick: handleSave }, "\uD83D\uDCBE Salvar Registro do Dia"))));
}


// ═══════════════════════════════════════════════════════════════════════════════
// BIO TAB
// ═══════════════════════════════════════════════════════════════════════════════
function BioTab({ tank }) {
    const { updateTank } = useApp();
    const [samples, setSamples] = (0, useState)("");
    const [avgW, setAvgW] = (0, useState)(tank.avgWeightG || "");
    const [avgL, setAvgL] = (0, useState)("");
    const [count, setCount] = (0, useState)(tank.fishCount || "");
    const [bioDate, setBioDate] = (0, useState)(today());
    const sp = SP[tank.species];
    function calcAvg() {
        const nums = samples.split(/[\n,;]+/).map(s => parseFloat(s.trim())).filter(n => !isNaN(n) && n > 0);
        if (!nums.length) return alert("Insira os pesos separados por vírgula ou linha.");
        setAvgW((nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(1));
    }
    function handleSave() {
        var _a;
        const w = parseFloat(avgW);
        const c = parseInt(count) || tank.fishCount;
        if (!w) return alert("Informe o peso médio.");
        const history = [...(tank.bioHistory || []), { date: bioDate, avgWeightG: w, avgLengthCm: parseFloat(avgL) || 0, fishCount: c }];
        updateTank({ ...tank, avgWeightG: w, fishCount: c, bioHistory: history, initFishCount: tank.initFishCount || c, initWeightG: tank.initWeightG || w });
        alert(`✅ Biometria salva! Peso: ${w}g → ${(_a = getPhase(tank.species, w)) === null || _a === void 0 ? void 0 : _a.name}`);
    }
    const wG = parseFloat(avgW) || 0;
    const cN = parseInt(count) || tank.fishCount || 0;
    const phase = getPhase(tank.species, wG);
    const bioKg = cN * wG / 1000;
    const feedKg = bioKg * ((phase === null || phase === void 0 ? void 0 : phase.pct) || 0);
    const bioHistory = tank.bioHistory || [];
    return (React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 14 } },
        React.createElement("div", { className: "grid2" },
            React.createElement("div", { className: "card", style: { padding: 18 } },
                React.createElement("div", { className: "section-hdr" }, "\u2696\uFE0F Nova Biometria"),
                React.createElement("div", { style: { marginBottom: 12 } },
                    React.createElement("lbl", null, "Data da Biometria"),
                    React.createElement("input", { type: "date", className: "inp", value: bioDate, onChange: e => setBioDate(e.target.value) })),
                React.createElement("div", { style: { marginBottom: 12 } },
                    React.createElement("lbl", null, "Pesos da Amostra (g) — v\u00EDrgula ou linha"),
                    React.createElement("textarea", { className: "inp", style: { minHeight: 70, resize: "vertical" }, placeholder: "Ex: 320, 350, 310, 380...", value: samples, onChange: e => setSamples(e.target.value) })),
                React.createElement("button", { className: "btn btn-g", style: { marginBottom: 14, width: "100%" }, onClick: calcAvg }, "\uD83D\uDCCA Calcular M\u00E9dia"),
                React.createElement("div", { className: "grid2", style: { marginBottom: 12 } },
                    React.createElement("div", null,
                        React.createElement("lbl", null, "Peso M\u00E9dio (g)"),
                        React.createElement("input", { className: "inp", type: "number", step: "0.1", value: avgW, onChange: e => setAvgW(e.target.value) })),
                    React.createElement("div", null,
                        React.createElement("lbl", null, "Comprimento (cm)"),
                        React.createElement("input", { className: "inp", type: "number", step: "0.1", placeholder: "opcional", value: avgL, onChange: e => setAvgL(e.target.value) }))),
                React.createElement("div", { style: { marginBottom: 14 } },
                    React.createElement("lbl", null, "Qtd. Peixes Atual"),
                    React.createElement("input", { className: "inp", type: "number", value: count, onChange: e => setCount(e.target.value) })),
                React.createElement("button", { className: "btn btn-p", style: { width: "100%", padding: 12 }, onClick: handleSave }, "\uD83D\uDCBE Salvar Biometria")),
            React.createElement("div", { className: "card", style: { padding: 18 } },
                React.createElement("div", { className: "section-hdr" }, "\uD83D\uDCCA Proje\u00E7\u00E3o"),
                wG > 0 && (React.createElement(React.Fragment, null,
                    React.createElement("div", { style: { background: `${sp === null || sp === void 0 ? void 0 : sp.color}11`, border: `1px solid ${sp === null || sp === void 0 ? void 0 : sp.color}33`, borderRadius: 10, padding: "14px 16px", marginBottom: 14 } },
                        React.createElement("div", { style: { fontFamily: "var(--mono)", fontSize: 18, fontWeight: 700, color: sp === null || sp === void 0 ? void 0 : sp.color } }, phase === null || phase === void 0 ? void 0 : phase.name)),
                    [
                        { l: "Biomassa estimada", v: `${bioKg.toFixed(1)} kg` },
                        { l: "Ração diária", v: sacosLabel(feedKg) },
                        { l: "% Arraçoamento", v: `${((phase === null || phase === void 0 ? void 0 : phase.pct) * 100).toFixed(1)}%` },
                        { l: "Refeições/dia", v: `${phase === null || phase === void 0 ? void 0 : phase.freq}x` },
                        { l: "FCR Meta", v: FCR_META[tank.species] },
                        { l: "Proteína ração", v: `${phase === null || phase === void 0 ? void 0 : phase.protPct}%` },
                    ].map(i => (React.createElement("div", { key: i.l, style: { display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid var(--border)", fontSize: 13 } },
                        React.createElement("span", { style: { color: "var(--muted)" } }, i.l),
                        React.createElement("span", { style: { fontFamily: "var(--mono)", fontWeight: 600 } }, i.v)))))))),
        bioHistory.length > 0 && (React.createElement("div", { className: "card", style: { padding: 18 } },
            React.createElement("div", { className: "section-hdr" }, "\uD83D\uDCC5 Hist\u00F3rico de Biometrias"),
            React.createElement("table", null,
                React.createElement("thead", null,
                    React.createElement("tr", null,
                        React.createElement("th", null, "Data"), React.createElement("th", null, "Peso M\u00E9dio"), React.createElement("th", null, "Qtd. Peixes"),
                        React.createElement("th", null, "Biomassa"), React.createElement("th", null, "Fase"))),
                React.createElement("tbody", null,
                    [...bioHistory].reverse().map((b, i) => {
                        var _a;
                        return (React.createElement("tr", { key: i },
                            React.createElement("td", { style: { fontFamily: "var(--mono)" } }, b.date),
                            React.createElement("td", { style: { fontFamily: "var(--mono)", fontWeight: 600 } }, b.avgWeightG, "g"),
                            React.createElement("td", { style: { fontFamily: "var(--mono)" } }, (b.fishCount || 0).toLocaleString("pt-BR")),
                            React.createElement("td", { style: { fontFamily: "var(--mono)" } }, ((b.fishCount || 0) * b.avgWeightG / 1000).toFixed(1), " kg"),
                            React.createElement("td", null, React.createElement("span", { className: "badge", style: { background: `${sp === null || sp === void 0 ? void 0 : sp.color}22`, color: sp === null || sp === void 0 ? void 0 : sp.color } }, (_a = getPhase(tank.species, b.avgWeightG)) === null || _a === void 0 ? void 0 : _a.name))));
                    })))))));
}

// ═══════════════════════════════════════════════════════════════════════════════
// FINANCE TAB (simplificado mas funcional)
// ═══════════════════════════════════════════════════════════════════════════════
const EXPENSE_CATS = ["Ração", "Energia", "Salários", "Alevinos", "Medicamentos", "Manutenção", "Transporte", "Equipamentos", "Outros"];

function FinanceTab({ tank }) {
    const { expenses, addExpense, logs, updateTank } = useApp();
    const [form, setForm] = (0, useState)({ date: today(), cat: "Ração", desc: "", amount: "" });
    const tankExp = expenses[tank.id] || [];
    const totalExp = tankExp.reduce((s, e) => s + (e.amount || 0), 0);
    const pricePerKg = tank.pricePerKg || 21;
    const projRevenue = (tank.fishCount || 0) * (tank.avgWeightG || 0) / 1000 * pricePerKg;
    const projProfit = projRevenue - totalExp;
    function handleAdd() {
        if (!form.amount || !form.cat) return alert("Preencha categoria e valor.");
        addExpense(tank.id, { ...form, amount: parseFloat(form.amount), id: genId() });
        setForm(p => ({ ...p, desc: "", amount: "" }));
    }
    return (React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 14 } },
        React.createElement("div", { className: "grid2" }, [
            { ico: "💸", val: fmtBRL(totalExp), lbl: "Custo Total" },
            { ico: "📈", val: fmtBRL(projRevenue), lbl: "Receita Projetada" },
            { ico: "💰", val: fmtBRL(projProfit), lbl: "Lucro Projetado", warn: projProfit < 0 },
            { ico: "📊", val: projRevenue > 0 ? `${(projProfit/projRevenue*100).toFixed(1)}%` : "—", lbl: "Margem" },
        ].map(k => (React.createElement("div", { key: k.lbl, className: "card kpi", style: { borderColor: k.warn ? "rgba(239,68,68,0.4)" : "var(--border)" } },
            React.createElement("div", { className: "ico" }, k.ico),
            React.createElement("div", { className: "val", style: { fontSize: 16, color: k.warn ? "var(--red)" : "var(--text)" } }, k.val),
            React.createElement("div", { className: "lbl" }, k.lbl))))),
        React.createElement("div", { className: "card", style: { padding: 18 } },
            React.createElement("div", { className: "section-hdr" }, "+ Nova Despesa"),
            React.createElement("div", { className: "grid4", style: { marginBottom: 12 } },
                React.createElement("div", null,
                    React.createElement("lbl", null, "Data"),
                    React.createElement("input", { type: "date", className: "inp", value: form.date, onChange: e => setForm(p => ({ ...p, date: e.target.value })) })),
                React.createElement("div", null,
                    React.createElement("lbl", null, "Categoria"),
                    React.createElement("select", { className: "inp", value: form.cat, onChange: e => setForm(p => ({ ...p, cat: e.target.value })) }, EXPENSE_CATS.map(c => React.createElement("option", { key: c }, c)))),
                React.createElement("div", null,
                    React.createElement("lbl", null, "Descri\u00E7\u00E3o"),
                    React.createElement("input", { className: "inp", placeholder: "ex: 50 sacos", value: form.desc, onChange: e => setForm(p => ({ ...p, desc: e.target.value })) })),
                React.createElement("div", null,
                    React.createElement("lbl", null, "Valor (R$)"),
                    React.createElement("input", { className: "inp", type: "number", step: "0.01", placeholder: "0,00", value: form.amount, onChange: e => setForm(p => ({ ...p, amount: e.target.value })) }))),
            React.createElement("button", { className: "btn btn-p", onClick: handleAdd }, "+ Adicionar Despesa")),
        React.createElement("div", { className: "card", style: { padding: 18 } },
            React.createElement("div", { className: "section-hdr" }, "Hist\u00F3rico de Despesas"),
            React.createElement("table", null,
                React.createElement("thead", null,
                    React.createElement("tr", null,
                        React.createElement("th", null, "Data"), React.createElement("th", null, "Categoria"),
                        React.createElement("th", null, "Descri\u00E7\u00E3o"), React.createElement("th", null, "Valor"))),
                React.createElement("tbody", null,
                    [...tankExp].reverse().map(e => (React.createElement("tr", { key: e.id },
                        React.createElement("td", { style: { fontFamily: "var(--mono)" } }, e.date),
                        React.createElement("td", null, React.createElement("span", { className: "badge", style: { background: "rgba(14,165,233,0.1)", color: "var(--accent)" } }, e.cat)),
                        React.createElement("td", { style: { color: "var(--muted)" } }, e.desc || "—"),
                        React.createElement("td", { style: { fontFamily: "var(--mono)", fontWeight: 600 } }, fmtBRL(e.amount))))),
                    tankExp.length === 0 && React.createElement("tr", null, React.createElement("td", { colSpan: 4, style: { textAlign: "center", color: "var(--muted)", padding: 20 } }, "Nenhuma despesa registrada")))),
            React.createElement("div", { style: { marginTop: 12, textAlign: "right", fontFamily: "var(--mono)", fontWeight: 700, fontSize: 15 } }, "Total: ", fmtBRL(totalExp)))));
}

// ═══════════════════════════════════════════════════════════════════════════════
// CHART TAB
// ═══════════════════════════════════════════════════════════════════════════════
function ChartTab({ tank }) {
    const { logs } = useApp();
    const tl = logs[tank.id] || {};
    const sp = SP[tank.species];
    const chartData = Object.entries(tl).sort(([a], [b]) => a > b ? 1 : -1).slice(-30).map(([date, d]) => {
        var _a, _b, _c;
        return ({
            date: date.slice(5),
            "O₂ Manhã": parseFloat((d.readings && ((_a = d.readings[0]) === null || _a === void 0 ? void 0 : _a.o2)) || d.o2 || 0),
            "O₂ Tarde": parseFloat((d.readings && ((_b = d.readings[1]) === null || _b === void 0 ? void 0 : _b.o2)) || 0),
            "O₂ Noite": parseFloat((d.readings && ((_c = d.readings[2]) === null || _c === void 0 ? void 0 : _c.o2)) || 0),
            "Temp (°C)": parseFloat(d.temp || 0),
            "Ração (sacos)": d.feedGivenKg ? d.feedGivenKg / 25 : parseFloat(d.feedGiven || 0),
        });
    });
    const bioData = (tank.bioHistory || []).map(b => ({ date: b.date.slice(5), "Peso Médio (g)": b.avgWeightG, "Biomassa (kg)": (b.fishCount || 0) * b.avgWeightG / 1000 }));
    if (chartData.length < 2 && bioData.length < 2) return (React.createElement("div", { className: "card", style: { padding: 40, textAlign: "center", color: "var(--muted)" } }, React.createElement("div", { style: { fontSize: 40, marginBottom: 12 } }, "\uD83D\uDCC8"), React.createElement("p", null, "Registre pelo menos 2 dias para ver os gr\u00E1ficos.")));
    return (React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 14 } },
        chartData.length >= 2 && (React.createElement(React.Fragment, null,
            React.createElement("div", { className: "card", style: { padding: 18 } },
                React.createElement("div", { className: "section-hdr" }, "\uD83D\uDCA7 Oxigena\u00E7\u00E3o e Temperatura"),
                React.createElement(ResponsiveContainer, { width: "100%", height: 220 },
                    React.createElement(LineChart, { data: chartData },
                        React.createElement(CartesianGrid, { stroke: "rgba(255,255,255,0.04)" }),
                        React.createElement(XAxis, { dataKey: "date", tick: { fill: "var(--muted)", fontSize: 10 } }),
                        React.createElement(YAxis, { tick: { fill: "var(--muted)", fontSize: 10 } }),
                        React.createElement(Tooltip, { contentStyle: { background: "#0b1626", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)" } }),
                        React.createElement(Legend, { wrapperStyle: { color: "var(--muted)", fontSize: 11 } }),
                        React.createElement(Line, { type: "monotone", dataKey: "O\u2082 Manh\u00E3", stroke: "#60a5fa", strokeWidth: 2, dot: { r: 2 } }),
                        React.createElement(Line, { type: "monotone", dataKey: "O\u2082 Tarde", stroke: "#0ea5e9", strokeWidth: 2, dot: { r: 2 } }),
                        React.createElement(Line, { type: "monotone", dataKey: "O\u2082 Noite", stroke: "#6366f1", strokeWidth: 2, dot: { r: 2 } }),
                        React.createElement(Line, { type: "monotone", dataKey: "Temp (\u00B0C)", stroke: "#f59e0b", strokeWidth: 2, dot: { r: 2 } })))),
            React.createElement("div", { className: "card", style: { padding: 18 } },
                React.createElement("div", { className: "section-hdr" }, "\uD83C\uDF7D\uFE0F Ra\u00E7\u00E3o por Dia (sacos)"),
                React.createElement(ResponsiveContainer, { width: "100%", height: 180 },
                    React.createElement(BarChart, { data: chartData },
                        React.createElement(CartesianGrid, { stroke: "rgba(255,255,255,0.04)" }),
                        React.createElement(XAxis, { dataKey: "date", tick: { fill: "var(--muted)", fontSize: 10 } }),
                        React.createElement(YAxis, { tick: { fill: "var(--muted)", fontSize: 10 } }),
                        React.createElement(Tooltip, { contentStyle: { background: "#0b1626", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)" } }),
                        React.createElement(Bar, { dataKey: "Ra\u00E7\u00E3o (sacos)", fill: "#22c55e", radius: [3, 3, 0, 0] })))))),
        bioData.length >= 2 && (React.createElement("div", { className: "card", style: { padding: 18 } },
            React.createElement("div", { className: "section-hdr" }, "\u2696\uFE0F Evolu\u00E7\u00E3o de Peso e Biomassa"),
            React.createElement(ResponsiveContainer, { width: "100%", height: 200 },
                React.createElement(LineChart, { data: bioData },
                    React.createElement(CartesianGrid, { stroke: "rgba(255,255,255,0.04)" }),
                    React.createElement(XAxis, { dataKey: "date", tick: { fill: "var(--muted)", fontSize: 10 } }),
                    React.createElement(YAxis, { yAxisId: "g", tick: { fill: "var(--muted)", fontSize: 10 } }),
                    React.createElement(YAxis, { yAxisId: "kg", orientation: "right", tick: { fill: "var(--muted)", fontSize: 10 } }),
                    React.createElement(Tooltip, { contentStyle: { background: "#0b1626", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)" } }),
                    React.createElement(Legend, { wrapperStyle: { color: "var(--muted)", fontSize: 11 } }),
                    React.createElement(Line, { yAxisId: "g", type: "monotone", dataKey: "Peso M\u00E9dio (g)", stroke: sp === null || sp === void 0 ? void 0 : sp.color, strokeWidth: 2, dot: { r: 4 } }),
                    React.createElement(Line, { yAxisId: "kg", type: "monotone", dataKey: "Biomassa (kg)", stroke: "#a78bfa", strokeWidth: 2, dot: { r: 4 } })))))));
}

// ═══════════════════════════════════════════════════════════════════════════════
// CYCLE TAB
// ═══════════════════════════════════════════════════════════════════════════════
function CycleTab({ tank, biomassKg }) {
    const { cycles, setCycles, expenses, logs } = useApp();
    const [form, setForm] = (0, useState)({ harvestDate: today(), soldFish: "", avgFinalWeight: "", pricePerKg: "21", obs: "" });
    const tankExp = expenses[tank.id] || [];
    const totalExp = tankExp.reduce((s, e) => s + (e.amount || 0), 0);
    const tl = logs[tank.id] || {};
    const totalFedKg = Object.values(tl).reduce((s, d) => s + (d.feedGivenKg || 0), 0);
    const totalMort = Object.values(tl).reduce((s, d) => s + (parseFloat(d.mortality || 0)), 0);
    const tankCycles = cycles[tank.id] || [];
    function handleClose() {
        const sold = parseInt(form.soldFish) || 0;
        const weight = parseFloat(form.avgFinalWeight) || 0;
        const price = parseFloat(form.pricePerKg) || 0;
        const revenue = sold * weight * price;
        const profit = revenue - totalExp;
        const record = {
            id: genId(), tankId: tank.id, tankName: tank.name, closedAt: form.harvestDate,
            species: tank.species, finalFish: sold, mortality: totalMort,
            avgFinalWeightG: weight * 1000, pricePerKg: price, revenue, totalExpenses: totalExp, profit,
            margin: revenue > 0 ? (profit / revenue * 100).toFixed(1) : "—",
            totalFeedKg: totalFedKg, obs: form.obs,
        };
        setCycles(prev => ({ ...prev, [tank.id]: [...(prev[tank.id] || []), record] }));
        alert(`✅ Ciclo fechado! Lucro: ${fmtBRL(profit)}`);
    }
    return (React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 14 } },
        React.createElement("div", { className: "card", style: { padding: 18 } },
            React.createElement("div", { className: "section-hdr" }, "\uD83D\uDCCA Resumo do Ciclo Atual"),
            React.createElement("div", { className: "grid4" }, [
                { ico: "__LOGO__", val: (tank.fishCount || 0).toLocaleString("pt-BR"), lbl: "Peixes" },
                { ico: "⚖️", val: `${biomassKg.toFixed(1)} kg`, lbl: "Biomassa" },
                { ico: "🍽️", val: sacosLabel(totalFedKg), lbl: "Ração total" },
                { ico: "💀", val: totalMort.toLocaleString("pt-BR"), lbl: "Mortalidade" },
                { ico: "💸", val: fmtBRL(totalExp), lbl: "Custo total" },
                { ico: "📅", val: Object.keys(tl).length + " dias", lbl: "Dias monitorados" },
            ].map(k => (React.createElement("div", { key: k.lbl, className: "card kpi" },
                k.ico === "__LOGO__" ? React.createElement("img", { src: "/icon.png", style: { width: 22, height: 22, objectFit: "cover", borderRadius: 4, display: "inline-block" } }) : React.createElement("div", { className: "ico" }, k.ico),
                React.createElement("div", { className: "val", style: { fontSize: 14 } }, k.val),
                React.createElement("div", { className: "lbl" }, k.lbl)))))),
        React.createElement("div", { className: "card", style: { padding: 18 } },
            React.createElement("div", { className: "section-hdr" }, "\uD83C\uDFC1 Fechar Ciclo / Registrar Despesca"),
            React.createElement("div", { className: "grid2", style: { marginBottom: 14 } },
                React.createElement("div", null,
                    React.createElement("lbl", null, "Data da Despesca"),
                    React.createElement("input", { type: "date", className: "inp", value: form.harvestDate, onChange: e => setForm(p => ({ ...p, harvestDate: e.target.value })) })),
                React.createElement("div", null,
                    React.createElement("lbl", null, "Peixes Vendidos"),
                    React.createElement("input", { className: "inp", type: "number", value: form.soldFish, onChange: e => setForm(p => ({ ...p, soldFish: e.target.value })) })),
                React.createElement("div", null,
                    React.createElement("lbl", null, "Peso M\u00E9dio Final (kg)"),
                    React.createElement("input", { className: "inp", type: "number", step: "0.1", placeholder: "ex: 1.4", value: form.avgFinalWeight, onChange: e => setForm(p => ({ ...p, avgFinalWeight: e.target.value })) })),
                React.createElement("div", null,
                    React.createElement("lbl", null, "Pre\u00E7o de Venda (R$/kg)"),
                    React.createElement("input", { className: "inp", type: "number", step: "0.5", value: form.pricePerKg, onChange: e => setForm(p => ({ ...p, pricePerKg: e.target.value })) }))),
            React.createElement("button", { className: "btn btn-p", style: { width: "100%", padding: 12 }, onClick: handleClose }, "\uD83C\uDFC1 Fechar Ciclo"))));
}

// ═══════════════════════════════════════════════════════════════════════════════
// PARAMS TAB
// ═══════════════════════════════════════════════════════════════════════════════
function ParamsTab({ sp, phase, tank }) {
    var _a;
    const sColors = { ok: "var(--green)", warn: "var(--yellow)", danger: "var(--red)" };
    const params = [
        { l: "O₂ Mínimo p/ Alimentar", v: `${sp === null || sp === void 0 ? void 0 : sp.minO2} mg/L`, s: "danger" },
        { l: "O₂ Ideal", v: `${sp === null || sp === void 0 ? void 0 : sp.idealO2} mg/L`, s: "ok" },
        { l: "Temp. Mínima", v: `${sp === null || sp === void 0 ? void 0 : sp.minTemp}°C`, s: "warn" },
        { l: "Temp. Ideal", v: `${sp === null || sp === void 0 ? void 0 : sp.idealTemp}°C`, s: "ok" },
        { l: "Temp. Máxima", v: `${sp === null || sp === void 0 ? void 0 : sp.maxTemp}°C`, s: "warn" },
        { l: "pH", v: `${sp === null || sp === void 0 ? void 0 : sp.phMin}–${sp === null || sp === void 0 ? void 0 : sp.phMax}`, s: "ok" },
        { l: "Densidade Máxima", v: `${sp === null || sp === void 0 ? void 0 : sp.densityPerM2} peixe/m²`, s: "ok" },
        { l: "Profundidade Ideal", v: `${sp === null || sp === void 0 ? void 0 : sp.idealDepthM} m`, s: "ok" },
    ];
    return (React.createElement("div", { className: "grid2" },
        React.createElement("div", { className: "card", style: { padding: 18 } },
            React.createElement("div", { className: "section-hdr" }, "Par\u00E2metros \u2014 ", sp === null || sp === void 0 ? void 0 : sp.name),
            params.map(p => (React.createElement("div", { key: p.l, style: { background: "rgba(255,255,255,0.025)", borderRadius: 9, padding: "10px 13px", borderLeft: `3px solid ${sColors[p.s]}`, marginBottom: 8 } },
                React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center" } },
                    React.createElement("span", { style: { fontSize: 12, color: "var(--muted)" } }, p.l),
                    React.createElement("span", { style: { fontSize: 14, fontWeight: 700, fontFamily: "var(--mono)", color: sColors[p.s] } }, p.v)))))),
        React.createElement("div", { className: "card", style: { padding: 18 } },
            React.createElement("div", { className: "section-hdr" }, "Fase Atual \u2014 ", phase === null || phase === void 0 ? void 0 : phase.name),
            [
                { l: "Faixa de Peso", v: `${phase === null || phase === void 0 ? void 0 : phase.minW}g – ${phase === null || phase === void 0 ? void 0 : phase.maxW}g` },
                { l: "% Arraçoamento", v: `${((phase === null || phase === void 0 ? void 0 : phase.pct) * 100).toFixed(1)}%` },
                { l: "Frequência", v: `${phase === null || phase === void 0 ? void 0 : phase.freq}x ao dia` },
                { l: "FCR Meta", v: FCR_META[tank.species] },
                { l: "Proteína Ração", v: `${phase === null || phase === void 0 ? void 0 : phase.protPct}%` },
                { l: "Área", v: `${tank.areaM2} m²` },
                { l: "Cap. recomendada", v: `${calcCapacity(tank.species, tank.areaM2, tank.depth || 1.5).ideal.toLocaleString("pt-BR")} peixes` },
            ].map(i => (React.createElement("div", { key: i.l, style: { display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--border)", fontSize: 13 } },
                React.createElement("span", { style: { color: "var(--muted)" } }, i.l),
                React.createElement("span", { style: { fontFamily: "var(--mono)", fontWeight: 600 } }, i.v)))))));
}


// ═══════════════════════════════════════════════════════════════════════════════
// TANK MODAL
// ═══════════════════════════════════════════════════════════════════════════════
function UnitToggle({ category, value, onChange }) {
    const opts = UNITS_DEF[category] || {};
    return (React.createElement("div", { style: { display: "flex", gap: 4 } },
        Object.entries(opts).map(([k, u]) => (React.createElement("button", { key: k, onClick: () => onChange(k),
            style: { padding: "3px 10px", borderRadius: 6, cursor: "pointer", fontFamily: "var(--font)", fontWeight: 600, fontSize: 11, border: "1px solid", transition: "all .15s",
                background: value === k ? "var(--accent)" : "rgba(255,255,255,0.05)",
                borderColor: value === k ? "var(--accent)" : "var(--border2)",
                color: value === k ? "#fff" : "var(--muted)" } }, u.label)))));
}

function TankModal({ mode, tank, onClose }) {
    var _a, _b, _c;
    const { addTank, updateTank, units, setUnits } = useApp();
    const def = tank || {};
    const aUnit = units.area;
    const dUnit = units.depth;
    const wUnit = units.weight;
    const [form, setForm] = (0, useState)({
        name: def.name || "",
        species: def.species || "matrinxa",
        areaDisp: def.areaM2 ? fromBase(def.areaM2, "area", aUnit).toFixed(4).replace(/\.?0+$/, "") : "",
        depthDisp: def.depth ? fromBase(def.depth, "depth", dUnit).toFixed(2).replace(/\.?0+$/, "") : "1.5",
        weightDisp: def.avgWeightG ? fromBase(def.avgWeightG, "weight", wUnit).toFixed(1) : "50",
        fishCount: def.fishCount || "",
        pricePerKg: def.pricePerKg || 21,
        targetWeightKg: def.targetWeightKg || "",
    });
    const sp = SP[form.species];
    const areaBase = toBase(parseFloat(form.areaDisp) || 0, "area", aUnit);
    const depthBase = toBase(parseFloat(form.depthDisp) || 0, "depth", dUnit);
    const weightBase = toBase(parseFloat(form.weightDisp) || 0, "weight", wUnit);
    const idealFish = areaBase > 0 ? Math.floor(areaBase * ((sp === null || sp === void 0 ? void 0 : sp.densityPerM2) || 2.5)) : null;
    const volM3 = areaBase > 0 ? areaBase * depthBase : null;

    function changeAreaUnit(u) { setUnits(prev => ({ ...prev, area: u })); if (form.areaDisp) setForm(p => ({ ...p, areaDisp: fromBase(areaBase, "area", u).toFixed(4).replace(/\.?0+$/, "") })); }
    function changeDepthUnit(u) { setUnits(prev => ({ ...prev, depth: u })); if (form.depthDisp) setForm(p => ({ ...p, depthDisp: fromBase(depthBase, "depth", u).toFixed(2).replace(/\.?0+$/, "") })); }
    function changeWeightUnit(u) { setUnits(prev => ({ ...prev, weight: u })); if (form.weightDisp) setForm(p => ({ ...p, weightDisp: fromBase(weightBase, "weight", u).toFixed(2).replace(/\.?0+$/, "") })); }

    function handleSubmit() {
        if (!form.name || !form.areaDisp) return alert("Preencha nome e área.");
        const data = {
            ...(tank || {}),
            id: (tank === null || tank === void 0 ? void 0 : tank.id) || genId(),
            name: form.name, species: form.species,
            areaM2: areaBase, depth: depthBase, volumeM3: volM3 || 0,
            fishCount: parseInt(form.fishCount) || idealFish || 0,
            avgWeightG: weightBase || 50,
            pricePerKg: parseFloat(form.pricePerKg) || 21,
            targetWeightKg: parseFloat(form.targetWeightKg) || 0,
            createdAt: (tank === null || tank === void 0 ? void 0 : tank.createdAt) || today(),
        };
        mode === "new" ? addTank(data) : updateTank(data);
        onClose();
    }

    const aLabel = ((_a = UNITS_DEF.area[aUnit]) === null || _a === void 0 ? void 0 : _a.label) || "m²";
    const dLabel = ((_b = UNITS_DEF.depth[dUnit]) === null || _b === void 0 ? void 0 : _b.label) || "m";
    const wLabel = ((_c = UNITS_DEF.weight[wUnit]) === null || _c === void 0 ? void 0 : _c.label) || "g";

    return (React.createElement("div", { style: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(10px)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, overflowY: "auto" } },
        React.createElement("div", { className: "card slide", style: { width: "100%", maxWidth: 500, padding: 22, maxHeight: "92vh", overflowY: "auto", margin: "auto" } },
            React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 } },
                React.createElement("h2", { style: { fontWeight: 700, fontSize: 18 } }, mode === "new" ? "Novo Tanque" : "Editar Tanque"),
                React.createElement("button", { onClick: onClose, style: { background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: 20 } }, "\u2715")),
            React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 13 } },
                React.createElement("div", null,
                    React.createElement("lbl", null, "Nome"),
                    React.createElement("input", { className: "inp", placeholder: "ex: Tanque A1", value: form.name, onChange: e => setForm(p => ({ ...p, name: e.target.value })) })),
                React.createElement("div", null,
                    React.createElement("lbl", null, "Esp\u00E9cie"),
                    React.createElement("select", { className: "inp", value: form.species, onChange: e => setForm(p => ({ ...p, species: e.target.value })) },
                        Object.entries(SP).map(([k, v]) => React.createElement("option", { key: k, value: k }, v.icon, " ", v.name)))),
                React.createElement("div", null,
                    React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 } },
                        React.createElement("lbl", { style: { margin: 0 } }, "\u00C1rea (", aLabel, ")"),
                        React.createElement(UnitToggle, { category: "area", value: aUnit, onChange: changeAreaUnit })),
                    React.createElement("input", { className: "inp", type: "number", step: "any", placeholder: aUnit === "ha" ? "ex: 0.05" : "ex: 500", value: form.areaDisp, onChange: e => setForm(p => ({ ...p, areaDisp: e.target.value })) })),
                React.createElement("div", null,
                    React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 } },
                        React.createElement("lbl", { style: { margin: 0 } }, "Profundidade (", dLabel, ")"),
                        React.createElement(UnitToggle, { category: "depth", value: dUnit, onChange: changeDepthUnit })),
                    React.createElement("input", { className: "inp", type: "number", step: "any", placeholder: dUnit === "cm" ? "150" : "1.5", value: form.depthDisp, onChange: e => setForm(p => ({ ...p, depthDisp: e.target.value })) })),
                areaBase > 0 && (() => {
                    const cap = calcCapacity(form.species, areaBase, depthBase);
                    const dStat = depthStatus(depthBase);
                    return (React.createElement("div", { style: { background: `${sp === null || sp === void 0 ? void 0 : sp.color}11`, border: `1px solid ${sp === null || sp === void 0 ? void 0 : sp.color}33`, borderRadius: 10, padding: 13 } },
                        React.createElement("div", { style: { fontSize: 11, fontWeight: 700, color: sp === null || sp === void 0 ? void 0 : sp.color, textTransform: "uppercase", marginBottom: 9 } }, "\uD83D\uDCD0 Capacidade Real"),
                        React.createElement("div", { style: { display: "flex", justifyContent: "space-between", fontSize: 13 } },
                            React.createElement("span", { style: { color: "var(--muted)" } }, "Qtd. Recomendada"),
                            React.createElement("span", { style: { fontFamily: "var(--mono)", fontWeight: 700, color: "var(--green)" } }, cap.ideal.toLocaleString("pt-BR"), " peixes")),
                        React.createElement("div", { style: { fontSize: 11, color: dStat.color, marginTop: 6, fontWeight: 600 } }, dStat.label)));
                })(),
                (() => {
                    const cap = calcCapacity(form.species, areaBase, depthBase);
                    return (React.createElement("div", { className: "grid2" },
                        React.createElement("div", null,
                            React.createElement("lbl", null, "Qtd. Peixes", cap.ideal ? ` (rec: ${cap.ideal.toLocaleString("pt-BR")})` : ""),
                            React.createElement("input", { className: "inp", type: "number", placeholder: cap.ideal || "Qtd", value: form.fishCount, onChange: e => setForm(p => ({ ...p, fishCount: e.target.value })) })),
                        React.createElement("div", null,
                            React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 } },
                                React.createElement("lbl", { style: { margin: 0 } }, "Peso M\u00E9dio (", wLabel, ")"),
                                React.createElement(UnitToggle, { category: "weight", value: wUnit, onChange: changeWeightUnit })),
                            React.createElement("input", { className: "inp", type: "number", step: "any", value: form.weightDisp, onChange: e => setForm(p => ({ ...p, weightDisp: e.target.value })) }))));
                })(),
                React.createElement("div", null,
                    React.createElement("lbl", null, "Pre\u00E7o de Venda Esperado (R$/kg)"),
                    React.createElement("input", { className: "inp", type: "number", step: "0.5", value: form.pricePerKg, onChange: e => setForm(p => ({ ...p, pricePerKg: e.target.value })) })),
                React.createElement("button", { className: "btn btn-p", style: { padding: 13, fontSize: 14 }, onClick: handleSubmit }, mode === "new" ? "✅ Criar Tanque" : "✅ Salvar Alterações")))));
}

// ═══════════════════════════════════════════════════════════════════════════════
// SETTINGS MODAL
// ═══════════════════════════════════════════════════════════════════════════════
function SettingsModal({ onClose }) {
    const { units, setUnits, notifPerm, requestNotif, waterTimes, setWaterTimes } = useApp();
    return (React.createElement("div", { style: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(10px)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 } },
        React.createElement("div", { className: "card slide", style: { width: "100%", maxWidth: 480, padding: 26, maxHeight: "90vh", overflowY: "auto" } },
            React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22 } },
                React.createElement("h2", { style: { fontWeight: 700, fontSize: 18 } }, "\u2699\uFE0F Configura\u00E7\u00F5es"),
                React.createElement("button", { onClick: onClose, style: { background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: 20 } }, "\u2715")),
            React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 16 } },
                React.createElement("div", { className: "section-hdr" }, "Unidades de Medida"),
                [
                    { cat: "area", label: "📐 Área", opts: { "m2": "m²", "ha": "ha" } },
                    { cat: "depth", label: "🌊 Profundidade", opts: { "m": "m", "cm": "cm" } },
                    { cat: "weight", label: "⚖️ Peso dos peixes", opts: { "g": "g", "kg": "kg" } },
                ].map(g => (React.createElement("div", { key: g.cat, style: { background: "rgba(255,255,255,0.025)", borderRadius: 10, padding: "14px 16px" } },
                    React.createElement("div", { style: { fontSize: 13, fontWeight: 600, marginBottom: 10 } }, g.label),
                    React.createElement("div", { style: { display: "flex", gap: 6 } },
                        Object.entries(g.opts).map(([k, label]) => (React.createElement("button", { key: k, className: `tab-btn ${units[g.cat] === k ? "active" : ""}`, style: { padding: "5px 14px", fontSize: 12 }, onClick: () => setUnits(u => ({ ...u, [g.cat]: k })) }, label))))))),
                React.createElement("div", { className: "section-hdr", style: { marginTop: 8 } }, "Hor\u00E1rios de Leitura de \u00C1gua"),
                React.createElement("div", { style: { background: "rgba(255,255,255,0.025)", borderRadius: 10, padding: "14px 16px" } },
                    React.createElement("div", { style: { fontSize: 13, fontWeight: 600, marginBottom: 12 } }, "\uD83D\uDCA7 3 leituras di\u00E1rias de O\u2082"),
                    React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 } },
                        ["🌅 Manhã", "☀️ Tarde", "🌙 Noite"].map((label, i) => (React.createElement("div", { key: i },
                            React.createElement("lbl", null, label),
                            React.createElement("input", { type: "time", className: "inp", style: { marginTop: 4, textAlign: "center", fontFamily: "var(--mono)" }, value: waterTimes[i], onChange: e => { const next = [...waterTimes]; next[i] = e.target.value; setWaterTimes(next); } })))))),
                React.createElement("div", { style: { background: "rgba(255,255,255,0.025)", borderRadius: 10, padding: "14px 16px" } },
                    React.createElement("div", { style: { fontSize: 13, fontWeight: 600, marginBottom: 4 } }, "\uD83D\uDD14 Notifica\u00E7\u00F5es"),
                    notifPerm === "granted" ?
                        React.createElement("div", { style: { color: "var(--green)", fontSize: 13, fontWeight: 600 } }, "\u2705 Notifica\u00E7\u00F5es ativas") :
                        React.createElement("button", { className: "btn btn-p", onClick: requestNotif }, "Ativar Notifica\u00E7\u00F5es")),
                React.createElement("button", { className: "btn btn-p", style: { marginTop: 8, padding: 13 }, onClick: onClose }, "\u2705 Fechar")))));
}

// ═══════════════════════════════════════════════════════════════════════════════
// STOCK IN MODAL (simplificado — funcional)
// ═══════════════════════════════════════════════════════════════════════════════
function StockInModal({ onClose }) {
    const { addStockIn } = useApp();
    const [form, setForm] = (0, useState)({ date: today(), supplier: "", nfNumber: "", feedType: "", feedBrand: "", proteinPct: "", bags: "", costPerBag: "", totalValue: "", payMethod: "PIX", obs: "" });
    const [confirmed, setConfirmed] = (0, useState)(false);
    const bags = parseInt(form.bags) || 0;
    const cpp = parseFloat(form.costPerBag) || 0;
    const total = form.totalValue ? parseFloat(form.totalValue) : bags * cpp;

    function handleField(k, v) { setForm(p => ({ ...p, [k]: v })); }
    function handleTotal(v) { setForm(p => { const b = parseInt(p.bags) || 0; const t = parseFloat(v) || 0; return { ...p, totalValue: v, costPerBag: b > 0 && t > 0 ? (t / b).toFixed(2) : p.costPerBag }; }); }
    function handleBags(v) { setForm(p => { const b = parseInt(v) || 0; const t = parseFloat(p.totalValue) || 0; return { ...p, bags: v, costPerBag: b > 0 && t > 0 ? (t / b).toFixed(2) : p.costPerBag }; }); }
    function handleConfirm() {
        if (!bags || !cpp) return alert("Preencha pelo menos sacos e custo por saco.");
        if (!form.supplier) return alert("Informe o fornecedor.");
        addStockIn({ ...form, bags, costPerBag: cpp, totalValue: total, source: "manual" });
        setConfirmed(true);
    }

    if (confirmed) return (React.createElement("div", { style: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(10px)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 } },
        React.createElement("div", { className: "card slide", style: { width: "100%", maxWidth: 420, padding: 32, textAlign: "center" } },
            React.createElement("div", { style: { fontSize: 52, marginBottom: 16 } }, "\u2705"),
            React.createElement("h2", { style: { fontWeight: 700, fontSize: 20, marginBottom: 8 } }, "Estoque Atualizado!"),
            React.createElement("div", { style: { fontFamily: "var(--mono)", fontSize: 24, color: "var(--green)", fontWeight: 700, marginBottom: 6 } }, bags, " sacos"),
            React.createElement("div", { style: { color: "var(--muted)", fontSize: 14, marginBottom: 20 } }, "Total da compra: ", React.createElement("strong", { style: { color: "var(--text)" } }, fmtBRL(total))),
            React.createElement("button", { className: "btn btn-p", style: { width: "100%", padding: 12 }, onClick: onClose }, "Fechar"))));

    return (React.createElement("div", { style: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(10px)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, overflowY: "auto" } },
        React.createElement("div", { className: "card slide", style: { width: "100%", maxWidth: 560, padding: 26, maxHeight: "92vh", overflowY: "auto", margin: "auto" } },
            React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 } },
                React.createElement("h2", { style: { fontWeight: 700, fontSize: 18 } }, "\uD83D\uDCE5 Entrada de Ra\u00E7\u00E3o"),
                React.createElement("button", { onClick: onClose, style: { background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: 20 } }, "\u2715")),
            React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 14 } },
                React.createElement("div", { className: "grid2" },
                    React.createElement("div", null,
                        React.createElement("lbl", null, "Data da Nota Fiscal"),
                        React.createElement("input", { type: "date", className: "inp", value: form.date, onChange: e => handleField("date", e.target.value) })),
                    React.createElement("div", null,
                        React.createElement("lbl", null, "N\u00FAmero da NF"),
                        React.createElement("input", { className: "inp", placeholder: "ex: 000125", value: form.nfNumber, onChange: e => handleField("nfNumber", e.target.value) }))),
                React.createElement("div", null,
                    React.createElement("lbl", null, "Fornecedor *"),
                    React.createElement("input", { className: "inp", placeholder: "Nome da empresa fornecedora", value: form.supplier, onChange: e => handleField("supplier", e.target.value) })),
                React.createElement("div", { className: "grid2" },
                    React.createElement("div", null,
                        React.createElement("lbl", null, "Tipo de Ra\u00E7\u00E3o"),
                        React.createElement("select", { className: "inp", value: form.feedType, onChange: e => handleField("feedType", e.target.value) },
                            React.createElement("option", { value: "" }, "Selecione..."),
                            React.createElement("option", null, "Extrusada flutuante"),
                            React.createElement("option", null, "Extrusada micro (alevino)"),
                            React.createElement("option", null, "Peletizada"))),
                    React.createElement("div", null,
                        React.createElement("lbl", null, "% Prote\u00EDna"),
                        React.createElement("select", { className: "inp", value: form.proteinPct, onChange: e => handleField("proteinPct", e.target.value) },
                            React.createElement("option", { value: "" }, "Selecione..."),
                            React.createElement("option", null, "45%"), React.createElement("option", null, "40%"),
                            React.createElement("option", null, "36%"), React.createElement("option", null, "32%"),
                            React.createElement("option", null, "28%")))),
                React.createElement("div", { style: { background: "rgba(255,255,255,0.025)", borderRadius: 10, padding: "14px 16px" } },
                    React.createElement("div", { style: { fontSize: 12, fontWeight: 600, color: "var(--accent)", marginBottom: 12 } }, "\uD83D\uDCB0 Valores"),
                    React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 } },
                        React.createElement("div", null,
                            React.createElement("lbl", null, "Sacos (25kg) *"),
                            React.createElement("input", { className: "inp", type: "number", placeholder: "ex: 200", value: form.bags, onChange: e => handleBags(e.target.value) })),
                        React.createElement("div", null,
                            React.createElement("lbl", null, "Valor Total (R$)"),
                            React.createElement("input", { className: "inp", type: "number", step: "0.01", placeholder: "ex: 20000", value: form.totalValue, onChange: e => handleTotal(e.target.value) })),
                        React.createElement("div", null,
                            React.createElement("lbl", null, "R$/saco"),
                            React.createElement("input", { className: "inp", type: "number", step: "0.01", placeholder: "calculado", value: form.costPerBag, onChange: e => handleField("costPerBag", e.target.value) })))),
                React.createElement("div", { className: "grid2" },
                    React.createElement("div", null,
                        React.createElement("lbl", null, "Forma de Pagamento"),
                        React.createElement("select", { className: "inp", value: form.payMethod, onChange: e => handleField("payMethod", e.target.value) },
                            React.createElement("option", null, "PIX"), React.createElement("option", null, "\u00C0 vista"),
                            React.createElement("option", null, "Boleto 30d"), React.createElement("option", null, "Boleto 60d"),
                            React.createElement("option", null, "Cart\u00E3o"), React.createElement("option", null, "Transfer\u00EAncia"))),
                    React.createElement("div", null,
                        React.createElement("lbl", null, "Observa\u00E7\u00F5es"),
                        React.createElement("input", { className: "inp", placeholder: "opcional", value: form.obs, onChange: e => handleField("obs", e.target.value) }))),
                bags > 0 && cpp > 0 && (React.createElement("div", { style: { background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.25)", borderRadius: 10, padding: "12px 14px" } },
                    React.createElement("div", { style: { fontSize: 11, fontWeight: 700, color: "var(--green)", marginBottom: 8 } }, "Resumo"),
                    React.createElement("div", { style: { display: "flex", gap: 16, fontSize: 13 } },
                        React.createElement("span", null, React.createElement("strong", null, bags), " sacos \u00B7 ", bags * 25, " kg"),
                        React.createElement("span", null, "Total: ", React.createElement("strong", null, fmtBRL(total)))))),
                React.createElement("button", { className: "btn btn-p", style: { padding: 13, fontSize: 14 }, onClick: handleConfirm }, "\u2705 Confirmar Entrada no Estoque")))));
}

// ═══════════════════════════════════════════════════════════════════════════════
// FINANCEIRO MODAL
// ═══════════════════════════════════════════════════════════════════════════════
const CAPEX_CATS = ["Gerador","Transformador","Infraestrutura Elétrica","Aeradores","Botes e Rabetas","Sistema de Câmeras","Reforma Casa Caseiro","Roçadeiras","Máquinas e Equipamentos","Outros CAPEX"];
const OPEX_CATS = ["Energia Elétrica","Salário Caseiro","Salário Técnico","Aluguel Tanques","Assistência Técnica","Manutenção","Combustível","Medicamentos","Outros OPEX"];

function FinanceiroModal({ onClose }) {
    const { capex, setCapex, opexG, setOpexG, tanks, expenses } = useApp();
    const [tab, setTab] = (0, useState)("capex");
    const [form, setForm] = (0, useState)({ date: today(), cat: "", desc: "", amount: "", tankId: "", type: "geral" });
    const tabs = [{ id: "capex", label: "🏗️ CAPEX" }, { id: "opex", label: "📊 OPEX Geral" }, { id: "resumo", label: "💰 Resumo" }];
    const totalCapex = capex.reduce((s, e) => s + (e.amount || 0), 0);
    const totalOpexG = opexG.reduce((s, e) => s + (e.amount || 0), 0);
    const totalExpTanks = Object.values(expenses || {}).flat().reduce((s, e) => s + (e.amount || 0), 0);

    function addCapex() {
        if (!form.amount || !form.cat) return alert("Preencha categoria e valor.");
        const newCapex = [...capex, { ...form, id: genId(), amount: parseFloat(form.amount) }];
        setCapex(newCapex);
        setForm(p => ({ ...p, desc: "", amount: "", cat: "" }));
    }
    function addOpex() {
        if (!form.amount || !form.cat) return alert("Preencha categoria e valor.");
        const newOpex = [...opexG, { ...form, id: genId(), amount: parseFloat(form.amount) }];
        setOpexG(newOpex);
        setForm(p => ({ ...p, desc: "", amount: "", cat: "" }));
    }
    function delCapex(id) { setCapex(capex.filter(e => e.id !== id)); }
    function delOpex(id) { setOpexG(opexG.filter(e => e.id !== id)); }

    return (React.createElement("div", { style: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", backdropFilter: "blur(12px)", zIndex: 200, display: "flex", flexDirection: "column" } },
        React.createElement("div", { style: { padding: "14px 18px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 12, background: "var(--dark)" } },
            React.createElement("span", { style: { fontSize: 22 } }, "\uD83D\uDCB0"),
            React.createElement("div", null,
                React.createElement("div", { style: { fontWeight: 800, fontSize: 17 } }, "Financeiro da Fazenda"),
                React.createElement("div", { style: { fontSize: 11, color: "var(--muted)" } }, "CAPEX \u00B7 OPEX Geral")),
            React.createElement("div", { style: { flex: 1 } }),
            React.createElement("button", { onClick: onClose, style: { background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: 22 } }, "\u2715")),
        React.createElement("div", { style: { display: "flex", gap: 4, padding: "10px 14px", borderBottom: "1px solid var(--border)", background: "var(--dark)" } },
            tabs.map(t => (React.createElement("button", { key: t.id, className: `tab-btn ${tab === t.id ? "active" : ""}`, style: { flex: 1, fontSize: 11, padding: "7px 4px" }, onClick: () => setTab(t.id) }, t.label)))),
        React.createElement("div", { style: { flex: 1, overflowY: "auto", padding: 16 } },
            tab === "capex" && (React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 14 } },
                React.createElement("div", { className: "card", style: { padding: 16 } },
                    React.createElement("div", { className: "section-hdr" }, "+ Novo CAPEX"),
                    React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 10 } },
                        React.createElement("div", { className: "grid2" },
                            React.createElement("div", null,
                                React.createElement("lbl", null, "Data"),
                                React.createElement("input", { type: "date", className: "inp", value: form.date, onChange: e => setForm(p => ({ ...p, date: e.target.value })) })),
                            React.createElement("div", null,
                                React.createElement("lbl", null, "Categoria"),
                                React.createElement("select", { className: "inp", value: form.cat, onChange: e => setForm(p => ({ ...p, cat: e.target.value })) },
                                    React.createElement("option", { value: "" }, "Selecione..."),
                                    CAPEX_CATS.map(c => React.createElement("option", { key: c }, c))))),
                        React.createElement("div", null,
                            React.createElement("lbl", null, "Descri\u00E7\u00E3o"),
                            React.createElement("input", { className: "inp", placeholder: "ex: Gerador 107KVA", value: form.desc, onChange: e => setForm(p => ({ ...p, desc: e.target.value })) })),
                        React.createElement("div", null,
                            React.createElement("lbl", null, "Valor (R$)"),
                            React.createElement("input", { className: "inp", type: "number", step: "0.01", value: form.amount, onChange: e => setForm(p => ({ ...p, amount: e.target.value })) })),
                        React.createElement("button", { className: "btn btn-p", onClick: addCapex }, "+ Adicionar CAPEX"))),
                React.createElement("div", { className: "card", style: { padding: 14, background: "rgba(14,165,233,0.06)", borderColor: "rgba(14,165,233,0.2)" } },
                    React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center" } },
                        React.createElement("span", { style: { fontSize: 13, color: "var(--muted)" } }, "Total CAPEX"),
                        React.createElement("span", { style: { fontFamily: "var(--mono)", fontSize: 20, fontWeight: 800, color: "var(--accent)" } }, fmtBRL(totalCapex)))),
                capex.map(e => (React.createElement("div", { key: e.id, className: "card", style: { padding: "12px 14px", display: "flex", alignItems: "center", gap: 10 } },
                    React.createElement("div", { style: { flex: 1 } },
                        React.createElement("div", { style: { fontSize: 12, fontWeight: 600 } }, e.desc || e.cat),
                        React.createElement("div", { style: { fontSize: 11, color: "var(--muted)" } }, e.date, " \u00B7 ", e.cat)),
                    React.createElement("span", { style: { fontFamily: "var(--mono)", fontSize: 13, fontWeight: 700 } }, fmtBRL(e.amount)),
                    React.createElement("button", { onClick: () => delCapex(e.id), style: { background: "none", border: "none", color: "var(--red)", cursor: "pointer", fontSize: 14 } }, "\u2715")))))),
            tab === "opex" && (React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 14 } },
                React.createElement("div", { className: "card", style: { padding: 16 } },
                    React.createElement("div", { className: "section-hdr" }, "+ Novo OPEX Geral"),
                    React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 10 } },
                        React.createElement("div", { className: "grid2" },
                            React.createElement("div", null,
                                React.createElement("lbl", null, "Data"),
                                React.createElement("input", { type: "date", className: "inp", value: form.date, onChange: e => setForm(p => ({ ...p, date: e.target.value })) })),
                            React.createElement("div", null,
                                React.createElement("lbl", null, "Categoria"),
                                React.createElement("select", { className: "inp", value: form.cat, onChange: e => setForm(p => ({ ...p, cat: e.target.value })) },
                                    React.createElement("option", { value: "" }, "Selecione..."),
                                    OPEX_CATS.map(c => React.createElement("option", { key: c }, c))))),
                        React.createElement("div", { className: "grid2" },
                            React.createElement("div", null,
                                React.createElement("lbl", null, "Descri\u00E7\u00E3o"),
                                React.createElement("input", { className: "inp", placeholder: "ex: Conta de energia", value: form.desc, onChange: e => setForm(p => ({ ...p, desc: e.target.value })) })),
                            React.createElement("div", null,
                                React.createElement("lbl", null, "Valor (R$)"),
                                React.createElement("input", { className: "inp", type: "number", step: "0.01", value: form.amount, onChange: e => setForm(p => ({ ...p, amount: e.target.value })) }))),
                        React.createElement("button", { className: "btn btn-p", onClick: addOpex }, "+ Adicionar OPEX"))),
                React.createElement("div", { className: "card", style: { padding: 14, background: "rgba(245,158,11,0.06)", borderColor: "rgba(245,158,11,0.2)" } },
                    React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center" } },
                        React.createElement("span", { style: { fontSize: 13, color: "var(--muted)" } }, "Total OPEX Geral"),
                        React.createElement("span", { style: { fontFamily: "var(--mono)", fontSize: 20, fontWeight: 800, color: "var(--yellow)" } }, fmtBRL(totalOpexG)))),
                opexG.map(e => (React.createElement("div", { key: e.id, className: "card", style: { padding: "12px 14px", display: "flex", alignItems: "center", gap: 10 } },
                    React.createElement("div", { style: { flex: 1 } },
                        React.createElement("div", { style: { fontSize: 12, fontWeight: 600 } }, e.desc || e.cat),
                        React.createElement("div", { style: { fontSize: 11, color: "var(--muted)" } }, e.date, " \u00B7 ", e.cat)),
                    React.createElement("span", { style: { fontFamily: "var(--mono)", fontSize: 13, fontWeight: 700 } }, fmtBRL(e.amount)),
                    React.createElement("button", { onClick: () => delOpex(e.id), style: { background: "none", border: "none", color: "var(--red)", cursor: "pointer", fontSize: 14 } }, "\u2715")))))),
            tab === "resumo" && (React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 14 } },
                [
                    { label: "Total CAPEX investido", value: totalCapex, color: "var(--accent)", ico: "🏗️" },
                    { label: "OPEX Geral acumulado", value: totalOpexG, color: "var(--yellow)", ico: "📊" },
                    { label: "Despesas por tanque", value: totalExpTanks, color: "var(--yellow)", ico: "🏊" },
                    { label: "Total investido (CAPEX+OPEX)", value: totalCapex + totalOpexG + totalExpTanks, color: "var(--red)", ico: "📉", bold: true },
                ].map(k => (React.createElement("div", { key: k.label, className: "card", style: { padding: "14px 16px", display: "flex", alignItems: "center", gap: 14 } },
                    React.createElement("span", { style: { fontSize: 24 } }, k.ico),
                    React.createElement("div", { style: { flex: 1 } }, React.createElement("div", { style: { fontSize: 12, color: "var(--muted)" } }, k.label)),
                    React.createElement("span", { style: { fontFamily: "var(--mono)", fontSize: k.bold ? 20 : 16, fontWeight: k.bold ? 800 : 700, color: k.color } }, fmtBRL(k.value))))))))));
}

// ═══════════════════════════════════════════════════════════════════════════════
// RELATÓRIOS MODAL
// ═══════════════════════════════════════════════════════════════════════════════
function RelatoriosModal({ onClose }) {
    var _a;
    const { tanks, logs, expenses, capex, opexG, stock, cycles } = useApp();
    const [tankSel, setTankSel] = (0, useState)(((_a = tanks[0]) === null || _a === void 0 ? void 0 : _a.id) || "");
    const selTank = tanks.find(t => t.id === tankSel);
    const tl = logs[tankSel] || {};
    const tankExp = expenses[tankSel] || [];
    const allDays = Object.entries(tl).sort(([a], [b]) => a > b ? 1 : -1);
    const totalFedKg = allDays.reduce((s, [, d]) => s + (d.feedGivenKg || 0), 0);
    const totalMort = allDays.reduce((s, [, d]) => s + (parseFloat(d.mortality || 0)), 0);
    const totalExpTank = tankExp.reduce((s, e) => s + (e.amount || 0), 0);
    const biomassKg = (((selTank === null || selTank === void 0 ? void 0 : selTank.fishCount) || 0) * ((selTank === null || selTank === void 0 ? void 0 : selTank.avgWeightG) || 0)) / 1000;

    function downloadCSV(rows, filename) {
        const csv = rows.map(r => r.map(c => `"${String(c || "").replace(/"/g, '""')}"`).join(",")).join("\n");
        const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a"); a.href = url; a.download = filename;
        document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    }

    function exportCSV() {
        if (!selTank) return;
        const rows = [
            ["Tanque", selTank.name, "Espécie", SP[selTank.species]?.name || ""],
            ["", "", "", ""],
            ["=== REGISTROS DIÁRIOS ===", "", "", ""],
            ["Data", "O₂ Manhã", "O₂ Tarde", "O₂ Noite", "Temp", "Ração (sacos)", "Mortalidade", "Obs"],
            ...allDays.map(([date, d]) => [
                date,
                d.readings?.[0]?.o2 || d.o2 || "",
                d.readings?.[1]?.o2 || "",
                d.readings?.[2]?.o2 || "",
                d.readings?.[0]?.temp || d.temp || "",
                ((d.feedGivenKg || 0) / 25).toFixed(3),
                d.mortality || 0, d.obs || ""
            ]),
            ["", "", "", ""],
            ["=== DESPESAS ===", "", "", ""],
            ["Data", "Categoria", "Descrição", "Valor"],
            ...tankExp.map(e => [e.date, e.cat, e.desc || "", e.amount]),
            ["TOTAL", "", "", totalExpTank],
        ];
        downloadCSV(rows, `relatorio_${selTank.name.replace(/\s/g, "_")}_${today()}.csv`);
    }

    return (React.createElement("div", { style: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", backdropFilter: "blur(12px)", zIndex: 200, display: "flex", flexDirection: "column" } },
        React.createElement("div", { style: { padding: "14px 18px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 12, background: "var(--dark)" } },
            React.createElement("span", { style: { fontSize: 22 } }, "\uD83D\uDCCB"),
            React.createElement("div", { style: { fontWeight: 800, fontSize: 17 } }, "Relat\u00F3rios"),
            React.createElement("div", { style: { flex: 1 } }),
            React.createElement("button", { onClick: onClose, style: { background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: 22 } }, "\u2715")),
        React.createElement("div", { style: { flex: 1, overflowY: "auto", padding: 16 } },
            React.createElement("div", { className: "card", style: { padding: 16, marginBottom: 14 } },
                React.createElement("div", { className: "section-hdr" }, "Selecionar Tanque"),
                tanks.length === 0 ? React.createElement("p", { style: { color: "var(--muted)", fontSize: 13 } }, "Nenhum tanque cadastrado.") :
                React.createElement("select", { className: "inp", value: tankSel, onChange: e => setTankSel(e.target.value) },
                    tanks.map(t => { var _a, _b; return React.createElement("option", { key: t.id, value: t.id }, (_a = SP[t.species]) === null || _a === void 0 ? void 0 : _a.icon, " ", t.name); }))),
            selTank && (React.createElement(React.Fragment, null,
                React.createElement("div", { className: "grid2", style: { marginBottom: 14 } }, [
                    { l: "Dias monitorados", v: `${allDays.length} dias` },
                    { l: "Mortalidade total", v: `${totalMort} peixes` },
                    { l: "Ração fornecida", v: sacosLabel(totalFedKg) },
                    { l: "Despesas", v: fmtBRL(totalExpTank) },
                    { l: "Biomassa atual", v: `${biomassKg.toFixed(1)} kg` },
                    { l: "Biometrias", v: `${(selTank.bioHistory || []).length} registros` },
                ].map(k => (React.createElement("div", { key: k.l, className: "card", style: { padding: "11px 13px" } },
                    React.createElement("div", { style: { fontSize: 10, color: "var(--muted)", textTransform: "uppercase", fontWeight: 600 } }, k.l),
                    React.createElement("div", { style: { fontFamily: "var(--mono)", fontSize: 14, fontWeight: 700, marginTop: 3 } }, k.v))))),
                React.createElement("div", { className: "card", style: { padding: 16 } },
                    React.createElement("div", { className: "section-hdr" }, "Exportar"),
                    React.createElement("button", { className: "btn btn-p", style: { width: "100%", padding: 13, fontSize: 14, marginBottom: 10 }, onClick: exportCSV }, "\uD83D\uDCCA Baixar Excel / CSV"),
                    React.createElement("div", { style: { fontSize: 11, color: "var(--muted)" } }, "Inclui registros di\u00E1rios e despesas do tanque selecionado.")))))));
}

// ═══════════════════════════════════════════════════════════════════════════════
// RENDER
// ═══════════════════════════════════════════════════════════════════════════════
ReactDOM.createRoot(document.getElementById("root")).render(React.createElement(App));

