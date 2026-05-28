
    const { useState, useEffect, useRef, createContext, useContext, useCallback, useMemo } = React;
    const { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend, PieChart, Pie, Cell } = Recharts;
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
function fmtU(v, cat, u, d = 2) { var _a, _b; if (v == null || isNaN(v))
    return "—"; return `${fromBase(v, cat, u).toFixed(d)} ${((_b = (_a = UNITS_DEF[cat]) === null || _a === void 0 ? void 0 : _a[u]) === null || _b === void 0 ? void 0 : _b.label) || ""}`; }
function fmtBRL(v) { return `R$ ${(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
function sacos(kg) { return (kg / 25).toFixed(2); }
function sacosLabel(kg) { return `${sacos(kg)} sacos (${kg.toFixed(1)} kg)`; }
// ═══════════════════════════════════════════════════════════════════════════════
// SPECIES DATABASE — internal always in grams & m²
// ═══════════════════════════════════════════════════════════════════════════════
const FCR_META = { matrinxa: 2.5, tambaqui: 1.7 };
const FCR_ALERT = { matrinxa: 3.0, tambaqui: 2.2 };
// ─── CAPACIDADE DE CARGA ────────────────────────────────────────────────────
// Dois limites simultâneos:
//   1. densityPerM2  → limite pela SUPERFÍCIE (troca gasosa / aeração)
//   2. kgPerM3       → limite pelo VOLUME (diluição de amônia e resíduos)
// A capacidade real = mínimo entre os dois limites
// Faixas de profundidade ideais e efeito no cálculo:
//   < 1.0m  → multiplicador 0.75 (volume insuficiente, amônia concentra)
//   1.0–1.2m→ multiplicador 0.90
//   1.2–1.8m→ multiplicador 1.00 (IDEAL — faixa de referência)
//   1.8–2.5m→ multiplicador 1.10 (mais volume, melhor diluição)
//   > 2.5m  → multiplicador 1.05 (aerador perde eficiência nas camadas fundas)
function depthMultiplier(depthM) {
    if (depthM < 1.0)
        return 0.75;
    if (depthM < 1.2)
        return 0.90;
    if (depthM <= 1.8)
        return 1.00;
    if (depthM <= 2.5)
        return 1.10;
    return 1.05;
}
// Calcula capacidade real considerando ÁREA + PROFUNDIDADE
function calcCapacity(species, areaM2, depthM) {
    var _a;
    const sp = SP[species];
    if (!sp || !areaM2)
        return { byArea: 0, byVolume: 0, ideal: 0, limitingFactor: "—", multiplier: 1 };
    const mult = depthMultiplier(depthM || 1.5);
    const volM3 = areaM2 * (depthM || 1.5);
    const byArea = Math.floor(areaM2 * sp.densityPerM2 * mult); // superfície × multiplicador profundidade
    const byVolume = Math.floor(volM3 * sp.kgPerM3 * 1000 / (((_a = sp.phases[2]) === null || _a === void 0 ? void 0 : _a.minW) || 300)); // vol × biomassa máx / peso médio engorda
    const ideal = Math.min(byArea, byVolume);
    const limitingFactor = byArea <= byVolume ? "Superfície (O₂/aeração)" : "Volume (diluição amônia)";
    return { byArea, byVolume, ideal, limitingFactor, multiplier: mult, volM3 };
}
// Retorna status da profundidade com explicação
function depthStatus(depthM) {
    if (depthM < 1.0)
        return { label: "⚠️ Rasa demais", color: "#ef4444", tip: "Volume insuficiente. Amônia se concentra rapidamente. Reduza estoque em 25%." };
    if (depthM < 1.2)
        return { label: "🟡 Abaixo do ideal", color: "#f59e0b", tip: "Reduza levemente a densidade recomendada (−10%)." };
    if (depthM <= 1.8)
        return { label: "✅ Profundidade ideal", color: "#22c55e", tip: "Faixa ideal para semi-intensivo com aeração." };
    if (depthM <= 2.5)
        return { label: "✅ Boa profundidade", color: "#22c55e", tip: "Volume extra melhora diluição. Verifique alcance dos aeradores." };
    return { label: "⚠️ Muito funda", color: "#f59e0b", tip: "Aeradores de superfície perdem eficiência. Risco de estratificação de O₂ nas camadas fundas." };
}
const SP = {
    matrinxa: {
        name: "Matrinxã", color: "#22c55e", icon: "🐟", imgSrc: "/icon.png",
        densityPerM2: 2.5,
        kgPerM3: 15, // kg de biomassa por m³ (semi-intensivo c/ aeração)
        minDepthM: 1.2, // profundidade mínima recomendada
        idealDepthM: 1.5, // profundidade de referência
        maxDepthM: 2.0, // acima disso aeração perde eficiência
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
        densityPerM2: 3,
        kgPerM3: 18, minDepthM: 1.2, idealDepthM: 1.5, maxDepthM: 2.0,
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
        densityPerM2: 4,
        kgPerM3: 25, minDepthM: 1.0, idealDepthM: 1.5, maxDepthM: 2.5,
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
function load(k, d) { try {
    const v = localStorage.getItem(k);
    return v ? JSON.parse(v) : d;
}
catch {
    return d;
} }
function save(k, v) { try {
    localStorage.setItem(k, JSON.stringify(v));
}
catch { } }
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
.inp{background:rgba(255,255,255,0.04);border:1px solid var(--border2);border-radius:9px;padding:9px 13px;color:var(--text);font-size:13px;width:100%;transition:border-color .2s;}
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

/* ── MOBILE NAV ── */
.mob-menu{position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(6,14,26,0.97);z-index:200;display:flex;flex-direction:column;padding:70px 20px 30px;gap:6px;overflow-y:auto;}
.mob-item{display:flex;align-items:center;gap:14px;padding:14px 18px;border-radius:12px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.07);cursor:pointer;font-size:15px;font-weight:600;color:var(--text);transition:background .15s;}
.mob-item:active{background:rgba(14,165,233,0.15);}
.mob-item.active{background:rgba(14,165,233,0.12);border-color:rgba(14,165,233,0.3);color:var(--accent);}
.mob-divider{height:1px;background:var(--border);margin:8px 0;}
.mob-section{font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:1px;padding:4px 18px;}

/* ── BOTTOM TAB BAR ── */
.bottom-bar{position:fixed;bottom:0;left:0;right:0;background:rgba(6,14,26,0.97);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border-top:1px solid var(--border);display:flex;z-index:150;padding-bottom:env(safe-area-inset-bottom);}
.bottom-tab{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:10px 4px 8px;cursor:pointer;border:none;background:none;color:var(--muted);font-family:var(--font);font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:.4px;gap:4px;transition:color .15s;}
.bottom-tab .ico{font-size:20px;line-height:1;}
.bottom-tab.active{color:var(--accent);}
.bottom-tab.active .ico{transform:scale(1.1);}

/* ── COMPACT HEADER ── */
.compact-nav{height:52px;padding:0 16px;display:flex;align-items:center;gap:10;}
.hamburger{background:none;border:none;cursor:pointer;padding:8px;border-radius:8px;display:flex;flex-direction:column;gap:5px;}
.hamburger span{display:block;width:22px;height:2px;background:var(--text);border-radius:2px;transition:all .2s;}

/* ── KPI SCROLL ROW ── */
.kpi-row{display:flex;gap:10px;overflow-x:auto;padding-bottom:6px;scrollbar-width:none;-webkit-overflow-scrolling:touch;}
.kpi-row::-webkit-scrollbar{display:none;}
.kpi-chip{flex:0 0 auto;background:var(--card);border:1px solid var(--border);border-radius:12px;padding:12px 14px;min-width:100px;text-align:center;}
.kpi-chip .val{font-size:15px;font-weight:700;font-family:var(--mono);}
.kpi-chip .lbl{font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.4px;margin-top:3px;}

/* ── PAGE PADDING FOR BOTTOM BAR ── */
.page-content{padding-bottom:80px;}

/* ── FULL WIDTH GRID ON MOBILE ── */
@media(max-width:600px){
  .grid2,.grid3,.grid4{grid-template-columns:1fr!important;}
  .kpi-row .kpi-chip{min-width:90px;}
}
`;
// ═══════════════════════════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════════════
// AUTH SYSTEM — Login + Roles
// ═══════════════════════════════════════════════════════════════════════════════
// ── ROLES & PERMISSIONS ──────────────────────────────────────────────────────
// admin        = dono / acesso total
// manejo       = caseiro/técnico: registra O₂, ração, biometria, qualidade água
// financeiro   = lança despesas por tanque, não vê totais/CAPEX/OPEX geral
// cliente      = outra fazenda com conta própria — acesso total à SUA fazenda
const ROLES = {
  admin: {
    label:"Administrador", color:"#22c55e", icon:"👑",
    canManageUsers:true,
    canViewDashboard:true,
    canEditTanks:true,        // criar/editar/deletar tanques
    canRegisterDaily:true,    // registrar O₂, ração, mortalidade
    canRegisterBio:true,      // biometria
    canRegisterExpense:true,  // despesas por tanque
    canViewExpenses:true,     // ver totais de despesas
    canViewFinance:true,      // CAPEX, OPEX geral, resumo
    canViewReports:true,      // relatórios completos
    canManageStock:true,      // entrada de ração no estoque
  },
  manejo: {
    label:"Manejo", color:"#0ea5e9", icon:"👷",
    canManageUsers:false,
    canViewDashboard:true,
    canEditTanks:false,
    canRegisterDaily:true,    // ✅ O₂, ração, qualidade água
    canRegisterBio:true,      // ✅ biometria
    canRegisterExpense:false,
    canViewExpenses:false,
    canViewFinance:false,     // ❌ sem acesso financeiro
    canViewReports:false,
    canManageStock:false,     // ❌ não gerencia estoque
  },
  financeiro: {
    label:"Financeiro", color:"#f59e0b", icon:"💼",
    canManageUsers:false,
    canViewDashboard:true,
    canEditTanks:false,
    canRegisterDaily:false,   // ❌ não registra manejo
    canRegisterBio:false,
    canRegisterExpense:true,  // ✅ lança despesas por tanque
    canViewExpenses:false,    // ❌ não vê totais
    canViewFinance:false,     // ❌ não vê CAPEX/OPEX geral
    canViewReports:false,
    canManageStock:true,      // ✅ entrada de ração (compra)
  },
  cliente: {
    label:"Cliente (Fazenda)", color:"#a78bfa", icon:"🏢",
    // Cliente = outra fazenda com conta própria — acesso total à SUA fazenda
    canManageUsers:false,
    canViewDashboard:true,
    canEditTanks:true,
    canRegisterDaily:true,
    canRegisterBio:true,
    canRegisterExpense:true,
    canViewExpenses:true,
    canViewFinance:true,
    canViewReports:true,
    canManageStock:true,
  },
};

// ── AUDIT LOG ─────────────────────────────────────────────────────────────────
// Stamps every action with who did it and when
function auditStamp(session){
  if(!session) return {};
  return {
    _by:   session.name,
    _role: session.role,
    _at:   new Date().toLocaleString("pt-BR", {day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"}),
  };
}
function AuditBadge({ stamp, style }){
  if(!stamp || !stamp._by) return null;
  return React.createElement("div", {
    style:{ fontSize:10, color:"#5a7a9a", display:"flex", alignItems:"center", gap:4, ...style }
  },
    React.createElement("span", null, "\uD83D\uDC64"),
    React.createElement("span", null, stamp._by),
    React.createElement("span", { style:{color:"rgba(255,255,255,0.15)"} }, "·"),
    React.createElement("span", null, stamp._at)
  );
}

// Default admin user — stored in localStorage
const DEFAULT_ADMIN = { id:"admin001", name:"Marcos Ferreira", email:"marcosferreira.026@icloud.com", role:"admin", password:"aqua@2024" };

function getUsers(){ try{ return JSON.parse(localStorage.getItem("aq_users")||"[]"); }catch(e){return [];} }
function saveUsers(u){ localStorage.setItem("aq_users",JSON.stringify(u)); }
function getSession(){ try{ return JSON.parse(localStorage.getItem("aq_session")||"null"); }catch(e){return null;} }
function saveSession(s){ if(s) localStorage.setItem("aq_session",JSON.stringify(s)); else localStorage.removeItem("aq_session"); }

// Init admin if first run
(function initAuth(){
  const users = getUsers();
  if(!users.find(u=>u.id==="admin001")){
    saveUsers([DEFAULT_ADMIN]);
  }
})();

// ── Login Page ────────────────────────────────────────────────────────────────
function LoginPage({ onLogin }){
  const [email, setEmail]   = useState(()=>localStorage.getItem("aq_remember_email")||"");
  const [pass,  setPass]    = useState(()=>localStorage.getItem("aq_remember_pass")||"");
  const [remember, setRemember] = useState(()=>!!localStorage.getItem("aq_remember_email"));
  const [error, setError]   = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading]   = useState(false);
  const [showForgot, setShowForgot] = useState(false);

  function handleLogin(){
    setError(""); setLoading(true);
    setTimeout(()=>{
      const users = getUsers();
      const user  = users.find(u=> u.email.toLowerCase()===email.trim().toLowerCase() && u.password===pass);
      if(user){
        const session = { id:user.id, name:user.name, email:user.email, role:user.role, loginAt: new Date().toISOString() };
        saveSession(session);
        if(remember){
          localStorage.setItem("aq_remember_email", email.trim());
          localStorage.setItem("aq_remember_pass", pass);
        } else {
          localStorage.removeItem("aq_remember_email");
          localStorage.removeItem("aq_remember_pass");
        }
        onLogin(session);
      } else {
        setError("E-mail ou senha incorretos.");
      }
      setLoading(false);
    }, 600);
  }

  return (
    React.createElement("div", { style:{minHeight:"100vh",background:"#060e1a",display:"flex",alignItems:"center",justifyContent:"center",padding:20} },
      React.createElement("div", { style:{width:"100%",maxWidth:380} },
        // Logo
        React.createElement("div", { style:{textAlign:"center",marginBottom:32} },
          React.createElement("img", { src:"/icon.png", style:{width:100,height:100,borderRadius:20,objectFit:"cover",marginBottom:16} }),
          React.createElement("div", { style:{fontWeight:800,fontSize:26,color:"#fff",letterSpacing:"-0.5px"} }, "AquaCulture"),
          React.createElement("div", { style:{fontSize:13,color:"#5a7a9a",marginTop:4} }, "Sistema de Gestão de Piscicultura")
        ),
        // Card
        React.createElement("div", { style:{background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:16,padding:28} },
          React.createElement("div", { style:{fontSize:16,fontWeight:700,color:"#fff",marginBottom:20} }, "Entrar na sua conta"),
          // Email
          React.createElement("div", { style:{marginBottom:14} },
            React.createElement("label", { style:{fontSize:11,fontWeight:700,color:"#5a7a9a",textTransform:"uppercase",letterSpacing:".5px",display:"block",marginBottom:6} }, "E-mail"),
            React.createElement("input", {
              type:"email", placeholder:"seu@email.com",
              value:email, onChange:e=>setEmail(e.target.value),
              onKeyDown:e=>e.key==="Enter"&&handleLogin(),
              style:{width:"100%",padding:"12px 14px",background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.12)",borderRadius:10,color:"#fff",fontSize:14,fontFamily:"inherit",outline:"none",boxSizing:"border-box"}
            })
          ),
          // Password
          React.createElement("div", { style:{marginBottom:20,position:"relative"} },
            React.createElement("label", { style:{fontSize:11,fontWeight:700,color:"#5a7a9a",textTransform:"uppercase",letterSpacing:".5px",display:"block",marginBottom:6} }, "Senha"),
            React.createElement("input", {
              type:showPass?"text":"password", placeholder:"••••••••",
              value:pass, onChange:e=>setPass(e.target.value),
              onKeyDown:e=>e.key==="Enter"&&handleLogin(),
              style:{width:"100%",padding:"12px 40px 12px 14px",background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.12)",borderRadius:10,color:"#fff",fontSize:14,fontFamily:"inherit",outline:"none",boxSizing:"border-box"}
            }),
            React.createElement("button", {
              onClick:()=>setShowPass(p=>!p),
              style:{position:"absolute",right:12,top:34,background:"none",border:"none",cursor:"pointer",color:"#5a7a9a",fontSize:16}
            }, showPass?"🙈":"👁️")
          ),
          // Error
          error && React.createElement("div", { style:{background:"rgba(239,68,68,0.1)",border:"1px solid rgba(239,68,68,0.3)",borderRadius:8,padding:"10px 13px",fontSize:13,color:"#f87171",marginBottom:16} }, error),
          // Button
          React.createElement("div", { style:{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16} },
            React.createElement("label", { style:{display:"flex",alignItems:"center",gap:7,cursor:"pointer",fontSize:13,color:"#5a7a9a"} },
              React.createElement("input", { type:"checkbox", checked:remember, onChange:e=>setRemember(e.target.checked),
                style:{width:16,height:16,accentColor:"#0ea5e9",cursor:"pointer"} }),
              " Lembrar minha senha"),
            React.createElement("button", { onClick:()=>setShowForgot(true),
              style:{background:"none",border:"none",cursor:"pointer",color:"#0ea5e9",fontSize:13,fontFamily:"inherit"} },
              "Esqueci minha senha")),
          React.createElement("button", {
            onClick:handleLogin,
            disabled:loading||!email||!pass,
            style:{width:"100%",padding:13,background:loading||!email||!pass?"rgba(14,165,233,0.4)":"linear-gradient(135deg,#0ea5e9,#0284c7)",border:"none",borderRadius:10,color:"#fff",fontSize:15,fontWeight:700,cursor:loading||!email||!pass?"not-allowed":"pointer",fontFamily:"inherit"}
          }, loading?"Entrando...":"Entrar")
        ),
        React.createElement("div", { style:{textAlign:"center",marginTop:20,fontSize:12,color:"#5a7a9a"} },
          "Não tem acesso? Entre em contato com o administrador.")
      )
    )
  );
}

// ── User Management Modal ─────────────────────────────────────────────────────
function UserManagementModal({ onClose, currentUser }){
  const [users, setUsersState] = useState(getUsers);
  const [tab, setTab] = useState("list");
  const [form, setForm] = useState({ name:"", email:"", role:"funcionario", password:"" });
  const [editId, setEditId] = useState(null);
  const [msg, setMsg] = useState("");

  function refresh(){ setUsersState(getUsers()); }

  function saveUser(){
    if(!form.name||!form.email||(!editId&&!form.password)) return setMsg("Preencha todos os campos.");
    const all = getUsers();
    if(editId){
      const updated = all.map(u=> u.id===editId ? {...u, name:form.name, email:form.email, role:form.role, ...(form.password?{password:form.password}:{})} : u);
      saveUsers(updated);
    } else {
      if(all.find(u=>u.email.toLowerCase()===form.email.toLowerCase())) return setMsg("E-mail já cadastrado.");
      saveUsers([...all, { id:"u"+Date.now(), ...form }]);
    }
    setMsg(editId?"✅ Usuário atualizado!":"✅ Usuário criado!");
    setForm({name:"",email:"",role:"funcionario",password:""});
    setEditId(null);
    refresh();
    setTimeout(()=>setMsg(""),2500);
  }

  function deleteUser(id){
    if(id==="admin001") return setMsg("Não é possível remover o administrador.");
    if(!confirm("Remover este usuário?")) return;
    saveUsers(getUsers().filter(u=>u.id!==id));
    refresh();
  }

  function startEdit(u){
    setForm({name:u.name, email:u.email, role:u.role, password:""});
    setEditId(u.id);
    setTab("form");
  }

  return (
    React.createElement("div", { style:{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",backdropFilter:"blur(12px)",zIndex:300,display:"flex",flexDirection:"column"} },
      // Header
      React.createElement("div", { style:{padding:"14px 18px",borderBottom:"1px solid rgba(255,255,255,0.08)",display:"flex",alignItems:"center",gap:12,background:"#060e1a"} },
        React.createElement("span", { style:{fontSize:22} }, "👥"),
        React.createElement("div", { style:{flex:1} },
          React.createElement("div", { style:{fontWeight:800,fontSize:17,color:"#fff"} }, "Gerenciar Usuários"),
          React.createElement("div", { style:{fontSize:11,color:"#5a7a9a"} }, "Administradores · Funcionários · Clientes")
        ),
        React.createElement("button", { onClick:onClose, style:{background:"none",border:"none",color:"#5a7a9a",cursor:"pointer",fontSize:22} }, "✕")
      ),
      // Tabs
      React.createElement("div", { style:{display:"flex",gap:4,padding:"10px 14px",borderBottom:"1px solid rgba(255,255,255,0.08)",background:"#060e1a"} },
        ["list","form"].map(t=>
          React.createElement("button", { key:t, onClick:()=>{setTab(t);setEditId(null);setForm({name:"",email:"",role:"funcionario",password:""});},
            style:{padding:"7px 16px",borderRadius:8,border:"none",cursor:"pointer",fontFamily:"inherit",fontWeight:600,fontSize:13,
              background:tab===t?"#0ea5e9":"rgba(255,255,255,0.05)",color:tab===t?"#fff":"#5a7a9a"} },
            t==="list"?"👥 Usuários":"➕ "+(editId?"Editar":"Novo")
          )
        )
      ),
      // Content
      React.createElement("div", { style:{flex:1,overflowY:"auto",padding:16} },
        msg && React.createElement("div", { style:{background:msg.startsWith("✅")?"rgba(34,197,94,0.1)":"rgba(239,68,68,0.1)",border:`1px solid ${msg.startsWith("✅")?"rgba(34,197,94,0.3)":"rgba(239,68,68,0.3)"}`,borderRadius:9,padding:"10px 14px",fontSize:13,color:msg.startsWith("✅")?"#4ade80":"#f87171",marginBottom:14} }, msg),

        tab==="list" && React.createElement("div", { style:{display:"flex",flexDirection:"column",gap:10} },
          users.map(u=>{
            const role = ROLES[u.role]||ROLES.funcionario;
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
            {label:"Nome completo", key:"name", type:"text",    placeholder:"ex: João Silva"},
            {label:"E-mail",        key:"email", type:"email",   placeholder:"joao@email.com"},
            {label:"Senha",         key:"password", type:"password", placeholder:editId?"Deixe vazio para manter":"Mínimo 6 caracteres"},
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
              style:{width:"100%",padding:"11px 13px",background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.12)",borderRadius:9,color:"#fff",fontSize:14,fontFamily:"inherit",outline:"none"} },
              React.createElement("option", {value:"admin"},      "👑 Administrador — acesso total"),
              React.createElement("option", {value:"manejo"},     "👷 Manejo — O₂, ração, biometria, qualidade água"),
              React.createElement("option", {value:"financeiro"}, "💼 Financeiro — lança despesas, sem ver totais"),
              React.createElement("option", {value:"cliente"},    "🏢 Cliente (Fazenda) — acesso total à própria fazenda")
            )
          ),
          // Role description
          React.createElement("div", { style:{background:"rgba(255,255,255,0.03)",borderRadius:9,padding:"10px 13px",fontSize:12,color:"#5a7a9a"} },
            form.role==="admin"      ? "👑 Acesso total: tanques, financeiro, relatórios e gestão de usuários." :
            form.role==="manejo"     ? "👷 Registra O₂, ração, biometria e qualidade da água. Sem acesso ao financeiro ou estoque." :
            form.role==="financeiro" ? "💼 Lança despesas por tanque e entrada de ração. Não vê totais, CAPEX ou OPEX geral." :
                                       "🏢 Outra fazenda com conta própria — acesso total à fazenda dela, separado dos seus dados."
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


function App() {
    const [session,  setSession]      = (0, useState)(()=>getSession());
    const [showUserMgmt, setShowUserMgmt] = (0, useState)(false);
    // NOTE: ALL hooks must be called before any conditional return (React rules)
    const [tanks, setTanks] = (0, useState)(() => load("aq_tanks", []));
    const [logs, setLogs] = (0, useState)(() => load("aq_logs", {}));
    const [expenses, setExpenses] = (0, useState)(() => load("aq_exp", {}));
    const [stock, setStock] = (0, useState)(() => load("aq_stock", { bags: 0, costPerBag: 100, history: [], minAlert: 20 }));
    const [cycles, setCycles] = (0, useState)(() => load("aq_cycles", {}));
    const [capex, setCapex] = (0, useState)(() => load("aq_capex", []));
    const [opexG, setOpexG] = (0, useState)(() => load("aq_opex_g", []));
    const [schedule, setSchedule] = (0, useState)(() => load("aq_sched", []));
    const [units, setUnits] = (0, useState)(() => load("aq_units", { area: "m2", depth: "m", weight: "g", feed: "sack", length: "cm" }));
    // Water reading times: 3 fixed slots, user can change in Settings
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
    // Notification
    (0, useEffect)(() => {
        if ("Notification" in window)
            setNotifPerm(Notification.permission);
    }, []);
    function requestNotif() {
        if ("Notification" in window)
            Notification.requestPermission().then(p => setNotifPerm(p));
    }
    function notify(title, body) {
        if (notifPerm === "granted")
            new Notification(title, { body, icon: "/icon.png" });
    }
    // Stock alerts
    (0, useEffect)(() => {
        if (stock.bags <= stock.minAlert && stock.bags > 0) {
            notify("⚠️ Estoque Baixo", `Apenas ${stock.bags} sacos de ração restantes!`);
        }
    }, [stock.bags]);
    const activeTank = tanks.find(t => t.id === tankId);
    function openTank(id) { setTankId(id); setPage("tank"); }
    function goHome() { setPage("dashboard"); setTankId(null); }
    function addTank(t) { setTanks(p => [...p, t]); }
    function updateTank(t) { setTanks(p => p.map(x => x.id === t.id ? t : x)); }
    function deleteTank(id) { setTanks(p => p.filter(x => x.id !== id)); }
    function updateDayLog(tankId, date, fields) {
        setLogs(prev => {
            var _a;
            return ({
                ...prev,
                [tankId]: { ...(prev[tankId] || {}), [date]: { ...(((_a = prev[tankId]) === null || _a === void 0 ? void 0 : _a[date]) || {}), ...fields } }
            });
        });
    }
    function addExpense(tankId, exp) {
        setExpenses(prev => ({
            ...prev,
            [tankId]: [...(prev[tankId] || []), exp]
        }));
    }
    function addStockIn(nf) {
        // nf: { bags, costPerBag, supplier, nfNumber, feedType, feedBrand, date, payMethod, totalValue, source }
        const bags = parseInt(nf.bags) || 0;
        const cpp = parseFloat(nf.costPerBag) || 0;
        setStock(prev => ({
            ...prev,
            bags: prev.bags + bags,
            costPerBag: cpp,
            history: [...prev.history, {
                    ...nf,
                    id: Math.random().toString(36).slice(2, 9),
                    type: "in",
                    bags,
                    costPerBag: cpp,
                    total: nf.totalValue || bags * cpp,
                    registeredAt: new Date().toISOString(),
                }]
        }));
    }
    function consumeStock(bags, tankId, note) {
        setStock(prev => ({
            ...prev,
            bags: Math.max(0, prev.bags - bags),
            history: [...prev.history, { date: today(), type: "out", bags, tankId, note }]
        }));
    }
    // Alerts computation
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
        if (o2 > 0 && o2 < ((sp === null || sp === void 0 ? void 0 : sp.minO2) || 5))
            alerts.push({ level: "danger", tank: t.name, msg: `O₂ crítico: ${o2} mg/L`, tankId: t.id });
        const lastBio = (_b = t.bioHistory) === null || _b === void 0 ? void 0 : _b[t.bioHistory.length - 1];
        if (lastBio) {
            const days = Math.floor((new Date() - new Date(lastBio.date)) / 86400000);
            if (days > 30)
                alerts.push({ level: "warn", tank: t.name, msg: `Biometria há ${days} dias`, tankId: t.id });
        }
        else {
            alerts.push({ level: "warn", tank: t.name, msg: "Nenhuma biometria registrada", tankId: t.id });
        }
        if (!dl.o2)
            alerts.push({ level: "info", tank: t.name, msg: "O₂ não registrado hoje", tankId: t.id });
        const sp2 = SP[t.species];
        if (t.depth && sp2 && t.depth < sp2.minDepthM)
            alerts.push({ level: "warn", tank: t.name, msg: `Profundidade ${t.depth}m abaixo do mínimo (${sp2.minDepthM}m) — reduza estoque`, tankId: t.id });
        if (t.depth && sp2 && t.depth > sp2.maxDepthM)
            alerts.push({ level: "warn", tank: t.name, msg: `Profundidade ${t.depth}m acima do ideal — aeradores podem perder alcance`, tankId: t.id });
        const fcrNow = getFCR(t);
        if (fcrNow !== null && fcrNow > (FCR_ALERT[t.species] || 3.0))
            alerts.push({ level: "danger", tank: t.name, msg: `FCR ${fcrNow.toFixed(2)} — crítico! Meta: ${FCR_META[t.species]}`, tankId: t.id });
        else if (fcrNow !== null && fcrNow > (FCR_META[t.species] || 2.5))
            alerts.push({ level: "warn", tank: t.name, msg: `FCR ${fcrNow.toFixed(2)} — acima da meta (${FCR_META[t.species]})`, tankId: t.id });
    });
    if (stock.bags <= stock.minAlert)
        alerts.push({ level: "danger", tank: "Estoque", msg: `Ração baixa: ${stock.bags} sacos restantes` });
    const ctx = {
        tanks, logs, expenses, stock, cycles, units, setUnits,
        addTank, updateTank, deleteTank, updateDayLog, addExpense,
        addStockIn, consumeStock, setCycles, setStock,
        activeTank, openTank, goHome, alerts, notify,
        capex, setCapex, opexG, setOpexG, schedule, setSchedule,
        activeDate, setActiveDate, notifPerm, requestNotif,
        waterTimes, setWaterTimes,
    };
    return (React.createElement(Ctx.Provider, { value: ctx },
        React.createElement("style", null, CSS),
        React.createElement(Nav, { page: page, goHome: goHome, session: session, role: role, onNewTank: () => setShowNewTank(true), onSettings: () => setShowSettings(true), onFinanceiro: () => setShowFinanceiro(true), onRelatorios: () => setShowRelatorios(true), alerts: alerts, onStockIn: () => setShowStockIn(true), stock: stock }),
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
// NAV — mobile-first com menu hambúrguer
// ═══════════════════════════════════════════════════════════════════════════════
function Nav({ page, goHome, onNewTank, onSettings, onFinanceiro, onRelatorios, alerts, onStockIn, stock, session, role }) {
  var _role = role || ROLES.admin;
    const [open, setOpen] = (0, useState)(false);
    const dangerCount = alerts.filter(a => a.level === "danger").length;
    const warnCount = alerts.filter(a => a.level === "warn").length;
    function close(fn) { return () => { setOpen(false); fn && fn(); }; }
    return (React.createElement(React.Fragment, null,
        React.createElement("nav", { style: { height: 52, padding: "0 14px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10, background: "rgba(6,14,26,0.97)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", position: "sticky", top: 0, zIndex: 150 } },
            React.createElement("button", { className: "hamburger", onClick: () => setOpen(o => !o), "aria-label": "Menu" },
                React.createElement("span", { style: { transform: open ? "rotate(45deg) translate(5px,5px)" : "none" } }),
                React.createElement("span", { style: { opacity: open ? 0 : 1 } }),
                React.createElement("span", { style: { transform: open ? "rotate(-45deg) translate(5px,-5px)" : "none" } })),
            React.createElement("button", { onClick: close(goHome), style: { background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 7, flex: 1 } },
                React.createElement("img", { src: "/icon.png", style: { width: 30, height: 30, objectFit: "cover", borderRadius: 6 } }),
                React.createElement("span", { style: { fontWeight: 800, fontSize: 16, color: "var(--text)", letterSpacing: "-0.5px" } }, "AquaGest\u00E3o")),
            dangerCount > 0 && (React.createElement("div", { className: "pulse badge", style: { background: "rgba(239,68,68,0.15)", color: "#f87171", border: "1px solid rgba(239,68,68,0.3)", fontSize: 10 } },
                "\uD83D\uDD34 ",
                dangerCount)),
            React.createElement("div", { style: { background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)", borderRadius: 8, padding: "4px 9px", fontSize: 11, fontWeight: 700, color: "#4ade80", fontFamily: "var(--mono)", whiteSpace: "nowrap" } },
                "\uD83D\uDCE6 ",
                stock.bags)),
        open && (React.createElement("div", { className: "mob-menu slide", onClick: () => setOpen(false) },
            React.createElement("div", { onClick: e => e.stopPropagation(), style: { display: "flex", flexDirection: "column", gap: 6 } },
                React.createElement("div", { className: "mob-section" }, "Navega\u00E7\u00E3o"),
                React.createElement("div", { className: "mob-item", onClick: close(goHome) },
                    React.createElement("span", { style: { fontSize: 22 } }, "\uD83C\uDFE0"),
                    React.createElement("div", null,
                        React.createElement("div", null, "In\u00EDcio"),
                        React.createElement("div", { style: { fontSize: 11, color: "var(--muted)", fontWeight: 400 } }, "Vis\u00E3o geral dos tanques"))),
                page === "tank" && (React.createElement("div", { className: "mob-item", onClick: close(goHome) },
                    React.createElement("span", { style: { fontSize: 22 } }, "\u2190 "),
                    React.createElement("div", null,
                        React.createElement("div", null, "Voltar"),
                        React.createElement("div", { style: { fontSize: 11, color: "var(--muted)", fontWeight: 400 } }, "Dashboard principal")))),
                React.createElement("div", { className: "mob-divider" }),
                React.createElement("div", { className: "mob-section" }, "A\u00E7\u00F5es"),
                _role.canEditTanks && React.createElement("div", { className: "mob-item", onClick: close(onNewTank) },
                    React.createElement("span", { style: { fontSize: 22 } }, "\u2795"),
                    React.createElement("div", null,
                        React.createElement("div", null, "Novo Tanque"),
                        React.createElement("div", { style: { fontSize: 11, color: "var(--muted)", fontWeight: 400 } }, "Cadastrar tanque de cria\u00E7\u00E3o"))),
                _role.canManageStock && React.createElement("div", { className: "mob-item", onClick: close(onStockIn) },
                    React.createElement("span", { style: { fontSize: 22 } }, "\uD83D\uDCE5"),
                    React.createElement("div", null,
                        React.createElement("div", null, "Entrada de Ra\u00E7\u00E3o"),
                        React.createElement("div", { style: { fontSize: 11, color: "var(--muted)", fontWeight: 400 } },
                            "Estoque atual: ",
                            stock.bags,
                            " sacos \u00B7 ",
                            fmtBRL(stock.bags * stock.costPerBag)))),
                React.createElement("div", { className: "mob-divider" }),
                React.createElement("div", { className: "mob-section" }, "Sistema"),
                (_role.canViewFinance||_role.canRegisterExpense) && React.createElement("div", { className: "mob-item", onClick: close(onFinanceiro) },
                    React.createElement("span", { style: { fontSize: 22 } }, "\uD83D\uDCB0"),
                    React.createElement("div", null,
                        React.createElement("div", null, "Financeiro"),
                        React.createElement("div", { style: { fontSize: 11, color: "var(--muted)", fontWeight: 400 } }, "CAPEX \u00B7 OPEX \u00B7 Cronograma"))),
                _role.canViewReports && React.createElement("div", { className: "mob-item", onClick: close(onRelatorios) },
                    React.createElement("span", { style: { fontSize: 22 } }, "\uD83D\uDCCB"),
                    React.createElement("div", null,
                        React.createElement("div", null, "Relat\u00F3rios"),
                        React.createElement("div", { style: { fontSize: 11, color: "var(--muted)", fontWeight: 400 } }, "Manejo por tanque \u00B7 Opera\u00E7\u00E3o completa"))),
                React.createElement("div", { className: "mob-item", onClick: close(onSettings) },
                    React.createElement("span", { style: { fontSize: 22 } }, "\u2699\uFE0F"),
                    React.createElement("div", null,
                        React.createElement("div", null, "Configura\u00E7\u00F5es"),
                        React.createElement("div", { style: { fontSize: 11, color: "var(--muted)", fontWeight: 400 } }, "Unidades, notifica\u00E7\u00F5es"))),
            React.createElement("div", { className: "mob-divider" }),
            React.createElement("div", { className: "mob-section" }, "Conta"),
            React.createElement("div", { className: "mob-item" },
                React.createElement("span", { style: { fontSize: 22 } }, "\uD83D\uDC64"),
                React.createElement("div", null,
                    React.createElement("div", null, (session&&session.name)||'Usuário' || "Usu\u00E1rio"),
                    React.createElement("div", { style: { fontSize: 11, color: "var(--muted)", fontWeight: 400 } },
                        (ROLES[(session&&session.role)||'funcionario'] || ROLES.funcionario).label))),
            (session&&session.role)||'funcionario' === "admin" && React.createElement("div", { className: "mob-item", onClick: close(() => setShowUserMgmt(true)) },
                React.createElement("span", { style: { fontSize: 22 } }, "\uD83D\uDC65"),
                React.createElement("div", null,
                    React.createElement("div", null, "Gerenciar Usu\u00E1rios"),
                    React.createElement("div", { style: { fontSize: 11, color: "var(--muted)", fontWeight: 400 } }, "Criar e editar acessos"))),
            React.createElement("div", { className: "mob-item",
                style: { borderColor: "rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.06)" },
                onClick: () => { saveSession(null); setSession(null); setOpen(false); } },
                React.createElement("span", { style: { fontSize: 22 } }, "\uD83D\uDEAA"),
                React.createElement("div", null,
                    React.createElement("div", { style: { color: "#f87171" } }, "Sair"),
                    React.createElement("div", { style: { fontSize: 11, color: "var(--muted)", fontWeight: 400 } }, "Encerrar sess\u00E3o"))),
                (dangerCount + warnCount) > 0 && (React.createElement("div", { className: "mob-item", style: { borderColor: "rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.06)" } },
                    React.createElement("span", { style: { fontSize: 22 } }, "\uD83D\uDD14"),
                    React.createElement("div", null,
                        React.createElement("div", { style: { color: "#f87171" } }, "Alertas Ativos"),
                        React.createElement("div", { style: { fontSize: 11, color: "var(--muted)", fontWeight: 400 } },
                            dangerCount,
                            " cr\u00EDtico",
                            dangerCount !== 1 ? "s" : "",
                            " \u00B7 ",
                            warnCount,
                            " aviso",
                            warnCount !== 1 ? "s" : "")))))))));
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
    const totalFeedKg = Object.values(logs).flatMap(tl => Object.values(tl)).reduce((s, d) => s + (parseFloat(d.feedGiven || 0)), 0);
    // FCR ranking
    const tankRanking = tanks.map(t => {
        const tl = logs[t.id] || {};
        const fed = Object.values(tl).reduce((s, d) => s + ((d.feedGivenKg || parseFloat(d.feedGiven || 0) * 25)), 0) / 25; // in sacos for FCR
        const initB = (t.initFishCount || t.fishCount || 0) * (t.initWeightG || t.avgWeightG || 0) / 1000;
        const curB = (t.fishCount || 0) * (t.avgWeightG || 0) / 1000;
        const gain = curB - initB;
        const fcr = gain > 0.1 ? (fed / gain).toFixed(2) : "—";
        const sp = SP[t.species];
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
            React.createElement("p", { style: { color: "var(--muted)", fontSize: 12 } },
                tanks.length,
                " tanque",
                tanks.length !== 1 ? "s" : "",
                " em produ\u00E7\u00E3o \u00B7 ",
                today())),
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
                React.createElement("span", null,
                    labels[t.id],
                    t.id === "alertas" && alerts.length > 0 ? ` (${alerts.length})` : "")));
        })),
        activeTab === "tanques" && (React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 14 } }, tanks.length === 0 ? (React.createElement("div", { style: { gridColumn: "1/-1", textAlign: "center", padding: "60px 20px", color: "var(--muted)" } },
            React.createElement("div", { style: { fontSize: 52, marginBottom: 12 } }, "\uD83C\uDF0A"),
            React.createElement("p", { style: { fontSize: 15 } },
                "Nenhum tanque. Clique em ",
                React.createElement("strong", { style: { color: "var(--accent)" } }, "+ Novo Tanque")))) : tankRanking.map(t => (React.createElement(TankCard, { key: t.id, tank: t, onOpen: () => openTank(t.id), onEdit: () => onEdit(t) }))))),
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
            React.createElement("span", { style: { fontSize: 12, color: o2Color, fontFamily: "var(--mono)" } },
                "O\u2082: ",
                o2 || "—",
                " mg/L"),
            React.createElement("span", { style: { fontSize: 12, fontWeight: 700, color: shouldFeed ? "var(--green)" : "var(--red)" } }, o2 === 0 ? "⚪ Reg. O₂" : shouldFeed ? "✅ Alimentar" : "🚫 Não Alimentar")),
        (() => {
            const ds = depthStatus(tank.depth || 1.5);
            const cap = calcCapacity(tank.species, tank.areaM2, tank.depth || 1.5);
            return (React.createElement("div", { onClick: onOpen, style: { marginTop: 7, display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11 } },
                React.createElement("span", { style: { color: ds.color } },
                    ds.label,
                    " (",
                    tank.depth || 1.5,
                    "m)"),
                React.createElement("span", { style: { color: "var(--muted)", fontFamily: "var(--mono)" } },
                    "cap. ",
                    cap.ideal.toLocaleString("pt-BR"),
                    " peixes")));
        })()));
}
// ═══════════════════════════════════════════════════════════════════════════════
// ALERTS PANEL
// ═══════════════════════════════════════════════════════════════════════════════
function AlertsPanel() {
    const { alerts, openTank, notifPerm, requestNotif } = useApp();
    const colors = { danger: ["rgba(239,68,68,0.12)", "#f87171", "rgba(239,68,68,0.3)"], warn: ["rgba(245,158,11,0.12)", "#fbbf24", "rgba(245,158,11,0.3)"], info: ["rgba(14,165,233,0.08)", "#38bdf8", "rgba(14,165,233,0.2)"] };
    return (React.createElement("div", { className: "card", style: { padding: 20 } },
        React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 } },
            React.createElement("div", { className: "section-hdr", style: { margin: 0 } }, "Central de Alertas"),
            notifPerm !== "granted" && (React.createElement("button", { className: "btn btn-g", style: { fontSize: 11 }, onClick: requestNotif }, "\uD83D\uDD14 Ativar Notifica\u00E7\u00F5es"))),
        alerts.length === 0 ? (React.createElement("div", { style: { textAlign: "center", padding: 30, color: "var(--muted)" } }, "\u2705 Nenhum alerta ativo")) : alerts.map((a, i) => {
            const [bg, clr, br] = colors[a.level] || colors.info;
            return (React.createElement("div", { key: i, className: "alert-bar", style: { background: bg, border: `1px solid ${br}`, color: clr, marginBottom: 8, cursor: a.tankId ? "pointer" : "default" }, onClick: () => a.tankId && openTank(a.tankId) },
                React.createElement("span", null, a.level === "danger" ? "🔴" : a.level === "warn" ? "🟡" : "🔵"),
                React.createElement("strong", null,
                    "[",
                    a.tank,
                    "]"),
                React.createElement("span", { style: { flex: 1 } }, a.msg),
                a.tankId && React.createElement("span", { style: { fontSize: 11, opacity: .7 } }, "Ver tanque \u2192")));
        })));
}
// ═══════════════════════════════════════════════════════════════════════════════
// RANKING PANEL
// ═══════════════════════════════════════════════════════════════════════════════
function RankingPanel({ ranking }) {
    return (React.createElement("div", { className: "card", style: { padding: 20 } },
        React.createElement("div", { className: "section-hdr" }, "Ranking por Convers\u00E3o Alimentar (FCR)"),
        React.createElement("p", { style: { fontSize: 12, color: "var(--muted)", marginBottom: 14 } }, "Menor FCR = melhor convers\u00E3o. FCR ideal por fase: 1,2\u20131,8."),
        React.createElement("table", null,
            React.createElement("thead", null,
                React.createElement("tr", null,
                    React.createElement("th", null, "#"),
                    React.createElement("th", null, "Tanque"),
                    React.createElement("th", null, "Esp\u00E9cie"),
                    React.createElement("th", null, "Fase"),
                    React.createElement("th", null, "FCR Real"),
                    React.createElement("th", null, "FCR Ideal"),
                    React.createElement("th", null, "Biomassa"),
                    React.createElement("th", null, "Ra\u00E7\u00E3o Total"))),
            React.createElement("tbody", null, ranking.map((t, i) => {
                var _a;
                const sp = SP[t.species];
                const phase = getPhase(t.species, t.avgWeightG || 0);
                const fcr = parseFloat(t.fcr);
                const ok = !isNaN(fcr) && fcr <= (FCR_META[t.species] || 2.5);
                const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}`;
                return (React.createElement("tr", { key: t.id },
                    React.createElement("td", null, medal),
                    React.createElement("td", null,
                        React.createElement("strong", null, t.name)),
                    React.createElement("td", null, sp === null || sp === void 0 ? void 0 :
                        sp.icon,
                        " ", sp === null || sp === void 0 ? void 0 :
                        sp.name),
                    React.createElement("td", null,
                        React.createElement("span", { className: "badge", style: { background: (sp === null || sp === void 0 ? void 0 : sp.color) + "22", color: sp === null || sp === void 0 ? void 0 : sp.color } }, phase === null || phase === void 0 ? void 0 : phase.name)),
                    React.createElement("td", { style: { fontFamily: "var(--mono)", color: ok ? "var(--green)" : "var(--red)", fontWeight: 700 } }, t.fcr),
                    React.createElement("td", { style: { fontFamily: "var(--mono)", color: "var(--muted)" } }, FCR_META[t.species]),
                    React.createElement("td", { style: { fontFamily: "var(--mono)" } }, (_a = t.biomassKg) === null || _a === void 0 ? void 0 :
                        _a.toFixed(1),
                        " kg"),
                    React.createElement("td", { style: { fontFamily: "var(--mono)" } },
                        sacos(t.fedKg || 0),
                        " sacos")));
            })))));
}
// ═══════════════════════════════════════════════════════════════════════════════
// FEED TABLE PANEL — tabela de arraçoamento por espécie e peso
// ═══════════════════════════════════════════════════════════════════════════════
function FeedTablePanel() {
    const [sp, setSp] = (0, useState)("matrinxa");
    const [section, setSection] = (0, useState)("racao"); // racao | agua | fcr | densidade
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
                React.createElement("p", { style: { fontSize: 12, color: "var(--muted)" } }, "Tabelas de refer\u00EAncia t\u00E9cnica por esp\u00E9cie \u2014 baseadas em sistema semi-intensivo com aera\u00E7\u00E3o")),
            React.createElement("div", { style: { display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 } }, Object.entries(SP).map(([k, v]) => (React.createElement("button", { key: k, onClick: () => setSp(k), style: { padding: "8px 16px", borderRadius: 10, cursor: "pointer", fontFamily: "var(--font)", fontWeight: 700, fontSize: 13,
                    background: sp === k ? v.color : "rgba(255,255,255,0.05)",
                    border: sp === k ? "none" : "1px solid var(--border2)",
                    color: sp === k ? "#fff" : "var(--muted)", transition: "all .2s" } },
                v.icon,
                " ",
                v.name)))),
            React.createElement("div", { style: { display: "flex", gap: 6, flexWrap: "wrap" } }, sections.map(s => (React.createElement("button", { key: s.id, className: `tab-btn ${section === s.id ? "active" : ""}`, style: { fontSize: 12 }, onClick: () => setSection(s.id) }, s.label))))),
        section === "racao" && (React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 12 } },
            React.createElement("div", { className: "card", style: { padding: 16, background: `${species.color}08`, borderColor: `${species.color}33` } },
                React.createElement("div", { style: { fontSize: 13, fontWeight: 700, color: species.color, marginBottom: 6 } },
                    species.icon,
                    " ",
                    species.name,
                    " \u2014 Tabela de Arra\u00E7oamento"),
                React.createElement("div", { style: { fontSize: 12, color: "var(--muted)", lineHeight: 1.7 } },
                    "Sistema: ",
                    React.createElement("strong", { style: { color: "var(--text)" } }, "semi-intensivo com aera\u00E7\u00E3o"),
                    " \u00B7 FCR meta: ",
                    React.createElement("strong", { style: { color: "var(--text)" } }, FCR_META[sp]),
                    " \u00B7 Ra\u00E7\u00E3o: ",
                    React.createElement("strong", { style: { color: "var(--text)" } }, "extrusada flutuante"))),
            species.phases.map((phase, i) => {
                const row = species.feedTable[i];
                const sacosPerTon = ((1000 * (phase.pct || 0)) / 25).toFixed(3);
                const protColors = { 45: "#ef4444", 40: "#f59e0b", 36: "#22c55e", 32: "#0ea5e9", 28: "#a78bfa", 24: "#6366f1" };
                const pColor = protColors[phase.protPct] || "#94a3b8";
                return (React.createElement("div", { key: i, className: "card", style: { padding: 18, borderLeft: `4px solid ${species.color}` } },
                    React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 } },
                        React.createElement("div", null,
                            React.createElement("div", { style: { fontWeight: 800, fontSize: 16, color: species.color } }, phase.name),
                            React.createElement("div", { style: { fontSize: 12, color: "var(--muted)", marginTop: 2, fontFamily: "var(--mono)" } }, row === null || row === void 0 ? void 0 : row.range)),
                        React.createElement("div", { style: { textAlign: "right" } },
                            React.createElement("div", { style: { fontSize: 10, color: "var(--muted)", textTransform: "uppercase", fontWeight: 600 } }, "Prote\u00EDna"),
                            React.createElement("div", { style: { fontFamily: "var(--mono)", fontSize: 26, fontWeight: 800, color: pColor } },
                                phase.protPct,
                                "%"),
                            React.createElement("div", { style: { fontSize: 11, color: "var(--muted)" } }, row === null || row === void 0 ? void 0 : row.obs))),
                    React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 12 } }, [
                        { l: "% Arraçoamento", v: row === null || row === void 0 ? void 0 : row.pct, note: "do peso vivo/dia" },
                        { l: "Frequência", v: row === null || row === void 0 ? void 0 : row.freq, note: "refeições" },
                        { l: "FCR esperado", v: row === null || row === void 0 ? void 0 : row.fcr, note: "kg ração/kg ganho" },
                        { l: "Sacos/ton/dia", v: `${sacosPerTon}`, note: "1.000 kg biomassa" },
                    ].map(s => (React.createElement("div", { key: s.l, style: { background: "rgba(255,255,255,0.03)", borderRadius: 9, padding: "10px 12px" } },
                        React.createElement("div", { style: { fontSize: 10, color: "var(--muted)", textTransform: "uppercase", fontWeight: 600, marginBottom: 4 } }, s.l),
                        React.createElement("div", { style: { fontFamily: "var(--mono)", fontSize: 15, fontWeight: 700 } }, s.v),
                        React.createElement("div", { style: { fontSize: 10, color: "var(--muted)", marginTop: 2 } }, s.note))))),
                    React.createElement("div", { style: { background: "rgba(255,255,255,0.03)", borderRadius: 9, padding: "10px 13px", fontSize: 12, color: "var(--muted)" } },
                        "\uD83D\uDCA1 ",
                        React.createElement("strong", { style: { color: "var(--text)" } }, "Exemplo:"),
                        " 10.000 peixes com peso m\u00E9dio de ",
                        Math.round((phase.minW + phase.maxW) / 2),
                        "g = ",
                        ((10000 * (phase.minW + phase.maxW) / 2 / 1000) * (phase.pct || 0) / 25).toFixed(1),
                        " sacos/dia \u00B7 ",
                        React.createElement("strong", { style: { color: pColor } },
                            phase.protPct,
                            "% de prote\u00EDna"))));
            }),
            React.createElement("div", { className: "card", style: { padding: 16 } },
                React.createElement("div", { style: { fontSize: 13, fontWeight: 700, marginBottom: 10 } }, "\uD83D\uDCD6 O que \u00E9 FCR e por que importa?"),
                React.createElement("div", { style: { fontSize: 12, color: "var(--muted)", lineHeight: 1.8 } },
                    React.createElement("strong", { style: { color: "var(--text)" } }, "FCR = kg de ra\u00E7\u00E3o \u00F7 kg de peso ganho."),
                    React.createElement("br", null),
                    "Exemplo: FCR 2,5 significa que para cada 1 kg que o peixe engorda, voc\u00EA gastou 2,5 kg de ra\u00E7\u00E3o.",
                    React.createElement("br", null),
                    "A meta do seu engenheiro para ",
                    species.name,
                    " \u00E9 ",
                    React.createElement("strong", { style: { color: species.color } },
                        "FCR ",
                        FCR_META[sp]),
                    ".",
                    React.createElement("br", null),
                    "Ra\u00E7\u00E3o com prote\u00EDna adequada \u00E0 fase reduz o FCR \u2014 prote\u00EDna alta demais em engorda \u00E9 desperd\u00EDcio; baixa demais em alevino prejudica o crescimento.")))),
        section === "agua" && (React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 12 } },
            React.createElement("div", { className: "card", style: { padding: 18 } },
                React.createElement("div", { style: { fontSize: 13, fontWeight: 700, color: "#0ea5e9", marginBottom: 14 } },
                    species.icon,
                    " ",
                    species.name,
                    " \u2014 Par\u00E2metros de \u00C1gua"),
                React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 10 } }, [
                    { l: "O₂ Mínimo", v: `${species.minO2} mg/L`, status: "danger", tip: "Abaixo: NÃO alimentar. Ligue aeradores imediatamente." },
                    { l: "O₂ Ideal", v: `${species.idealO2} mg/L`, status: "ok", tip: "Manter acima para máximo crescimento e conversão." },
                    { l: "Temperatura Mínima", v: `${species.minTemp}°C`, status: "warn", tip: "Abaixo: metabolismo lento, reduza ração em 30%." },
                    { l: "Temperatura Ideal", v: `${species.idealTemp}°C`, status: "ok", tip: "Temperatura de máxima eficiência alimentar." },
                    { l: "Temperatura Máxima", v: `${species.maxTemp}°C`, status: "warn", tip: "Acima: estresse, reduza ração, aumente aeração." },
                    { l: "pH Mínimo", v: `${species.phMin}`, status: "warn", tip: "pH ácido reduz apetite e imunidade." },
                    { l: "pH Máximo", v: `${species.phMax}`, status: "warn", tip: "pH alcalino irrita brânquias." },
                    { l: "Amônia (NH₃)", v: "< 0,5 mg/L", status: "danger", tip: "Acima de 0,5: tóxico. Reduza estoque ou faça renovação." },
                ].map(p => {
                    const sc = { ok: "var(--green)", warn: "var(--yellow)", danger: "var(--red)" };
                    return (React.createElement("div", { key: p.l, style: { background: "rgba(255,255,255,0.025)", borderRadius: 10, padding: "12px 14px", borderLeft: `3px solid ${sc[p.status]}` } },
                        React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 } },
                            React.createElement("span", { style: { fontSize: 12, color: "var(--muted)" } }, p.l),
                            React.createElement("span", { style: { fontFamily: "var(--mono)", fontWeight: 700, fontSize: 14, color: sc[p.status] } }, p.v)),
                        React.createElement("div", { style: { fontSize: 11, color: "var(--muted)" } }, p.tip)));
                }))),
            React.createElement("div", { className: "card", style: { padding: 18 } },
                React.createElement("div", { style: { fontSize: 13, fontWeight: 700, marginBottom: 12 } }, "\u26A1 Regras de Decis\u00E3o R\u00E1pida"),
                [
                    { cond: `O₂ ≥ ${species.idealO2} mg/L`, acao: "✅ Alimentar normalmente", color: "var(--green)" },
                    { cond: `O₂ ${species.minO2}–${species.idealO2} mg/L`, acao: "⚠️ Alimentar metade da ração", color: "var(--yellow)" },
                    { cond: `O₂ < ${species.minO2} mg/L`, acao: "🚫 NÃO alimentar — ligar aeradores", color: "var(--red)" },
                    { cond: `Temp. abaixo de ${species.minTemp}°C`, acao: "↓ Reduzir ração em 30%", color: "var(--yellow)" },
                    { cond: `Temp. acima de ${species.maxTemp}°C`, acao: "↓ Reduzir ração em 20%, aumentar aeração", color: "var(--yellow)" },
                    { cond: "pH fora da faixa", acao: "🧪 Acionar engenheiro para correção", color: "var(--yellow)" },
                ].map(r => (React.createElement("div", { key: r.cond, style: { display: "flex", gap: 12, alignItems: "center", padding: "9px 0", borderBottom: "1px solid var(--border)" } },
                    React.createElement("span", { style: { fontFamily: "var(--mono)", fontSize: 12, color: r.color, minWidth: 180, flexShrink: 0 } }, r.cond),
                    React.createElement("span", { style: { fontSize: 13, fontWeight: 600 } }, r.acao))))))),
        section === "fcr" && (React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 12 } },
            React.createElement("div", { className: "card", style: { padding: 18 } },
                React.createElement("div", { style: { fontSize: 13, fontWeight: 700, marginBottom: 14 } }, "\uD83D\uDCCA O que afeta o FCR no dia a dia"),
                [
                    { ico: "💧", cause: "O₂ baixo", effect: "Peixe não come bem → FCR piora", sev: "danger" },
                    { ico: "🍽️", cause: "Sobra de ração", effect: "Desperdício → FCR sobe sem ganho de peso", sev: "warn" },
                    { ico: "📅", cause: "Biometria atrasada", effect: "Ração calculada errada → FCR distorce", sev: "warn" },
                    { ico: "🌡️", cause: "Temp. fora do ideal", effect: "Metabolismo ruim → FCR piora", sev: "warn" },
                    { ico: "🧪", cause: "Proteína errada", effect: "Baixa: crescimento fraco / Alta: desperdício", sev: "warn" },
                    { ico: "⏰", cause: "Horário irregular", effect: "Peixes estressados → menor aproveitamento", sev: "info" },
                ].map(r => {
                    const sc = { danger: "var(--red)", warn: "var(--yellow)", info: "var(--accent)" };
                    return (React.createElement("div", { key: r.cause, style: { display: "flex", gap: 12, alignItems: "flex-start", padding: "10px 0", borderBottom: "1px solid var(--border)" } },
                        React.createElement("span", { style: { fontSize: 20, flexShrink: 0 } }, r.ico),
                        React.createElement("div", null,
                            React.createElement("div", { style: { fontWeight: 700, fontSize: 13, color: sc[r.sev] } }, r.cause),
                            React.createElement("div", { style: { fontSize: 12, color: "var(--muted)", marginTop: 2 } }, r.effect))));
                })),
            React.createElement("div", { className: "card", style: { padding: 18 } },
                React.createElement("div", { style: { fontSize: 13, fontWeight: 700, marginBottom: 12 } },
                    "\uD83C\uDFC6 Classifica\u00E7\u00E3o do FCR \u2014 ",
                    species.name),
                [
                    { range: "Abaixo de 2,0", label: "Excelente", color: "#22c55e", note: "Raro em semi-intensivo" },
                    { range: "2,0 – 2,5", label: "✦ Meta do eng.", color: "#22c55e", note: "Objetivo da produção" },
                    { range: "2,5 – 3,0", label: "Aceitável", color: "#f59e0b", note: "Investigar causas" },
                    { range: "3,0 – 3,5", label: "Ruim", color: "var(--red)", note: "Ação imediata necessária" },
                    { range: "Acima de 3,5", label: "Crítico", color: "var(--red)", note: "Prejuízo operacional" },
                ].map(r => (React.createElement("div", { key: r.range, style: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 0", borderBottom: "1px solid var(--border)" } },
                    React.createElement("span", { style: { fontFamily: "var(--mono)", fontSize: 13, fontWeight: 600 } }, r.range),
                    React.createElement("span", { style: { fontWeight: 700, color: r.color, fontSize: 13 } }, r.label),
                    React.createElement("span", { style: { fontSize: 12, color: "var(--muted)" } }, r.note))))))),
        section === "densidade" && (React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 12 } },
            React.createElement("div", { className: "card", style: { padding: 18 } },
                React.createElement("div", { style: { fontSize: 13, fontWeight: 700, color: species.color, marginBottom: 14 } },
                    species.icon,
                    " ",
                    species.name,
                    " \u2014 Capacidade por \u00C1rea e Volume"),
                React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 10, marginBottom: 16 } }, [
                    { l: "Densidade máx. (superfície)", v: `${species.densityPerM2} peixe/m²`, tip: "Limite pela troca gasosa/aeração" },
                    { l: "Biomassa máx. (volume)", v: `${species.kgPerM3} kg/m³`, tip: "Limite pela diluição de amônia" },
                    { l: "Profundidade mínima", v: `${species.minDepthM} m`, tip: "Abaixo: volume insuficiente" },
                    { l: "Profundidade ideal", v: `${species.idealDepthM} m`, tip: "Melhor relação volume/aeração" },
                    { l: "Profundidade máxima", v: `${species.maxDepthM} m`, tip: "Acima: aeradores perdem alcance" },
                ].map(i => (React.createElement("div", { key: i.l, style: { background: "rgba(255,255,255,0.025)", borderRadius: 9, padding: "11px 13px" } },
                    React.createElement("div", { style: { fontSize: 11, color: "var(--muted)", fontWeight: 600, marginBottom: 4 } }, i.l),
                    React.createElement("div", { style: { fontFamily: "var(--mono)", fontSize: 15, fontWeight: 700, color: species.color } }, i.v),
                    React.createElement("div", { style: { fontSize: 11, color: "var(--muted)", marginTop: 3 } }, i.tip))))),
                React.createElement("div", { style: { fontSize: 12, fontWeight: 700, marginBottom: 10 } }, "\uD83D\uDCD0 Efeito da Profundidade na Capacidade"),
                [
                    { range: "< 1,0 m", mult: "−25%", status: "danger", note: "Raso demais — amônia concentra, evitar" },
                    { range: "1,0–1,2 m", mult: "−10%", status: "warn", note: "Abaixo do ideal — reduza densidade" },
                    { range: "1,2–1,8 m", mult: "✓ Referência", status: "ok", note: "Faixa ideal para semi-intensivo" },
                    { range: "1,8–2,5 m", mult: "+10%", status: "ok", note: "Volume extra melhora diluição" },
                    { range: "> 2,5 m", mult: "+5%", status: "warn", note: "Aeradores podem perder alcance nas camadas fundas" },
                ].map(r => {
                    const sc = { ok: "var(--green)", warn: "var(--yellow)", danger: "var(--red)" };
                    return (React.createElement("div", { key: r.range, style: { display: "flex", gap: 10, alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--border)", fontSize: 12 } },
                        React.createElement("span", { style: { fontFamily: "var(--mono)", minWidth: 90, color: "var(--muted)" } }, r.range),
                        React.createElement("span", { style: { fontWeight: 700, color: sc[r.status], minWidth: 100 } }, r.mult),
                        React.createElement("span", { style: { color: "var(--muted)" } }, r.note)));
                }))))));
}
// ═══════════════════════════════════════════════════════════════════════════════
// STOCK PANEL
// ═══════════════════════════════════════════════════════════════════════════════
function StockPanel() {
    const { stock, setStock } = useApp();
    return (React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 14 } },
        React.createElement("div", { className: "grid2" },
            React.createElement("div", { className: "card", style: { padding: 18 } },
                React.createElement("div", { className: "section-hdr" }, "\uD83D\uDCE6 Saldo Atual"),
                React.createElement("div", { style: { fontFamily: "var(--mono)", fontSize: 28, fontWeight: 700, color: stock.bags <= stock.minAlert ? "var(--red)" : "var(--green)", marginBottom: 4 } },
                    stock.bags,
                    " sacos"),
                React.createElement("div", { style: { fontSize: 13, color: "var(--muted)", marginBottom: 14 } },
                    (stock.bags * 25).toFixed(0),
                    " kg \u00B7 Valor em estoque: ",
                    fmtBRL(stock.bags * stock.costPerBag)),
                React.createElement("div", { style: { fontSize: 12, color: "var(--muted)" } },
                    "Custo m\u00E9dio/saco: ",
                    React.createElement("strong", { style: { color: "var(--text)" } }, fmtBRL(stock.costPerBag))),
                React.createElement("div", { style: { marginTop: 12, display: "flex", alignItems: "center", gap: 10 } },
                    React.createElement("span", { style: { fontSize: 12, color: "var(--muted)" } }, "Alerta m\u00EDnimo:"),
                    React.createElement("input", { className: "inp", type: "number", style: { width: 80 }, value: stock.minAlert, onChange: e => setStock(p => ({ ...p, minAlert: parseInt(e.target.value) || 0 })) }),
                    React.createElement("span", { style: { fontSize: 12, color: "var(--muted)" } }, "sacos")),
                stock.bags <= stock.minAlert && (React.createElement("div", { className: "alert-bar pulse", style: { background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)", color: "#f87171", marginTop: 12 } }, "\uD83D\uDEA8 Estoque abaixo do m\u00EDnimo!"))),
            React.createElement("div", { className: "card", style: { padding: 18 } },
                React.createElement("div", { className: "section-hdr" }, "\uD83D\uDCCA Consumo por Tanque"),
                (() => {
                    const byTank = {};
                    stock.history.filter(h => h.type === "out").forEach(h => {
                        byTank[h.tankId || "geral"] = (byTank[h.tankId || "geral"] || 0) + h.bags;
                    });
                    return Object.entries(byTank).length === 0 ? (React.createElement("p", { style: { color: "var(--muted)", fontSize: 13 } }, "Nenhum consumo registrado.")) : Object.entries(byTank).map(([tid, bags]) => (React.createElement("div", { key: tid, style: { display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--border)", fontSize: 13 } },
                        React.createElement("span", { style: { color: "var(--muted)" } }, tid === "geral" ? "Geral" : tid),
                        React.createElement("span", { style: { fontFamily: "var(--mono)", fontWeight: 600 } },
                            bags,
                            " sacos"))));
                })())),
        React.createElement("div", { className: "card", style: { padding: 18 } },
            React.createElement("div", { className: "section-hdr" }, "\uD83D\uDCCB Hist\u00F3rico de Movimenta\u00E7\u00F5es"),
            React.createElement("table", null,
                React.createElement("thead", null,
                    React.createElement("tr", null,
                        React.createElement("th", null, "Data"),
                        React.createElement("th", null, "Tipo"),
                        React.createElement("th", null, "Fornecedor"),
                        React.createElement("th", null, "NF n\u00BA"),
                        React.createElement("th", null, "Tipo Ra\u00E7\u00E3o"),
                        React.createElement("th", null, "Sacos"),
                        React.createElement("th", null, "R$/saco"),
                        React.createElement("th", null, "Total"),
                        React.createElement("th", null, "Pagamento"))),
                React.createElement("tbody", null,
                    [...stock.history].reverse().slice(0, 50).map((h, i) => (React.createElement("tr", { key: i },
                        React.createElement("td", { style: { fontFamily: "var(--mono)", fontSize: 12 } }, h.date),
                        React.createElement("td", null,
                            React.createElement("span", { className: "badge", style: { background: h.type === "in" ? "rgba(34,197,94,0.12)" : "rgba(245,158,11,0.12)", color: h.type === "in" ? "var(--green)" : "var(--yellow)", fontSize: 10 } },
                                h.type === "in" ? "📥 Entrada" : "📤 Saída",
                                h.source === "pdf" ? " 🤖" : "")),
                        React.createElement("td", { style: { fontSize: 12 } }, h.supplier || h.note || "—"),
                        React.createElement("td", { style: { fontFamily: "var(--mono)", fontSize: 12 } }, h.nfNumber || "—"),
                        React.createElement("td", { style: { fontSize: 12, color: "var(--muted)" } }, h.feedType ? `${h.feedType}${h.proteinPct ? " " + h.proteinPct : ""}${h.feedBrand ? " · " + h.feedBrand : ""}` : "—"),
                        React.createElement("td", { style: { fontFamily: "var(--mono)", fontWeight: 600 } }, h.bags),
                        React.createElement("td", { style: { fontFamily: "var(--mono)", fontSize: 12 } }, h.costPerBag ? fmtBRL(h.costPerBag) : "—"),
                        React.createElement("td", { style: { fontFamily: "var(--mono)", fontWeight: 600, color: "var(--green)" } }, h.total ? fmtBRL(h.total) : "—"),
                        React.createElement("td", { style: { fontSize: 12, color: "var(--muted)" } }, h.payMethod || "—")))),
                    stock.history.length === 0 && React.createElement("tr", null,
                        React.createElement("td", { colSpan: 9, style: { textAlign: "center", color: "var(--muted)", padding: 20 } }, "Nenhuma movimenta\u00E7\u00E3o registrada")))))));
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
    // Use last non-zero reading of the day for feed decision
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
                { ico: "🌊", val: `${tank.depth || 1.5}m`, lbl: "Profund.", warn: tank.depth && tank.depth < (((_a = SP[tank.species]) === null || _a === void 0 ? void 0 : _a.minDepthM) || 1.2) },
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
// DAILY TAB — 3 leituras diárias de qualidade de água
// ═══════════════════════════════════════════════════════════════════════════════
function DailyTab({ tank, phase, dailyFeedKg, sp, session, role }) {
    var _a;
    const { updateDayLog, logs, activeDate, setActiveDate, consumeStock, stock, waterTimes, goHome } = useApp();
    const dl = ((_a = logs[tank.id]) === null || _a === void 0 ? void 0 : _a[activeDate]) || {};
    // readings[0]=manhã, [1]=tarde, [2]=noite
    const emptyReadings = waterTimes.map(t => ({ time: t, o2: "", temp: "", ph: "" }));
    const [readings, setReadings] = (0, useState)(() => {
        var _a;
        if ((_a = dl.readings) === null || _a === void 0 ? void 0 : _a.length)
            return dl.readings.map((r, i) => ({ time: waterTimes[i] || r.time || emptyReadings[i].time, o2: r.o2 || "", temp: r.temp || "", ph: r.ph || "" }));
        return emptyReadings;
    });
    const [feedForm, setFeedForm] = (0, useState)({ feedGiven: "", feedRefused: "", mortality: dl.mortality || "", obs: dl.obs || "" });
    // Engineer visit — pH + full water panel, tracks quinzena visits
    const [engVisit, setEngVisit] = (0, useState)(() => {
        var _a, _b, _c, _d, _e, _f, _g;
        return ({
            active: !!((_a = dl.engVisit) === null || _a === void 0 ? void 0 : _a.active),
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
        if ((_b = d.readings) === null || _b === void 0 ? void 0 : _b.length)
            setReadings(d.readings.map((r, i) => ({ time: waterTimes[i] || r.time, o2: r.o2 || "", temp: r.temp || "", ph: r.ph || "" })));
        else
            setReadings(waterTimes.map(t => ({ time: t, o2: "", temp: "" })));
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
    // Last non-zero O₂ reading for feed decision
    const lastO2 = [...readings].reverse().find(r => parseFloat(r.o2) > 0);
    const o2ForAlert = lastO2 ? parseFloat(lastO2.o2) : 0;
    const feedAlert = o2ForAlert > 0 && o2ForAlert < ((sp === null || sp === void 0 ? void 0 : sp.minO2) || 5);
    const dailySacks = dailyFeedKg / 25;
    const sacosPerMeal = dailySacks / ((phase === null || phase === void 0 ? void 0 : phase.freq) || 1);
    // Meal-based feed tracking — each refeição has time + sacos
    const defaultMeals = ((phase === null || phase === void 0 ? void 0 : phase.freq) >= 4 ? ["06:00", "09:00", "12:00", "16:00"] :
        (phase === null || phase === void 0 ? void 0 : phase.freq) >= 3 ? ["06:00", "11:00", "16:00"] :
            (phase === null || phase === void 0 ? void 0 : phase.freq) >= 2 ? ["06:00", "15:00"] :
                ["08:00"]).map(t => ({ time: t, sacos: "", refused: "" }));
    const [meals, setMeals] = (0, useState)(() => {
        var _a;
        if ((_a = dl.meals) === null || _a === void 0 ? void 0 : _a.length)
            return dl.meals.map((m, i) => {
                var _a;
                return ({
                    time: m.time || (((_a = defaultMeals[i]) === null || _a === void 0 ? void 0 : _a.time) || "08:00"),
                    sacos: m.sacos || "",
                    refused: m.refused || ""
                });
            });
        return defaultMeals;
    });
    const [mealCount, setMealCount] = (0, useState)(() => { var _a; return ((_a = dl.meals) === null || _a === void 0 ? void 0 : _a.length) || (phase === null || phase === void 0 ? void 0 : phase.freq) || 2; });
    // Sync meals on date change
    (0, useEffect)(() => {
        var _a, _b, _c;
        const d = ((_a = logs[tank.id]) === null || _a === void 0 ? void 0 : _a[activeDate]) || {};
        if ((_b = d.meals) === null || _b === void 0 ? void 0 : _b.length)
            setMeals(d.meals.map((m, i) => { var _a; return ({ time: m.time || (((_a = defaultMeals[i]) === null || _a === void 0 ? void 0 : _a.time) || "08:00"), sacos: m.sacos || "", refused: m.refused || "" }); }));
        else
            setMeals(defaultMeals);
        setMealCount(((_c = d.meals) === null || _c === void 0 ? void 0 : _c.length) || (phase === null || phase === void 0 ? void 0 : phase.freq) || 2);
    }, [activeDate, tank.id]);
    function updateMeal(idx, field, val) { setMeals(prev => prev.map((m, i) => i === idx ? { ...m, [field]: val } : m)); }
    function addMeal() {
        const templates = ["06:00", "08:00", "10:00", "12:00", "14:00", "16:00", "18:00", "20:00"];
        const t = templates[meals.length] || "08:00";
        setMeals(prev => [...prev, { time: t, sacos: "", refused: "" }]);
        setMealCount(c => c + 1);
    }
    function removeMeal(idx) { setMeals(prev => prev.filter((_, i) => i !== idx)); setMealCount(c => Math.max(1, c - 1)); }
    // Totals from meals
    const totalGivenSacos = meals.reduce((s, m) => s + parseFloat(m.sacos || 0), 0);
    const totalRefusedSacos = meals.reduce((s, m) => s + parseFloat(m.refused || 0), 0);
    const totalConsumedSacos = totalGivenSacos - totalRefusedSacos;
    const totalGivenKg = totalGivenSacos * 25;
    const totalRefusedKg = totalRefusedSacos * 25;
    // O₂ stats across readings
    const validO2s = readings.map(r => parseFloat(r.o2)).filter(v => v > 0);
    const minO2today = validO2s.length ? Math.min(...validO2s).toFixed(1) : "—";
    const maxO2today = validO2s.length ? Math.max(...validO2s).toFixed(1) : "—";
    const validTemps = readings.map(r => parseFloat(r.temp)).filter(v => v > 0);
    const ampTemp = validTemps.length >= 2 ? (Math.max(...validTemps) - Math.min(...validTemps)).toFixed(1) : "—";
    function updateReading(idx, field, val) {
        setReadings(prev => prev.map((r, i) => i === idx ? { ...r, [field]: val } : r));
    }
    function handleSave() {
        var _a;
        // Only deduct the DIFF from what was already saved today (prevents double-deduction)
        const prevSacos = (dl.feedGivenKg || 0) / 25;
        const diff = totalGivenSacos - prevSacos;
        const payload = {
            readings,
            meals,
            o2: o2ForAlert || "",
            temp: ((_a = readings.find(r => r.temp)) === null || _a === void 0 ? void 0 : _a.temp) || "",
            feedGiven: totalGivenSacos, // sacos — for FCR calc compat
            feedGivenKg: totalGivenKg, // kg — for chart compat
            feedRefusedKg: totalRefusedKg,
            mortality: feedForm.mortality,
            obs: feedForm.obs,
            engVisit: engVisit.active ? engVisit : null,
            savedAt: new Date().toISOString()
        };
        updateDayLog(tank.id, activeDate, payload);
        // Only deduct new sacos from stock (diff prevents triple-deduction on re-save)
        if (diff > 0)
            consumeStock(diff, tank.id, `Arraçoamento ${tank.name} ${activeDate}`);
        goHome();
    }
    // Status colors for each reading
    function o2Status(val) {
        const v = parseFloat(val);
        if (!v)
            return { color: "var(--muted)", label: "—" };
        if (v < ((sp === null || sp === void 0 ? void 0 : sp.minO2) || 5) - 1)
            return { color: "var(--red)", label: "🔴 Crítico" };
        if (v < ((sp === null || sp === void 0 ? void 0 : sp.minO2) || 5))
            return { color: "var(--yellow)", label: "🟡 Atenção" };
        if (v >= ((sp === null || sp === void 0 ? void 0 : sp.idealO2) || 7))
            return { color: "var(--green)", label: "✅ Ótimo" };
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
                    React.createElement("div", { style: { fontFamily: "var(--mono)", fontSize: 18, fontWeight: 700, color: sp === null || sp === void 0 ? void 0 : sp.color } },
                        dailySacks.toFixed(3),
                        " sacos/dia"),
                    React.createElement("div", { style: { fontSize: 11, color: "var(--muted)" } }, phase === null || phase === void 0 ? void 0 :
                        phase.freq,
                        "x \u00B7 ",
                        (dailySacks / (phase === null || phase === void 0 ? void 0 : phase.freq)).toFixed(3),
                        " sc/refei\u00E7\u00E3o \u00B7 ",
                        React.createElement("span", { style: { color: "#fbbf24", fontWeight: 700 } },
                            "prot. ", phase === null || phase === void 0 ? void 0 :
                            phase.protPct,
                            "%")),
                    React.createElement("div", { style: { fontSize: 11, color: "var(--muted)", marginTop: 2 } },
                        "Estoque: ",
                        React.createElement("strong", { style: { color: stock.bags < 10 ? "var(--red)" : "var(--text)" } },
                            stock.bags,
                            " sacos")))),
            feedAlert && (React.createElement("div", { className: "alert-bar pulse", style: { background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)", color: "#f87171", marginTop: 12 } },
                "\uD83D\uDEAB ",
                React.createElement("strong", null, "N\u00C3O ALIMENTAR"),
                " \u2014 \u00DAltima leitura O\u2082: ",
                o2ForAlert,
                " mg/L (m\u00EDn: ", sp === null || sp === void 0 ? void 0 :
                sp.minO2,
                "). Acione aeradores.")),
            validO2s.length > 0 && (React.createElement("div", { style: { display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" } }, [
                { l: "O₂ mín. hoje", v: `${minO2today} mg/L`, warn: parseFloat(minO2today) < ((sp === null || sp === void 0 ? void 0 : sp.minO2) || 5) },
                { l: "O₂ máx. hoje", v: `${maxO2today} mg/L` },
                { l: "Amplitude Temp.", v: ampTemp !== "—" ? `${ampTemp}°C` : "—" },
                { l: "Leituras feitas", v: `${validO2s.length}/3` },
                ...(engVisit.ph ? [{ l: "pH (engenheiro)", v: engVisit.ph, warn: parseFloat(engVisit.ph) < ((sp === null || sp === void 0 ? void 0 : sp.phMin) || 6.5) || parseFloat(engVisit.ph) > ((sp === null || sp === void 0 ? void 0 : sp.phMax) || 8.5) }] : []),
            ].map(s => (React.createElement("div", { key: s.l, style: { background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: "7px 11px", flex: 1, minWidth: 90 } },
                React.createElement("div", { style: { fontSize: 10, color: "var(--muted)", textTransform: "uppercase", fontWeight: 600 } }, s.l),
                React.createElement("div", { style: { fontFamily: "var(--mono)", fontWeight: 700, fontSize: 14, color: s.warn ? "var(--red)" : "var(--text)" } }, s.v))))))),
        React.createElement("div", { className: "card", style: { padding: 18 } },
            React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 } },
                React.createElement("div", { className: "section-hdr", style: { margin: 0 } }, "\uD83D\uDCA7 Qualidade da \u00C1gua \u2014 3 Leituras"),
                React.createElement("div", { style: { fontSize: 11, color: "var(--muted)" } },
                    "m\u00EDn O\u2082: ", sp === null || sp === void 0 ? void 0 :
                    sp.minO2,
                    " \u00B7 ideal: ", sp === null || sp === void 0 ? void 0 :
                    sp.idealO2,
                    " mg/L")),
            React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 } }, readings.map((r, i) => {
                const st = o2Status(r.o2);
                return (React.createElement("div", { key: i, style: { background: "rgba(255,255,255,0.03)", borderRadius: 10, padding: 12, border: `1px solid ${r.o2 ? st.color + "44" : "var(--border)"}` } },
                    React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 } },
                        React.createElement("span", { style: { fontSize: 12, fontWeight: 700 } }, slotLabels[i]),
                        React.createElement("span", { style: { fontSize: 10, color: st.color, fontWeight: 600 } }, r.o2 ? st.label : "")),
                    React.createElement("div", { style: { fontSize: 11, color: "var(--muted)", marginBottom: 8, textAlign: "center", fontFamily: "var(--mono)" } }, r.time),
                    React.createElement("div", { style: { marginBottom: 8 } },
                        React.createElement("lbl", null, "O\u2082 (mg/L)"),
                        React.createElement("input", { className: "inp", type: "number", step: "0.1", placeholder: `≥${sp === null || sp === void 0 ? void 0 : sp.idealO2}`, value: r.o2, style: { textAlign: "center", fontWeight: 700, fontSize: 15,
                                color: r.o2 ? (parseFloat(r.o2) < ((sp === null || sp === void 0 ? void 0 : sp.minO2) || 5) ? "var(--red)" : "var(--green)") : "var(--text)" }, onChange: e => updateReading(i, "o2", e.target.value) })),
                    React.createElement("div", { style: { marginBottom: r.ph !== undefined ? 8 : 0 } },
                        React.createElement("lbl", null, "Temp (\u00B0C)"),
                        React.createElement("input", { className: "inp", type: "number", step: "0.1", placeholder: `${sp === null || sp === void 0 ? void 0 : sp.idealTemp}°C`, value: r.temp, style: { textAlign: "center" }, onChange: e => updateReading(i, "temp", e.target.value) })),
                    engVisit.active && (React.createElement("div", null,
                        React.createElement("lbl", { style: { color: "#a78bfa" } }, "pH (opcional)"),
                        React.createElement("input", { className: "inp", type: "number", step: "0.1", placeholder: `${sp === null || sp === void 0 ? void 0 : sp.phMin}–${sp === null || sp === void 0 ? void 0 : sp.phMax}`, value: r.ph, style: { textAlign: "center", borderColor: r.ph && (parseFloat(r.ph) < ((sp === null || sp === void 0 ? void 0 : sp.phMin) || 6.5) || parseFloat(r.ph) > ((sp === null || sp === void 0 ? void 0 : sp.phMax) || 8.5)) ? "var(--red)" : "var(--border2)" }, onChange: e => updateReading(i, "ph", e.target.value) })))));
            })),
            React.createElement("div", { style: { marginTop: 12, fontSize: 11, color: "var(--muted)", display: "flex", gap: 14, flexWrap: "wrap" } },
                React.createElement("span", null,
                    "\uD83D\uDD34 Cr\u00EDtico: < ",
                    ((sp === null || sp === void 0 ? void 0 : sp.minO2) || 5) - 1,
                    " mg/L"),
                React.createElement("span", null,
                    "\uD83D\uDFE1 Aten\u00E7\u00E3o: ",
                    ((sp === null || sp === void 0 ? void 0 : sp.minO2) || 5) - 1,
                    "\u2013", sp === null || sp === void 0 ? void 0 :
                    sp.minO2,
                    " mg/L"),
                React.createElement("span", null,
                    "\u2705 Ok: \u2265 ", sp === null || sp === void 0 ? void 0 :
                    sp.minO2,
                    " mg/L"),
                React.createElement("span", null,
                    "\u2B50 \u00D3timo: \u2265 ", sp === null || sp === void 0 ? void 0 :
                    sp.idealO2,
                    " mg/L")),
            React.createElement("div", { style: { marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--border)" } },
                React.createElement("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between" } },
                    React.createElement("div", null,
                        React.createElement("div", { style: { fontSize: 13, fontWeight: 700, color: "#a78bfa" } }, "\uD83E\uDDD1\u200D\uD83D\uDD2C Visita do Engenheiro de Pesca"),
                        React.createElement("div", { style: { fontSize: 11, color: "var(--muted)", marginTop: 2 } }, "Ativa campos extras: pH, am\u00F4nia, dureza e alcalinidade")),
                    React.createElement("button", { onClick: () => setEngVisit(p => ({ ...p, active: !p.active })), style: { padding: "7px 16px", borderRadius: 9, cursor: "pointer", fontFamily: "var(--font)", fontWeight: 700, fontSize: 13,
                            background: engVisit.active ? "linear-gradient(135deg,#a78bfa,#7c3aed)" : "rgba(255,255,255,0.05)",
                            border: engVisit.active ? "none" : "1px solid var(--border2)",
                            color: engVisit.active ? "#fff" : "var(--muted)", transition: "all .2s" } }, engVisit.active ? "✅ Ativo" : "Ativar")))),
        engVisit.active && (React.createElement("div", { className: "card", style: { padding: 18, border: "1px solid rgba(167,139,250,0.3)", background: "rgba(167,139,250,0.04)" } },
            React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, marginBottom: 16 } },
                React.createElement("span", { style: { fontSize: 18 } }, "\uD83E\uDDD1\u200D\uD83D\uDD2C"),
                React.createElement("div", null,
                    React.createElement("div", { style: { fontWeight: 700, fontSize: 14, color: "#a78bfa" } }, "Par\u00E2metros da Visita do Engenheiro"),
                    React.createElement("div", { style: { fontSize: 11, color: "var(--muted)" } }, "Quinzenal \u00B7 Registre todos os dados medidos na visita"))),
            React.createElement("div", { className: "grid2", style: { marginBottom: 12 } },
                React.createElement("div", null,
                    React.createElement("lbl", { style: { color: "#a78bfa" } }, "pH da \u00C1gua"),
                    React.createElement("input", { className: "inp", type: "number", step: "0.1", placeholder: `ideal: ${sp === null || sp === void 0 ? void 0 : sp.phMin}–${sp === null || sp === void 0 ? void 0 : sp.phMax}`, value: engVisit.ph, style: { borderColor: engVisit.ph && (parseFloat(engVisit.ph) < ((sp === null || sp === void 0 ? void 0 : sp.phMin) || 6.5) || parseFloat(engVisit.ph) > ((sp === null || sp === void 0 ? void 0 : sp.phMax) || 8.5)) ? "var(--red)" : "rgba(167,139,250,0.3)" }, onChange: e => setEngVisit(p => ({ ...p, ph: e.target.value })) }),
                    engVisit.ph && (React.createElement("div", { style: { fontSize: 11, marginTop: 4, color: parseFloat(engVisit.ph) < ((sp === null || sp === void 0 ? void 0 : sp.phMin) || 6.5) || parseFloat(engVisit.ph) > ((sp === null || sp === void 0 ? void 0 : sp.phMax) || 8.5)
                                ? "var(--red)" : "var(--green)" } }, parseFloat(engVisit.ph) < ((sp === null || sp === void 0 ? void 0 : sp.phMin) || 6.5) ? "⚠️ pH ácido — abaixo do ideal" :
                        parseFloat(engVisit.ph) > ((sp === null || sp === void 0 ? void 0 : sp.phMax) || 8.5) ? "⚠️ pH alcalino — acima do ideal" : "✅ pH dentro da faixa ideal"))),
                React.createElement("div", null,
                    React.createElement("lbl", { style: { color: "#a78bfa" } }, "Am\u00F4nia NH\u2083 (mg/L)"),
                    React.createElement("input", { className: "inp", type: "number", step: "0.01", placeholder: "ideal < 0.5", value: engVisit.ammonia, style: { borderColor: engVisit.ammonia && parseFloat(engVisit.ammonia) > 0.5 ? "var(--red)" : "rgba(167,139,250,0.3)" }, onChange: e => setEngVisit(p => ({ ...p, ammonia: e.target.value })) }),
                    engVisit.ammonia && parseFloat(engVisit.ammonia) > 0.5 && (React.createElement("div", { style: { fontSize: 11, marginTop: 4, color: "var(--red)" } }, "\u26A0\uFE0F Am\u00F4nia alta \u2014 risco de intoxica\u00E7\u00E3o"))),
                React.createElement("div", null,
                    React.createElement("lbl", { style: { color: "#a78bfa" } }, "Dureza Total (mg/L CaCO\u2083)"),
                    React.createElement("input", { className: "inp", type: "number", step: "1", placeholder: "ideal 50\u2013150", value: engVisit.hardness, onChange: e => setEngVisit(p => ({ ...p, hardness: e.target.value })) })),
                React.createElement("div", null,
                    React.createElement("lbl", { style: { color: "#a78bfa" } }, "Alcalinidade (mg/L CaCO\u2083)"),
                    React.createElement("input", { className: "inp", type: "number", step: "1", placeholder: "ideal 30\u2013150", value: engVisit.alkalinity, onChange: e => setEngVisit(p => ({ ...p, alkalinity: e.target.value })) }))),
            React.createElement("div", { className: "grid2" },
                React.createElement("div", null,
                    React.createElement("lbl", { style: { color: "#a78bfa" } }, "Nome do Engenheiro"),
                    React.createElement("input", { className: "inp", placeholder: "ex: Dr. Jo\u00E3o Silva", value: engVisit.engineer, onChange: e => setEngVisit(p => ({ ...p, engineer: e.target.value })) })),
                React.createElement("div", null,
                    React.createElement("lbl", { style: { color: "#a78bfa" } }, "Observa\u00E7\u00F5es / Recomenda\u00E7\u00F5es"),
                    React.createElement("input", { className: "inp", placeholder: "Recomenda\u00E7\u00F5es do engenheiro...", value: engVisit.notes, onChange: e => setEngVisit(p => ({ ...p, notes: e.target.value })) }))),
            React.createElement("div", { style: { marginTop: 14, background: "rgba(167,139,250,0.06)", borderRadius: 9, padding: "10px 13px", fontSize: 12 } },
                React.createElement("span", { style: { color: "#a78bfa", fontWeight: 600 } },
                    "Faixas de refer\u00EAncia (", sp === null || sp === void 0 ? void 0 :
                    sp.name,
                    "): "),
                React.createElement("span", { style: { color: "var(--muted)" } },
                    "pH ", sp === null || sp === void 0 ? void 0 :
                    sp.phMin,
                    "\u2013", sp === null || sp === void 0 ? void 0 :
                    sp.phMax,
                    " \u00B7 Am\u00F4nia < 0,5 mg/L \u00B7 Dureza 50\u2013150 \u00B7 Alcalinidade 30\u2013150 mg/L CaCO\u2083")))),
        React.createElement("div", { className: "card", style: { padding: 18 } },
            React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14, flexWrap: "wrap", gap: 10 } },
                React.createElement("div", null,
                    React.createElement("div", { className: "section-hdr", style: { margin: 0, marginBottom: 6 } }, "\uD83C\uDF7D\uFE0F Alimenta\u00E7\u00E3o \u2014 Refei\u00E7\u00F5es do Dia"),
                    React.createElement("div", { style: { fontSize: 12, color: "var(--muted)" } },
                        "Recomendado: ",
                        React.createElement("strong", { style: { color: sp === null || sp === void 0 ? void 0 : sp.color, fontFamily: "var(--mono)" } },
                            dailySacks.toFixed(3),
                            " sacos/dia"),
                        "\u00B7 ",
                        sacosPerMeal.toFixed(3),
                        " sc/refei\u00E7\u00E3o \u00B7 prot. ",
                        React.createElement("span", { style: { color: "#fbbf24", fontWeight: 700 } }, phase === null || phase === void 0 ? void 0 :
                            phase.protPct,
                            "%"))),
                React.createElement("div", { style: { background: "rgba(0,0,0,0.2)", borderRadius: 9, padding: "8px 14px", textAlign: "center" } },
                    React.createElement("div", { style: { fontSize: 10, color: "var(--muted)", textTransform: "uppercase", fontWeight: 600 } }, "Tipo"),
                    React.createElement("div", { style: { fontSize: 13, fontWeight: 700, marginTop: 2 } }, (() => { var _a, _b, _c, _d; const ft = (_a = SP[tank.species]) === null || _a === void 0 ? void 0 : _a.feedTable; const idx = (_c = (_b = SP[tank.species]) === null || _b === void 0 ? void 0 : _b.phases) === null || _c === void 0 ? void 0 : _c.findIndex(p => p.name === (phase === null || phase === void 0 ? void 0 : phase.name)); return ((_d = ft === null || ft === void 0 ? void 0 : ft[idx]) === null || _d === void 0 ? void 0 : _d.obs) || ""; })()))),
            React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 } }, meals.map((meal, i) => {
                const sacs = parseFloat(meal.sacos || 0);
                const ref = parseFloat(meal.refused || 0);
                const cons = sacs - ref;
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
                                React.createElement("button", { onClick: () => updateMeal(i, "sacos", Math.max(0, sacs - 0.5).toFixed(3)), style: { width: 32, height: 36, borderRadius: 7, border: "1px solid var(--border2)", background: "rgba(255,255,255,0.04)", cursor: "pointer", color: "var(--text)", fontSize: 18, fontFamily: "var(--font)" } }, "\u2212"),
                                React.createElement("input", { className: "inp", type: "number", step: "0.001", min: "0", style: { textAlign: "center", fontFamily: "var(--mono)", fontWeight: 700, fontSize: 15, flex: 1 }, placeholder: sacosPerMeal.toFixed(3), value: meal.sacos, onChange: e => updateMeal(i, "sacos", e.target.value) }),
                                React.createElement("button", { onClick: () => updateMeal(i, "sacos", (sacs + 0.5).toFixed(3)), style: { width: 32, height: 36, borderRadius: 7, border: "1px solid var(--border2)", background: "rgba(255,255,255,0.04)", cursor: "pointer", color: "var(--text)", fontSize: 18, fontFamily: "var(--font)" } }, "+"))),
                        React.createElement("div", null,
                            React.createElement("lbl", null, "Recusado / sobra"),
                            React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 6, marginTop: 4 } },
                                React.createElement("button", { onClick: () => updateMeal(i, "refused", Math.max(0, ref - 0.1).toFixed(3)), style: { width: 32, height: 36, borderRadius: 7, border: "1px solid var(--border2)", background: "rgba(255,255,255,0.04)", cursor: "pointer", color: "var(--text)", fontSize: 18, fontFamily: "var(--font)" } }, "\u2212"),
                                React.createElement("input", { className: "inp", type: "number", step: "0.001", min: "0", style: { textAlign: "center", fontFamily: "var(--mono)", fontSize: 13, flex: 1 }, placeholder: "0", value: meal.refused, onChange: e => updateMeal(i, "refused", e.target.value) }),
                                React.createElement("button", { onClick: () => updateMeal(i, "refused", (ref + 0.1).toFixed(3)), style: { width: 32, height: 36, borderRadius: 7, border: "1px solid var(--border2)", background: "rgba(255,255,255,0.04)", cursor: "pointer", color: "var(--text)", fontSize: 18, fontFamily: "var(--font)" } }, "+")))),
                    sacs > 0 && (React.createElement("div", { style: { marginTop: 8, fontSize: 12, color: "var(--muted)", display: "flex", gap: 12 } },
                        React.createElement("span", null,
                            "Ofertado: ",
                            React.createElement("strong", { style: { fontFamily: "var(--mono)", color: "var(--text)" } },
                                sacs.toFixed(3),
                                " sc (",
                                (sacs * 25).toFixed(1),
                                " kg)")),
                        ref > 0 && React.createElement("span", null,
                            "Consumido: ",
                            React.createElement("strong", { style: { fontFamily: "var(--mono)", color: "var(--green)" } },
                                cons.toFixed(3),
                                " sc"))))));
            })),
            React.createElement("button", { onClick: addMeal, className: "btn btn-g", style: { width: "100%", marginBottom: 14, fontSize: 13 } }, "+ Adicionar Refei\u00E7\u00E3o"),
            totalGivenSacos > 0 && (React.createElement("div", { style: { background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.25)", borderRadius: 10, padding: "12px 14px" } },
                React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 } },
                    React.createElement("div", null,
                        React.createElement("div", { style: { fontSize: 11, color: "var(--muted)", textTransform: "uppercase", fontWeight: 600, marginBottom: 4 } }, "Total do Dia"),
                        React.createElement("div", { style: { fontFamily: "var(--mono)", fontSize: 18, fontWeight: 700, color: "var(--green)" } },
                            totalGivenSacos.toFixed(3),
                            " sacos (",
                            totalGivenKg.toFixed(1),
                            " kg)"),
                        totalRefusedSacos > 0 && (React.createElement("div", { style: { fontSize: 12, color: "var(--muted)", marginTop: 2 } },
                            "Consumido real: ",
                            React.createElement("strong", { style: { fontFamily: "var(--mono)", color: "var(--green)" } },
                                totalConsumedSacos.toFixed(3),
                                " sacos")))),
                    React.createElement("div", { style: { textAlign: "right" } },
                        React.createElement("div", { style: { fontSize: 11, color: "var(--muted)", marginBottom: 2 } }, "vs Recomendado"),
                        React.createElement("div", { style: { fontFamily: "var(--mono)", fontSize: 14, fontWeight: 700,
                                color: Math.abs(totalGivenSacos - dailySacks) < 0.1 ? "var(--green)" : totalGivenSacos < dailySacks ? "var(--yellow)" : "var(--accent)" } },
                            totalGivenSacos >= dailySacks ? "✅" : "⚠️",
                            " ",
                            ((totalGivenSacos / dailySacks) * 100).toFixed(0),
                            "% da meta"),
                        React.createElement("div", { style: { fontSize: 11, color: "var(--muted)" } },
                            meals.length,
                            " refei\u00E7\u00E3o",
                            meals.length !== 1 ? "ões" : "")))))),
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
// BIOMETRIA TAB
// ═══════════════════════════════════════════════════════════════════════════════
function BioTab({ tank, session, role }) {
    const { updateTank } = useApp();
    const [samples, setSamples] = (0, useState)("");
    const [avgW, setAvgW] = (0, useState)(tank.avgWeightG || "");
    const [avgL, setAvgL] = (0, useState)("");
    const [count, setCount] = (0, useState)(tank.fishCount || "");
    const [bioDate, setBioDate] = (0, useState)(today());
    const sp = SP[tank.species];
    function calcAvg() {
        const nums = samples.split(/[\n,;]+/).map(s => parseFloat(s.trim())).filter(n => !isNaN(n) && n > 0);
        if (!nums.length)
            return alert("Insira os pesos separados por vírgula ou linha.");
        setAvgW((nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(1));
    }
    function handleSave() {
        var _a;
        const w = parseFloat(avgW);
        const c = parseInt(count) || tank.fishCount;
        if (!w)
            return alert("Informe o peso médio.");
        const history = [...(tank.bioHistory || []), { date: bioDate, avgWeightG: w, avgLengthCm: parseFloat(avgL) || 0, fishCount: c }];
        updateTank({ ...tank, avgWeightG: w, fishCount: c, bioHistory: history,
            initFishCount: tank.initFishCount || c, initWeightG: tank.initWeightG || w });
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
                    React.createElement("lbl", null, "Pesos da Amostra (g) \u2014 v\u00EDrgula ou linha"),
                    React.createElement("textarea", { className: "inp", style: { minHeight: 70, resize: "vertical" }, placeholder: "Ex: 320, 350, 310, 380, 290, 340...", value: samples, onChange: e => setSamples(e.target.value) })),
                React.createElement("button", { className: "btn btn-g", style: { marginBottom: 14, width: "100%" }, onClick: calcAvg }, "\uD83D\uDCCA Calcular M\u00E9dia"),
                React.createElement("div", { className: "grid2", style: { marginBottom: 12 } },
                    React.createElement("div", null,
                        React.createElement("lbl", null, "Peso M\u00E9dio (g)"),
                        React.createElement("input", { className: "inp", type: "number", step: "0.1", value: avgW, onChange: e => setAvgW(e.target.value) })),
                    React.createElement("div", null,
                        React.createElement("lbl", null, "Comprimento M\u00E9dio (cm)"),
                        React.createElement("input", { className: "inp", type: "number", step: "0.1", placeholder: "opcional", value: avgL, onChange: e => setAvgL(e.target.value) }))),
                React.createElement("div", { style: { marginBottom: 14 } },
                    React.createElement("lbl", null, "Qtd. Peixes Atual"),
                    React.createElement("input", { className: "inp", type: "number", value: count, onChange: e => setCount(e.target.value) })),
                React.createElement("button", { className: "btn btn-p", style: { width: "100%", padding: 12 }, onClick: handleSave }, "\uD83D\uDCBE Salvar Biometria")),
            React.createElement("div", { className: "card", style: { padding: 18 } },
                React.createElement("div", { className: "section-hdr" }, "\uD83D\uDCCA Proje\u00E7\u00E3o com Novos Dados"),
                wG > 0 && (React.createElement(React.Fragment, null,
                    React.createElement("div", { style: { background: `${sp === null || sp === void 0 ? void 0 : sp.color}11`, border: `1px solid ${sp === null || sp === void 0 ? void 0 : sp.color}33`, borderRadius: 10, padding: "14px 16px", marginBottom: 14 } },
                        React.createElement("div", { style: { fontSize: 11, color: sp === null || sp === void 0 ? void 0 : sp.color, fontWeight: 600, textTransform: "uppercase", marginBottom: 6 } }, "Fase identificada"),
                        React.createElement("div", { style: { fontFamily: "var(--mono)", fontSize: 18, fontWeight: 700, color: sp === null || sp === void 0 ? void 0 : sp.color } }, phase === null || phase === void 0 ? void 0 : phase.name),
                        React.createElement("div", { style: { fontSize: 12, color: "var(--muted)", marginTop: 2 } }, phase === null || phase === void 0 ? void 0 :
                            phase.minW,
                            "g \u2013 ", phase === null || phase === void 0 ? void 0 :
                            phase.maxW,
                            "g")),
                    [
                        { l: "Biomassa estimada", v: `${bioKg.toFixed(1)} kg` },
                        { l: "Ração diária", v: sacosLabel(feedKg) },
                        { l: "% Arraçoamento", v: `${((phase === null || phase === void 0 ? void 0 : phase.pct) * 100).toFixed(1)}%` },
                        { l: "Refeições/dia", v: `${phase === null || phase === void 0 ? void 0 : phase.freq}x` },
                        { l: "FCR Meta (eng.)", v: FCR_META[tank.species] },
                        { l: "Proteína ração", v: `${phase === null || phase === void 0 ? void 0 : phase.protPct}%` },
                    ].map(i => (React.createElement("div", { key: i.l, style: { display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid var(--border)", fontSize: 13 } },
                        React.createElement("span", { style: { color: "var(--muted)" } }, i.l),
                        React.createElement("span", { style: { fontFamily: "var(--mono)", fontWeight: 600 } }, i.v)))))),
                React.createElement("div", { style: { marginTop: 16 } },
                    React.createElement("div", { className: "section-hdr" }, "Fases da Esp\u00E9cie"), sp === null || sp === void 0 ? void 0 :
                    sp.phases.map(p => {
                        const cur = p.name === (phase === null || phase === void 0 ? void 0 : phase.name);
                        return (React.createElement("div", { key: p.name, style: { display: "flex", gap: 8, alignItems: "center", padding: "6px 10px", borderRadius: 8, marginBottom: 4, background: cur ? `${sp.color}22` : "rgba(255,255,255,0.02)", border: cur ? `1px solid ${sp.color}44` : "1px solid transparent" } },
                            React.createElement("span", { style: { fontSize: 11, color: cur ? sp.color : "var(--muted)", fontWeight: cur ? 700 : 400 } },
                                cur ? "▶ " : "",
                                p.name),
                            React.createElement("span", { style: { fontSize: 11, color: "var(--muted)", marginLeft: "auto", fontFamily: "var(--mono)" } },
                                p.minW,
                                "\u2013",
                                p.maxW,
                                "g"),
                            React.createElement("span", { style: { fontSize: 11, color: "var(--muted)", fontFamily: "var(--mono)" } },
                                (p.pct * 100).toFixed(1),
                                "%")));
                    })))),
        bioHistory.length > 0 && (React.createElement("div", { className: "card", style: { padding: 18 } },
            React.createElement("div", { className: "section-hdr" }, "\uD83D\uDCC5 Hist\u00F3rico de Biometrias"),
            React.createElement("table", null,
                React.createElement("thead", null,
                    React.createElement("tr", null,
                        React.createElement("th", null, "Data"),
                        React.createElement("th", null, "Peso M\u00E9dio"),
                        React.createElement("th", null, "Comprimento"),
                        React.createElement("th", null, "Qtd. Peixes"),
                        React.createElement("th", null, "Biomassa"),
                        React.createElement("th", null, "Fase"))),
                React.createElement("tbody", null, [...bioHistory].reverse().map((b, i) => {
                    var _a;
                    return (React.createElement("tr", { key: i },
                        React.createElement("td", { style: { fontFamily: "var(--mono)" } }, b.date),
                        React.createElement("td", { style: { fontFamily: "var(--mono)", fontWeight: 600 } },
                            b.avgWeightG,
                            "g"),
                        React.createElement("td", { style: { fontFamily: "var(--mono)" } }, b.avgLengthCm ? `${b.avgLengthCm}cm` : "—"),
                        React.createElement("td", { style: { fontFamily: "var(--mono)" } }, (b.fishCount || 0).toLocaleString("pt-BR")),
                        React.createElement("td", { style: { fontFamily: "var(--mono)" } },
                            ((b.fishCount || 0) * b.avgWeightG / 1000).toFixed(1),
                            " kg"),
                        React.createElement("td", null,
                            React.createElement("span", { className: "badge", style: { background: `${sp === null || sp === void 0 ? void 0 : sp.color}22`, color: sp === null || sp === void 0 ? void 0 : sp.color } }, (_a = getPhase(tank.species, b.avgWeightG)) === null || _a === void 0 ? void 0 : _a.name))));
                })))))));
}
// ═══════════════════════════════════════════════════════════════════════════════
// FINANCE TAB
// ═══════════════════════════════════════════════════════════════════════════════
const EXPENSE_CATS = ["Ração", "Energia", "Salários", "Alevinos", "Medicamentos", "Manutenção", "Transporte", "Equipamentos", "Outros"];
function FinanceTab({ tank }) {
    const { expenses, addExpense, logs } = useApp();
    const [form, setForm] = (0, useState)({ date: today(), cat: "Ração", desc: "", amount: "" });
    const [tab, setTab] = (0, useState)("despesas");
    const tankExp = expenses[tank.id] || [];
    const totalExp = tankExp.reduce((s, e) => s + (e.amount || 0), 0);
    const sp = SP[tank.species];
    const phase = getPhase(tank.species, tank.avgWeightG || 0);
    const biomassKg = ((tank.fishCount || 0) * (tank.avgWeightG || 0)) / 1000;
    // revenue projection
    const pricePerKg = tank.pricePerKg || 21;
    const projRevenue = (tank.fishCount || 0) * (tank.avgWeightG || 0) / 1000 * pricePerKg;
    const projProfit = projRevenue - totalExp;
    const margin = projRevenue > 0 ? (projProfit / projRevenue * 100).toFixed(1) : "—";
    // feed cost
    const allLogs = Object.values(logs[tank.id] || {});
    const totalFedKg = allLogs.reduce((s, d) => s + (d.feedGivenKg || 0), 0);
    // by category
    const byCat = {};
    EXPENSE_CATS.forEach(c => byCat[c] = 0);
    tankExp.forEach(e => byCat[e.cat] = (byCat[e.cat] || 0) + e.amount);
    const pieData = Object.entries(byCat).filter(([, v]) => v > 0).map(([name, value]) => ({ name, value }));
    const COLORS = ["#22c55e", "#0ea5e9", "#f59e0b", "#a78bfa", "#f43f5e", "#06b6d4", "#84cc16", "#fb923c", "#94a3b8"];
    function handleAdd() {
        if (!form.amount || !form.cat)
            return alert("Preencha categoria e valor.");
        addExpense(tank.id, { ...form, amount: parseFloat(form.amount), id: genId() });
        setForm(p => ({ ...p, desc: "", amount: "" }));
    }
    return (React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 14 } },
        React.createElement("div", { className: "grid4" }, [
            { ico: "💸", val: fmtBRL(totalExp), lbl: "Custo Total Real" },
            { ico: "📈", val: fmtBRL(projRevenue), lbl: "Receita Projetada", note: `@ R$${pricePerKg}/kg` },
            { ico: "💰", val: fmtBRL(projProfit), lbl: "Lucro Projetado", warn: projProfit < 0 },
            { ico: "📊", val: `${margin}%`, lbl: "Margem Projetada" },
        ].map(k => (React.createElement("div", { key: k.lbl, className: "card kpi", style: { borderColor: k.warn ? "rgba(239,68,68,0.4)" : "var(--border)" } },
            k.ico === "__LOGO__" ? React.createElement("img", { src: "/icon.png", style: { width: 22, height: 22, objectFit: "cover", borderRadius: 4, display: "inline-block" } }) : React.createElement("div", { className: "ico" }, k.ico),
            React.createElement("div", { className: "val", style: { fontSize: 16, color: k.warn ? "var(--red)" : "var(--text)" } }, k.val),
            React.createElement("div", { className: "lbl" }, k.lbl),
            k.note && React.createElement("div", { style: { fontSize: 10, color: "var(--muted)", marginTop: 2 } }, k.note))))),
        React.createElement("div", { className: "card", style: { padding: 16, display: "flex", alignItems: "center", gap: 12 } },
            React.createElement("span", { style: { fontSize: 13, color: "var(--muted)" } }, "Pre\u00E7o de venda p/ c\u00E1lculo:"),
            React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 6 } },
                React.createElement("span", { style: { fontSize: 13, color: "var(--muted)" } }, "R$"),
                React.createElement("input", { className: "inp", type: "number", step: "0.5", style: { width: 90 }, value: tank.pricePerKg || 21, onChange: e => { const { updateTank } = useApp(); updateTank({ ...tank, pricePerKg: parseFloat(e.target.value) || 21 }); } }),
                React.createElement("span", { style: { fontSize: 13, color: "var(--muted)" } }, "/kg")),
            React.createElement("span", { style: { fontSize: 12, color: "var(--muted)" } },
                "\u00B7 Ra\u00E7\u00E3o consumida: ",
                React.createElement("strong", { style: { fontFamily: "var(--mono)", color: "var(--text)" } },
                    sacos(totalFedKg),
                    " sacos (",
                    totalFedKg.toFixed(1),
                    " kg)"))),
        React.createElement("div", { style: { display: "flex", gap: 6, marginBottom: 4, flexWrap: "wrap" } }, ["despesas", "grafico", "cronograma"].map(t => (React.createElement("button", { key: t, className: `tab-btn ${tab === t ? "active" : ""}`, onClick: () => setTab(t) }, t === "despesas" ? "📋 Despesas" : t === "grafico" ? "📊 Por Categoria" : "📅 Cronograma")))),
        tab === "despesas" && (React.createElement(React.Fragment, null,
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
                        React.createElement("input", { className: "inp", placeholder: "ex: 50 sacos ra\u00E7\u00E3o P", value: form.desc, onChange: e => setForm(p => ({ ...p, desc: e.target.value })) })),
                    React.createElement("div", null,
                        React.createElement("lbl", null, "Valor (R$)"),
                        React.createElement("input", { className: "inp", type: "number", step: "0.01", placeholder: "0,00", value: form.amount, onChange: e => setForm(p => ({ ...p, amount: e.target.value })) }))),
                React.createElement("button", { className: "btn btn-p", onClick: handleAdd }, "+ Adicionar Despesa")),
            React.createElement("div", { className: "card", style: { padding: 18 } },
                React.createElement("div", { className: "section-hdr" }, "Hist\u00F3rico de Despesas"),
                React.createElement("table", null,
                    React.createElement("thead", null,
                        React.createElement("tr", null,
                            React.createElement("th", null, "Data"),
                            React.createElement("th", null, "Categoria"),
                            React.createElement("th", null, "Descri\u00E7\u00E3o"),
                            React.createElement("th", null, "Valor"))),
                    React.createElement("tbody", null,
                        [...tankExp].reverse().map(e => (React.createElement("tr", { key: e.id },
                            React.createElement("td", { style: { fontFamily: "var(--mono)" } }, e.date),
                            React.createElement("td", null,
                                React.createElement("span", { className: "badge", style: { background: "rgba(14,165,233,0.1)", color: "var(--accent)" } }, e.cat)),
                            React.createElement("td", { style: { color: "var(--muted)" } }, e.desc || "—"),
                            React.createElement("td", { style: { fontFamily: "var(--mono)", fontWeight: 600 } }, fmtBRL(e.amount))))),
                        tankExp.length === 0 && React.createElement("tr", null,
                            React.createElement("td", { colSpan: 4, style: { textAlign: "center", color: "var(--muted)", padding: 20 } }, "Nenhuma despesa registrada")))),
                React.createElement("div", { style: { marginTop: 12, textAlign: "right", fontFamily: "var(--mono)", fontWeight: 700, fontSize: 15 } },
                    "Total: ",
                    fmtBRL(totalExp))))),
        tab === "grafico" && pieData.length > 0 && (React.createElement("div", { className: "card", style: { padding: 18 } },
            React.createElement("div", { className: "section-hdr" }, "Despesas por Categoria"),
            React.createElement("div", { style: { display: "flex", gap: 20, flexWrap: "wrap", alignItems: "center" } },
                React.createElement(PieChart, { width: 260, height: 260 },
                    React.createElement(Pie, { data: pieData, cx: 120, cy: 120, innerRadius: 70, outerRadius: 110, dataKey: "value" }, pieData.map((e, i) => React.createElement(Cell, { key: i, fill: COLORS[i % COLORS.length] }))),
                    React.createElement(Tooltip, { formatter: v => fmtBRL(v), contentStyle: { background: "#0b1626", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)" } })),
                React.createElement("div", { style: { flex: 1 } }, pieData.map((e, i) => (React.createElement("div", { key: e.name, style: { display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--border)", fontSize: 13 } },
                    React.createElement("span", { style: { display: "flex", alignItems: "center", gap: 8 } },
                        React.createElement("span", { style: { width: 10, height: 10, borderRadius: "50%", background: COLORS[i % COLORS.length], display: "inline-block" } }),
                        e.name),
                    React.createElement("span", { style: { fontFamily: "var(--mono)", fontWeight: 600 } },
                        fmtBRL(e.value),
                        " ",
                        React.createElement("span", { style: { color: "var(--muted)", fontSize: 11 } },
                            "(",
                            (e.value / totalExp * 100).toFixed(1),
                            "%)"))))))))),
        tab === "cronograma" && React.createElement(DisbursementSchedule, { tank: tank, expenses: tankExp })));
}
// ─── DISBURSEMENT SCHEDULE ────────────────────────────────────────────────────
function DisbursementSchedule({ tank, expenses }) {
    const months = Array.from({ length: 13 }, (_, i) => i);
    const startDate = new Date(tank.createdAt || today());
    function getMonthLabel(i) { return i === 0 ? "Mês 0 (Implant.)" : `Mês ${i}`; }
    function getMonthExpenses(i) {
        return expenses.filter(e => {
            const d = new Date(e.date);
            const diff = (d.getFullYear() - startDate.getFullYear()) * 12 + (d.getMonth() - startDate.getMonth());
            return diff === i;
        });
    }
    const monthTotals = months.map(i => getMonthExpenses(i).reduce((s, e) => s + (e.amount || 0), 0));
    const accumulated = months.map((_, i) => monthTotals.slice(0, i + 1).reduce((a, b) => a + b, 0));
    const chartData = months.map(i => ({ mes: getMonthLabel(i), "Desembolso": monthTotals[i], "Acumulado": accumulated[i] }));
    const peakMonth = monthTotals.indexOf(Math.max(...monthTotals));
    const totalDisbursed = accumulated[accumulated.length - 1];
    return (React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 14 } },
        React.createElement("div", { className: "grid2" },
            React.createElement("div", { className: "card kpi" },
                React.createElement("div", { className: "ico" }, "\uD83D\uDCB8"),
                React.createElement("div", { className: "val" }, fmtBRL(totalDisbursed)),
                React.createElement("div", { className: "lbl" }, "Total Desembolsado")),
            React.createElement("div", { className: "card kpi" },
                React.createElement("div", { className: "ico" }, "\uD83D\uDCC5"),
                React.createElement("div", { className: "val" }, getMonthLabel(peakMonth)),
                React.createElement("div", { className: "lbl" }, "M\u00EAs de Maior Sa\u00EDda"))),
        React.createElement("div", { className: "card", style: { padding: 18 } },
            React.createElement("div", { className: "section-hdr" }, "Desembolso Mensal vs Acumulado"),
            React.createElement(ResponsiveContainer, { width: "100%", height: 220 },
                React.createElement(BarChart, { data: chartData },
                    React.createElement(CartesianGrid, { stroke: "rgba(255,255,255,0.04)" }),
                    React.createElement(XAxis, { dataKey: "mes", tick: { fill: "var(--muted)", fontSize: 10 } }),
                    React.createElement(YAxis, { tick: { fill: "var(--muted)", fontSize: 10 }, tickFormatter: v => `R$${(v / 1000).toFixed(0)}k` }),
                    React.createElement(Tooltip, { formatter: v => fmtBRL(v), contentStyle: { background: "#0b1626", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)" } }),
                    React.createElement(Legend, { wrapperStyle: { color: "var(--muted)", fontSize: 12 } }),
                    React.createElement(Bar, { dataKey: "Desembolso", fill: "#0ea5e9", radius: [4, 4, 0, 0] }),
                    React.createElement(Line, { dataKey: "Acumulado", stroke: "#f59e0b", strokeWidth: 2, type: "monotone", dot: false })))),
        React.createElement("div", { className: "card", style: { padding: 18 } },
            React.createElement("div", { className: "section-hdr" }, "Detalhe por M\u00EAs"),
            React.createElement("table", null,
                React.createElement("thead", null,
                    React.createElement("tr", null,
                        React.createElement("th", null, "Per\u00EDodo"),
                        React.createElement("th", null, "Desembolso"),
                        React.createElement("th", null, "Acumulado"),
                        React.createElement("th", null, "Principais itens"))),
                React.createElement("tbody", null, months.map(i => {
                    const exps = getMonthExpenses(i);
                    const topItem = exps.sort((a, b) => b.amount - a.amount)[0];
                    return (React.createElement("tr", { key: i, style: { background: i === peakMonth ? "rgba(239,68,68,0.05)" : "transparent" } },
                        React.createElement("td", null, getMonthLabel(i)),
                        React.createElement("td", { style: { fontFamily: "var(--mono)", fontWeight: 600, color: monthTotals[i] > 0 ? "var(--text)" : "var(--muted)" } }, fmtBRL(monthTotals[i])),
                        React.createElement("td", { style: { fontFamily: "var(--mono)" } }, fmtBRL(accumulated[i])),
                        React.createElement("td", { style: { color: "var(--muted)", fontSize: 12 } }, topItem ? `${topItem.cat}: ${fmtBRL(topItem.amount)}` : "—")));
                }))))));
}
// ═══════════════════════════════════════════════════════════════════════════════
// CHART TAB
// ═══════════════════════════════════════════════════════════════════════════════
function ChartTab({ tank }) {
    const { logs } = useApp();
    const tl = logs[tank.id] || {};
    const sp = SP[tank.species];
    const chartData = Object.entries(tl).sort(([a], [b]) => a > b ? 1 : -1).slice(-30).map(([date, d]) => {
        var _a, _b, _c, _d;
        return ({
            date: date.slice(5),
            "O₂ Manhã": parseFloat((d.readings && ((_a = d.readings[0]) === null || _a === void 0 ? void 0 : _a.o2)) || d.o2 || 0),
            "O₂ Tarde": parseFloat((d.readings && ((_b = d.readings[1]) === null || _b === void 0 ? void 0 : _b.o2)) || 0),
            "O₂ Noite": parseFloat((d.readings && ((_c = d.readings[2]) === null || _c === void 0 ? void 0 : _c.o2)) || 0),
            "pH (eng.)": ((_d = d.engVisit) === null || _d === void 0 ? void 0 : _d.ph) ? parseFloat(d.engVisit.ph) : null,
            "Temp (°C)": parseFloat(d.temp || 0),
            "pH": parseFloat(d.ph || 0),
            "Ração (sacos)": d.feedGivenKg ? d.feedGivenKg / 25 : parseFloat(d.feedGiven || 0),
            "Mortalidade": parseFloat(d.mortality || 0),
        });
    });
    const bioData = (tank.bioHistory || []).map(b => ({
        date: b.date.slice(5),
        "Peso Médio (g)": b.avgWeightG,
        "Biomassa (kg)": (b.fishCount || 0) * b.avgWeightG / 1000,
    }));
    if (chartData.length < 2 && bioData.length < 2)
        return (React.createElement("div", { className: "card", style: { padding: 40, textAlign: "center", color: "var(--muted)" } },
            React.createElement("div", { style: { fontSize: 40, marginBottom: 12 } }, "\uD83D\uDCC8"),
            React.createElement("p", null, "Registre pelo menos 2 dias para ver os gr\u00E1ficos.")));
    return (React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 14 } },
        chartData.length >= 2 && (React.createElement(React.Fragment, null,
            React.createElement("div", { className: "card", style: { padding: 18 } },
                React.createElement("div", { className: "section-hdr" }, "\uD83D\uDCA7 Oxigena\u00E7\u00E3o e Temperatura (\u00FAltimos 30 dias)"),
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
                        React.createElement(Line, { type: "monotone", dataKey: "Temp (\u00B0C)", stroke: "#f59e0b", strokeWidth: 2, dot: { r: 2 } }),
                        React.createElement(Line, { type: "monotone", dataKey: "pH", stroke: "#a78bfa", strokeWidth: 1, dot: { r: 2 }, strokeDasharray: "4 2" })))),
            React.createElement("div", { className: "card", style: { padding: 18 } },
                React.createElement("div", { className: "section-hdr" }, "\uD83C\uDF7D\uFE0F Ra\u00E7\u00E3o Fornecida por Dia (sacos 25kg)"),
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
// CYCLE TAB — relatório de fechamento de ciclo
// ═══════════════════════════════════════════════════════════════════════════════
function CycleTab({ tank, biomassKg }) {
    const { cycles, setCycles, expenses, logs } = useApp();
    const [form, setForm] = (0, useState)({ harvestDate: today(), soldFish: "", avgFinalWeight: "", pricePerKg: "21", obs: "" });
    const sp = SP[tank.species];
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
        const fcr = totalFedKg > 0 && (sold * weight - (tank.fishCount || 0) * (tank.avgWeightG || 0) / 1000) > 0
            ? (totalFedKg / ((sold * weight) - (tank.fishCount || 0) * (tank.avgWeightG || 0) / 1000)).toFixed(2) : "—";
        const record = {
            id: genId(), tankId: tank.id, tankName: tank.name,
            closedAt: form.harvestDate,
            species: tank.species,
            initialFish: tank.initFishCount || tank.fishCount,
            finalFish: sold,
            mortality: totalMort,
            avgFinalWeightG: weight * 1000,
            pricePerKg: price,
            revenue, totalExpenses: totalExp, profit,
            margin: revenue > 0 ? (profit / revenue * 100).toFixed(1) : "—",
            totalFeedKg: totalFedKg, fcr, obs: form.obs,
        };
        setCycles(prev => ({ ...prev, [tank.id]: [...(prev[tank.id] || []), record] }));
        alert(`✅ Ciclo fechado! Lucro: ${fmtBRL(profit)}`);
    }
    return (React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 14 } },
        React.createElement("div", { className: "card", style: { padding: 18 } },
            React.createElement("div", { className: "section-hdr" }, "\uD83D\uDCCA Resumo do Ciclo Atual"),
            React.createElement("div", { className: "grid4" }, [
                { ico: "__LOGO__", val: (tank.fishCount || 0).toLocaleString("pt-BR"), lbl: "Peixes em estoque" },
                { ico: "⚖️", val: `${biomassKg.toFixed(1)} kg`, lbl: "Biomassa atual" },
                { ico: "🍽️", val: sacosLabel(totalFedKg), lbl: "Total de ração" },
                { ico: "💀", val: totalMort.toLocaleString("pt-BR"), lbl: "Mortalidade acum." },
                { ico: "💸", val: fmtBRL(totalExp), lbl: "Custo total" },
                { ico: "📅", val: Object.keys(tl).length + " dias", lbl: "Dias monitorados" },
                { ico: "📋", val: Object.keys(tl).filter(k => { var _a; return (_a = tl[k]) === null || _a === void 0 ? void 0 : _a.o2; }).length + " dias", lbl: "Registros O₂" },
                { ico: "🗓️", val: tank.createdAt || "—", lbl: "Início do ciclo" },
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
            form.soldFish && form.avgFinalWeight && form.pricePerKg && (React.createElement("div", { style: { background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)", borderRadius: 10, padding: "14px 16px", marginBottom: 14 } },
                React.createElement("div", { className: "section-hdr", style: { color: "var(--green)" } }, "Resultado Projetado"),
                React.createElement("div", { className: "grid2" }, [
                    { l: "Receita bruta", v: fmtBRL(parseInt(form.soldFish) * parseFloat(form.avgFinalWeight) * parseFloat(form.pricePerKg)) },
                    { l: "Custo total", v: fmtBRL(totalExp) },
                    { l: "Lucro bruto", v: fmtBRL(parseInt(form.soldFish) * parseFloat(form.avgFinalWeight) * parseFloat(form.pricePerKg) - totalExp) },
                    { l: "Ração total", v: sacosLabel(totalFedKg) },
                ].map(i => (React.createElement("div", { key: i.l, style: { fontSize: 13 } },
                    React.createElement("span", { style: { color: "var(--muted)" } },
                        i.l,
                        ": "),
                    React.createElement("strong", { style: { fontFamily: "var(--mono)" } }, i.v))))))),
            React.createElement("div", { style: { marginBottom: 14 } },
                React.createElement("lbl", null, "Observa\u00E7\u00F5es"),
                React.createElement("textarea", { className: "inp", style: { minHeight: 60, resize: "vertical" }, value: form.obs, onChange: e => setForm(p => ({ ...p, obs: e.target.value })) })),
            React.createElement("button", { className: "btn btn-p", style: { width: "100%", padding: 12 }, onClick: handleClose }, "\uD83C\uDFC1 Fechar Ciclo")),
        tankCycles.length > 0 && (React.createElement("div", { className: "card", style: { padding: 18 } },
            React.createElement("div", { className: "section-hdr" }, "\uD83D\uDCCB Hist\u00F3rico de Ciclos"),
            React.createElement("table", null,
                React.createElement("thead", null,
                    React.createElement("tr", null,
                        React.createElement("th", null, "Data"),
                        React.createElement("th", null, "Peixes"),
                        React.createElement("th", null, "Peso Final"),
                        React.createElement("th", null, "Receita"),
                        React.createElement("th", null, "Custo"),
                        React.createElement("th", null, "Lucro"),
                        React.createElement("th", null, "Margem"),
                        React.createElement("th", null, "FCR"))),
                React.createElement("tbody", null, [...tankCycles].reverse().map(c => (React.createElement("tr", { key: c.id },
                    React.createElement("td", { style: { fontFamily: "var(--mono)" } }, c.closedAt),
                    React.createElement("td", { style: { fontFamily: "var(--mono)" } }, (c.finalFish || 0).toLocaleString("pt-BR")),
                    React.createElement("td", { style: { fontFamily: "var(--mono)" } },
                        (c.avgFinalWeightG / 1000).toFixed(2),
                        " kg"),
                    React.createElement("td", { style: { fontFamily: "var(--mono)", color: "var(--green)" } }, fmtBRL(c.revenue)),
                    React.createElement("td", { style: { fontFamily: "var(--mono)", color: "var(--red)" } }, fmtBRL(c.totalExpenses)),
                    React.createElement("td", { style: { fontFamily: "var(--mono)", fontWeight: 700, color: c.profit >= 0 ? "var(--green)" : "var(--red)" } }, fmtBRL(c.profit)),
                    React.createElement("td", { style: { fontFamily: "var(--mono)" } },
                        c.margin,
                        "%"),
                    React.createElement("td", { style: { fontFamily: "var(--mono)" } }, c.fcr))))))))));
}
// ═══════════════════════════════════════════════════════════════════════════════
// PARAMS TAB
// ═══════════════════════════════════════════════════════════════════════════════
function ParamsTab({ sp, phase, tank }) {
    var _a;
    const sColors = { ok: "var(--green)", warn: "var(--yellow)", danger: "var(--red)" };
    const params = [
        { l: "O₂ Mínimo p/ Alimentar", v: `${sp === null || sp === void 0 ? void 0 : sp.minO2} mg/L`, s: "danger", d: "Abaixo: NÃO ALIMENTAR. Ligue aeradores." },
        { l: "O₂ Ideal", v: `${sp === null || sp === void 0 ? void 0 : sp.idealO2} mg/L`, s: "ok", d: "Conforto da espécie." },
        { l: "Temp. Mínima", v: `${sp === null || sp === void 0 ? void 0 : sp.minTemp}°C`, s: "warn", d: "Metabolismo reduzido. Reduza ração." },
        { l: "Temp. Ideal", v: `${sp === null || sp === void 0 ? void 0 : sp.idealTemp}°C`, s: "ok", d: "Máxima eficiência alimentar." },
        { l: "Temp. Máxima", v: `${sp === null || sp === void 0 ? void 0 : sp.maxTemp}°C`, s: "warn", d: "Estresse. Monitorar comportamento." },
        { l: "pH Mínimo", v: `${sp === null || sp === void 0 ? void 0 : sp.phMin}`, s: "warn", d: "pH ácido reduz apetite e imunidade." },
        { l: "pH Máximo", v: `${sp === null || sp === void 0 ? void 0 : sp.phMax}`, s: "warn", d: "pH alcalino irrita brânquias." },
        { l: "Densidade Máxima (sup.)", v: `${sp === null || sp === void 0 ? void 0 : sp.densityPerM2} peixe/m²`, s: "ok", d: "Limite pela superfície (troca gasosa / aeração)." },
        { l: "Biomassa Máx. (volume)", v: `${sp === null || sp === void 0 ? void 0 : sp.kgPerM3} kg/m³`, s: "ok", d: "Limite pelo volume — diluição de amônia e resíduos." },
        { l: "Profundidade Ideal", v: `${sp === null || sp === void 0 ? void 0 : sp.idealDepthM} m`, s: "ok", d: "Faixa ideal: 1,2–1,8m para semi-intensivo com aeração." },
        { l: "Profundidade Mínima", v: `${sp === null || sp === void 0 ? void 0 : sp.minDepthM} m`, s: "warn", d: "Abaixo disso: volume insuficiente, amônia concentra." },
        { l: "Profundidade Máxima", v: `${sp === null || sp === void 0 ? void 0 : sp.maxDepthM} m`, s: "warn", d: "Acima: aeradores de superfície perdem alcance." },
    ];
    return (React.createElement("div", { className: "grid2" },
        React.createElement("div", { className: "card", style: { padding: 18 } },
            React.createElement("div", { className: "section-hdr" },
                "Par\u00E2metros \u2014 ", sp === null || sp === void 0 ? void 0 :
                sp.name),
            params.map(p => (React.createElement("div", { key: p.l, style: { background: "rgba(255,255,255,0.025)", borderRadius: 9, padding: "10px 13px", borderLeft: `3px solid ${sColors[p.s]}`, marginBottom: 8 } },
                React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center" } },
                    React.createElement("span", { style: { fontSize: 12, color: "var(--muted)" } }, p.l),
                    React.createElement("span", { style: { fontSize: 14, fontWeight: 700, fontFamily: "var(--mono)", color: sColors[p.s] } }, p.v)),
                React.createElement("div", { style: { fontSize: 11, color: "var(--muted)", marginTop: 3 } }, p.d))))),
        React.createElement("div", { className: "card", style: { padding: 18 } },
            React.createElement("div", { className: "section-hdr" },
                "Fase Atual \u2014 ", phase === null || phase === void 0 ? void 0 :
                phase.name),
            [
                { l: "Faixa de Peso", v: `${phase === null || phase === void 0 ? void 0 : phase.minW}g – ${phase === null || phase === void 0 ? void 0 : phase.maxW}g` },
                { l: "% Arraçoamento", v: `${((phase === null || phase === void 0 ? void 0 : phase.pct) * 100).toFixed(1)}%` },
                { l: "Frequência", v: `${phase === null || phase === void 0 ? void 0 : phase.freq}x ao dia` },
                { l: "FCR Meta (eng.)", v: FCR_META[tank.species] },
                { l: "Proteína Ração", v: `${phase === null || phase === void 0 ? void 0 : phase.protPct}%` },
            ].map(i => (React.createElement("div", { key: i.l, style: { display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--border)", fontSize: 13 } },
                React.createElement("span", { style: { color: "var(--muted)" } }, i.l),
                React.createElement("span", { style: { fontFamily: "var(--mono)", fontWeight: 600 } }, i.v)))),
            React.createElement("div", { style: { marginTop: 14, background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)", borderRadius: 9, padding: 13 } },
                React.createElement("div", { style: { fontSize: 11, fontWeight: 700, color: "var(--yellow)", marginBottom: 6 } }, "\u26A0\uFE0F Regras de Decis\u00E3o"),
                React.createElement("div", { style: { fontSize: 12, color: "#fcd34d", lineHeight: 1.7 } },
                    "\u2705 O\u2082 \u2265 ", sp === null || sp === void 0 ? void 0 :
                    sp.minO2,
                    " mg/L \u2192 Alimentar normalmente",
                    React.createElement("br", null),
                    "\u26A0\uFE0F O\u2082 ",
                    ((sp === null || sp === void 0 ? void 0 : sp.minO2) || 5) - 1,
                    "\u2013", sp === null || sp === void 0 ? void 0 :
                    sp.minO2,
                    " mg/L \u2192 Alimentar metade",
                    React.createElement("br", null),
                    "\uD83D\uDEAB O\u2082 < ",
                    ((sp === null || sp === void 0 ? void 0 : sp.minO2) || 5) - 1,
                    " mg/L \u2192 N\u00C3O alimentar",
                    React.createElement("br", null),
                    "\uD83C\uDF21\uFE0F Temp. fora do ideal \u2192 Reduzir ra\u00E7\u00E3o 20\u201330%")),
            React.createElement("div", { style: { marginTop: 12, background: "rgba(255,255,255,0.025)", borderRadius: 9, padding: 13 } },
                React.createElement("div", { style: { fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".5px", marginBottom: 8 } }, "Tanque"),
                [
                    { l: "Área", v: `${tank.areaM2} m²` },
                    { l: "Profundidade", v: `${tank.depth || "—"} m` },
                    { l: "Volume", v: `${(_a = tank.volumeM3) === null || _a === void 0 ? void 0 : _a.toFixed(1)} m³` },
                    { l: "Peixes em estoque", v: (tank.fishCount || 0).toLocaleString("pt-BR") },
                    { l: "Densidade atual", v: `${((tank.fishCount || 0) / tank.areaM2).toFixed(2)} peixe/m²` },
                    { l: "Cap. recomendada", v: `${calcCapacity(tank.species, tank.areaM2, tank.depth || 1.5).ideal.toLocaleString("pt-BR")} peixes` },
                    { l: "Fator limitante", v: calcCapacity(tank.species, tank.areaM2, tank.depth || 1.5).limitingFactor },
                ].map(i => (React.createElement("div", { key: i.l, style: { display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid var(--border)", fontSize: 13 } },
                    React.createElement("span", { style: { color: "var(--muted)" } }, i.l),
                    React.createElement("span", { style: { fontFamily: "var(--mono)", fontWeight: 600 } }, i.v))))))));
}
// ═══════════════════════════════════════════════════════════════════════════════
// TANK MODAL — NEW + EDIT (unit-aware)
// ═══════════════════════════════════════════════════════════════════════════════
function UnitToggle({ category, value, onChange }) {
    // Inline mini unit switcher
    const opts = UNITS_DEF[category] || {};
    return (React.createElement("div", { style: { display: "flex", gap: 4 } }, Object.entries(opts).map(([k, u]) => (React.createElement("button", { key: k, onClick: () => onChange(k), style: { padding: "3px 10px", borderRadius: 6, cursor: "pointer", fontFamily: "var(--font)",
            fontWeight: 600, fontSize: 11, border: "1px solid", transition: "all .15s",
            background: value === k ? "var(--accent)" : "rgba(255,255,255,0.05)",
            borderColor: value === k ? "var(--accent)" : "var(--border2)",
            color: value === k ? "#fff" : "var(--muted)" } }, u.label)))));
}
function TankModal({ mode, tank, onClose }) {
    var _a, _b, _c;
    const { addTank, updateTank, units, setUnits } = useApp();
    const def = tank || {};
    // local display values — stored internally in base units (m², m, g)
    // but displayed in the user's chosen unit
    const aUnit = units.area;
    const dUnit = units.depth;
    const wUnit = units.weight;
    const [form, setForm] = (0, useState)({
        name: def.name || "",
        species: def.species || "matrinxa",
        // display values — converted from stored base
        areaDisp: def.areaM2 ? fromBase(def.areaM2, "area", aUnit).toFixed(4).replace(/\.?0+$/, "") : "",
        depthDisp: def.depth ? fromBase(def.depth, "depth", dUnit).toFixed(2).replace(/\.?0+$/, "") : "1.5",
        weightDisp: def.avgWeightG ? fromBase(def.avgWeightG, "weight", wUnit).toFixed(1) : "50",
        fishCount: def.fishCount || "",
        pricePerKg: def.pricePerKg || 21,
    });
    const sp = SP[form.species];
    // Convert display → base for calcs
    const areaBase = toBase(parseFloat(form.areaDisp) || 0, "area", aUnit);
    const depthBase = toBase(parseFloat(form.depthDisp) || 0, "depth", dUnit);
    const weightBase = toBase(parseFloat(form.weightDisp) || 0, "weight", wUnit);
    const idealFish = areaBase > 0 ? Math.floor(areaBase * ((sp === null || sp === void 0 ? void 0 : sp.densityPerM2) || 2.5)) : null;
    const volM3 = areaBase > 0 ? areaBase * depthBase : null;
    // When user changes unit — re-display the same physical value in new unit
    function changeAreaUnit(u) {
        setUnits(prev => ({ ...prev, area: u }));
        if (form.areaDisp)
            setForm(p => ({ ...p, areaDisp: fromBase(areaBase, "area", u).toFixed(4).replace(/\.?0+$/, "") }));
    }
    function changeDepthUnit(u) {
        setUnits(prev => ({ ...prev, depth: u }));
        if (form.depthDisp)
            setForm(p => ({ ...p, depthDisp: fromBase(depthBase, "depth", u).toFixed(2).replace(/\.?0+$/, "") }));
    }
    function changeWeightUnit(u) {
        setUnits(prev => ({ ...prev, weight: u }));
        if (form.weightDisp)
            setForm(p => ({ ...p, weightDisp: fromBase(weightBase, "weight", u).toFixed(2).replace(/\.?0+$/, "") }));
    }
    function handleSubmit() {
        if (!form.name || !form.areaDisp)
            return alert("Preencha nome e área.");
        const data = {
            ...(tank || {}),
            id: (tank === null || tank === void 0 ? void 0 : tank.id) || genId(),
            name: form.name,
            species: form.species,
            areaM2: areaBase,
            depth: depthBase,
            volumeM3: volM3 || 0,
            fishCount: parseInt(form.fishCount) || idealFish || 0,
            avgWeightG: weightBase || 50,
            pricePerKg: parseFloat(form.pricePerKg) || 21,
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
                    React.createElement("select", { className: "inp", value: form.species, onChange: e => setForm(p => ({ ...p, species: e.target.value })) }, Object.entries(SP).map(([k, v]) => React.createElement("option", { key: k, value: k },
                        v.icon,
                        " ",
                        v.name)))),
                React.createElement("div", null,
                    React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 } },
                        React.createElement("lbl", { style: { margin: 0 } },
                            "\u00C1rea (",
                            aLabel,
                            ")"),
                        React.createElement(UnitToggle, { category: "area", value: aUnit, onChange: changeAreaUnit })),
                    React.createElement("input", { className: "inp", type: "number", step: "any", placeholder: `ex: ${aUnit === "ha" ? "0.05" : "500"}`, value: form.areaDisp, onChange: e => setForm(p => ({ ...p, areaDisp: e.target.value })) })),
                React.createElement("div", null,
                    React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 } },
                        React.createElement("lbl", { style: { margin: 0 } },
                            "Profundidade (",
                            dLabel,
                            ")"),
                        React.createElement(UnitToggle, { category: "depth", value: dUnit, onChange: changeDepthUnit })),
                    React.createElement("input", { className: "inp", type: "number", step: "any", placeholder: dUnit === "cm" ? "150" : "1.5", value: form.depthDisp, onChange: e => setForm(p => ({ ...p, depthDisp: e.target.value })) })),
                areaBase > 0 && (() => {
                    const cap = calcCapacity(form.species, areaBase, depthBase);
                    const dStat = depthStatus(depthBase);
                    return (React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 10 } },
                        React.createElement("div", { style: { background: `${dStat.color}15`, border: `1px solid ${dStat.color}40`, borderRadius: 9, padding: "10px 13px" } },
                            React.createElement("div", { style: { fontWeight: 700, fontSize: 13, color: dStat.color, marginBottom: 3 } }, dStat.label),
                            React.createElement("div", { style: { fontSize: 11, color: "var(--muted)" } }, dStat.tip),
                            cap.multiplier !== 1 && (React.createElement("div", { style: { fontSize: 11, color: dStat.color, marginTop: 4, fontWeight: 600 } },
                                "Fator de ajuste profundidade: ",
                                cap.multiplier >= 1 ? "+" : "",
                                ((cap.multiplier - 1) * 100).toFixed(0),
                                "% na capacidade"))),
                        React.createElement("div", { style: { background: `${sp === null || sp === void 0 ? void 0 : sp.color}11`, border: `1px solid ${sp === null || sp === void 0 ? void 0 : sp.color}33`, borderRadius: 10, padding: 13 } },
                            React.createElement("div", { style: { fontSize: 11, fontWeight: 700, color: sp === null || sp === void 0 ? void 0 : sp.color, textTransform: "uppercase", marginBottom: 9 } }, "\uD83D\uDCD0 Capacidade Real (\u00C1rea + Profundidade)"),
                            React.createElement("div", { className: "grid2" }, [
                                { l: "Área (m²)", v: `${areaBase.toFixed(1)} m²` },
                                { l: "Área (ha)", v: `${(areaBase / 10000).toFixed(4)} ha` },
                                { l: "Volume (m³)", v: `${(cap.volM3 || 0).toFixed(1)} m³` },
                                { l: "Profundidade", v: `${depthBase.toFixed(2)} m`, warn: depthBase < (sp === null || sp === void 0 ? void 0 : sp.minDepthM) },
                                { l: "Limite por Área", v: `${cap.byArea.toLocaleString("pt-BR")} peixes`, note: "superfície" },
                                { l: "Limite por Volume", v: `${cap.byVolume.toLocaleString("pt-BR")} peixes`, note: "biomassa" },
                                { l: "✦ Qtd. Recomendada", v: `${cap.ideal.toLocaleString("pt-BR")} peixes`, highlight: true },
                                { l: "Fator Limitante", v: cap.limitingFactor },
                            ].map(i => (React.createElement("div", { key: i.l, style: { background: i.highlight ? "rgba(34,197,94,0.12)" : "rgba(0,0,0,0.2)", borderRadius: 8, padding: "8px 10px", border: i.highlight ? "1px solid rgba(34,197,94,0.3)" : "none" } },
                                React.createElement("div", { style: { fontSize: 10, color: i.highlight ? "#86efac" : "var(--muted)", textTransform: "uppercase", fontWeight: 600 } }, i.l),
                                React.createElement("div", { style: { fontFamily: "var(--mono)", fontSize: 13, fontWeight: 700, marginTop: 2, color: i.warn ? "var(--red)" : i.highlight ? "var(--green)" : "var(--text)" } }, i.v),
                                i.note && React.createElement("div", { style: { fontSize: 9, color: "var(--muted)", marginTop: 1 } }, i.note))))))));
                })(),
                (() => {
                    const cap = calcCapacity(form.species, areaBase, depthBase);
                    return (React.createElement("div", { className: "grid2" },
                        React.createElement("div", null,
                            React.createElement("lbl", null,
                                "Qtd. Peixes",
                                cap.ideal ? ` (recomendado: ${cap.ideal.toLocaleString("pt-BR")})` : ""),
                            React.createElement("input", { className: "inp", type: "number", placeholder: cap.ideal || "Qtd", value: form.fishCount, onChange: e => setForm(p => ({ ...p, fishCount: e.target.value })) })),
                        React.createElement("div", null,
                            React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 } },
                                React.createElement("lbl", { style: { margin: 0 } },
                                    "Peso M\u00E9dio (",
                                    wLabel,
                                    ")"),
                                React.createElement(UnitToggle, { category: "weight", value: wUnit, onChange: changeWeightUnit })),
                            React.createElement("input", { className: "inp", type: "number", step: "any", value: form.weightDisp, onChange: e => setForm(p => ({ ...p, weightDisp: e.target.value })) }))));
                })(),
                React.createElement("div", null,
                    React.createElement("lbl", null, "Pre\u00E7o de Venda Esperado (R$/kg)"),
                    React.createElement("input", { className: "inp", type: "number", step: "0.5", value: form.pricePerKg, onChange: e => setForm(p => ({ ...p, pricePerKg: e.target.value })) })),
                React.createElement("button", { className: "btn btn-p", style: { padding: 13, fontSize: 14 }, onClick: handleSubmit }, mode === "new" ? "✅ Criar Tanque" : "✅ Salvar Alterações")))));
}
// ═══════════════════════════════════════════════════════════════════════════════
// STOCK IN MODAL — Manual + Upload NF com leitura por IA
// ═══════════════════════════════════════════════════════════════════════════════
const EMPTY_NF = {
    date: "", supplier: "", nfNumber: "", feedType: "", feedBrand: "", proteinPct: "",
    bags: "", costPerBag: "", totalValue: "", payMethod: "PIX", obs: ""
};
function StockInModal({ onClose }) {
    const { addStockIn } = useApp();
    const [tab, setTab] = (0, useState)("manual"); // manual | upload
    const [form, setForm] = (0, useState)({ ...EMPTY_NF, date: today() });
    const [loading, setLoading] = (0, useState)(false);
    const [loadingMsg, setLoadingMsg] = (0, useState)("");
    const [parsed, setParsed] = (0, useState)(null); // data extracted from PDF
    const [pdfName, setPdfName] = (0, useState)("");
    const [pdfFile, setPdfFile] = (0, useState)(null);
    const [confirmed, setConfirmed] = (0, useState)(false);
    const fileRef = React.useRef(); // input element
    const storedFile = React.useRef(null); // stores the actual File object reliably
    const bags = parseInt(form.bags) || 0;
    const cpp = parseFloat(form.costPerBag) || 0;
    const total = form.totalValue ? parseFloat(form.totalValue) : bags * cpp;
    function handleField(k, v) { setForm(p => ({ ...p, [k]: v })); }
    // Auto-calc costPerBag when totalValue + bags change
    function handleTotal(v) {
        setForm(p => {
            const b = parseInt(p.bags) || 0;
            const t = parseFloat(v) || 0;
            return { ...p, totalValue: v, costPerBag: b > 0 && t > 0 ? (t / b).toFixed(2) : p.costPerBag };
        });
    }
    function handleBags(v) {
        setForm(p => {
            const b = parseInt(v) || 0;
            const t = parseFloat(p.totalValue) || 0;
            return { ...p, bags: v, costPerBag: b > 0 && t > 0 ? (t / b).toFixed(2) : p.costPerBag };
        });
    }
    // ── Universal NF reader: foto (JPG/PNG/HEIC) ou PDF → Claude Vision ─────────
    async function handleFile(fileOrEvent) {
        var _a, _b;
        const file = ((_b = (_a = fileOrEvent === null || fileOrEvent === void 0 ? void 0 : fileOrEvent.target) === null || _a === void 0 ? void 0 : _a.files) === null || _b === void 0 ? void 0 : _b[0]) || fileOrEvent || storedFile.current;
        if (!file || !(file instanceof File)) {
            alert("Nenhum arquivo selecionado. Selecione a foto ou PDF primeiro.");
            return;
        }
        if (file.size > 20 * 1024 * 1024)
            return alert("Arquivo muito grande. Máximo 20MB.");
        setLoading(true);
        setParsed(null);
        setLoadingMsg("Preparando arquivo...");
        try {
            const isImg = file.type.startsWith("image/") || /\.(jpe?g|png|heic|heif|webp)$/i.test(file.name);
            const isPDF = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
            setLoadingMsg(isImg ? "Lendo imagem..." : "Convertendo PDF...");
            // Convert to base64 via FileReader (works 100% no Safari/iPhone)
            const b64 = await new Promise((res, rej) => {
                const reader = new FileReader();
                reader.onload = () => res(reader.result.split(",")[1]);
                reader.onerror = () => rej(new Error("Erro ao ler o arquivo."));
                reader.readAsDataURL(file);
            });
            // Pick media type
            let mediaType = "image/jpeg";
            if (isPDF)
                mediaType = "application/pdf";
            else if (/\.png$/i.test(file.name))
                mediaType = "image/png";
            else if (/\.heic$/i.test(file.name))
                mediaType = "image/jpeg"; // Claude aceita heic como jpeg
            else if (/\.webp$/i.test(file.name))
                mediaType = "image/webp";
            else if (file.type && file.type !== "application/octet-stream")
                mediaType = file.type;
            setLoadingMsg("Enviando para leitura da IA...");
            // ── Chama o servidor proxy (evita bloqueio CORS do Safari) ──────────────
            // IMPORTANTE: substitua a URL abaixo pela URL do seu servidor Vercel
            // Exemplo: "https://aquagestao-api.vercel.app/api/ler-nf"
            const SERVER_URL = window.AQUA_SERVER_URL || "/api/ler-nf";
            const resp = await fetch(SERVER_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ base64: b64, mediaType, fileName: file.name })
            });
            if (!resp.ok) {
                const errText = await resp.text().catch(() => "");
                throw new Error("Erro no servidor (" + resp.status + "): " + errText.slice(0, 150));
            }
            const result = await resp.json();
            if (!result.ok)
                throw new Error(result.error || "Servidor retornou erro");
            const extracted = result.data || {};
            setParsed({ ...extracted, method: isImg ? "vision-img" : "vision-pdf" });
            setForm(p => ({ ...p, ...extracted }));
            setTab("manual");
        }
        catch (err) {
            console.error("NF reader error:", err);
            setParsed({ rawText: "", _error: err.message || String(err), method: "error" });
            setTab("manual");
        }
        finally {
            setLoading(false);
            setLoadingMsg("");
        }
    }
    // ── Parse Brazilian NF text with regex ────────────────────────────────────
    function parseNFText(text) {
        var _a, _b, _c, _d, _e;
        const t = text.toUpperCase();
        const orig = text;
        // NF Number
        const nfMatch = orig.match(/N[º°]\.?\s*(\d{3}[\.\d]+)/i)
            || orig.match(/NOTA\s+FISCAL[^\d]*(\d{3,})/i)
            || orig.match(/NF[-\s]?e?[^\d]*(\d{3,9})/i);
        const nfNumber = ((_a = nfMatch === null || nfMatch === void 0 ? void 0 : nfMatch[1]) === null || _a === void 0 ? void 0 : _a.replace(/\./g, "")) || "";
        // Date — DD/MM/YYYY or YYYY-MM-DD
        const dateMatch = orig.match(/(\d{2})\/(\d{2})\/(\d{4})/);
        const date = dateMatch ? `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}` : "";
        // Supplier — usually first big text block or after EMITENTE/RAZÃO SOCIAL
        const supplierMatch = orig.match(/(?:EMITENTE|RAZ.O SOCIAL|NOME EMPRESARIAL)[:\s]+([^\r\n,]{3,60})/i)
            || orig.match(/^([A-Z][\w\s]{5,50}(?:LTDA|SA|ME|EIRELI|COMERCIO|AGRO))/m);
        const supplier = ((_b = supplierMatch === null || supplierMatch === void 0 ? void 0 : supplierMatch[1]) === null || _b === void 0 ? void 0 : _b.trim().replace(/\s+/g, " ")) || "";
        // Total value — look for VALOR TOTAL or NF total
        const totalMatch = orig.match(/VALOR\s+TOTAL\s+DA\s+NOTA[^\d]*(\d[\d.,]+)/i)
            || orig.match(/TOTAL\s+GERAL[^\d]*R?\$?\s*(\d[\d.,]+)/i)
            || orig.match(/VALOR\s+TOTAL[^\d]*R?\$?\s*(\d[\d.,]+)/i)
            || orig.match(/TOTAL\s+(?:DOS\s+PRODUTOS)?[^\d]*R?\$?\s*(\d[\d.,]+)/i);
        const totalValue = (totalMatch === null || totalMatch === void 0 ? void 0 : totalMatch[1])
            ? parseFloat(totalMatch[1].replace(/\./g, "").replace(",", ".")).toFixed(2)
            : "";
        // Bags of 25kg
        let bags = "";
        const bagMatch25 = orig.match(/(\d+)\s*(?:SACOS?|SC|BAG)\s*(?:DE\s*)?25\s*KG/i)
            || orig.match(/(\d+)\s*SACOS?\s*25/i);
        if (bagMatch25) {
            bags = bagMatch25[1];
        }
        else {
            // Try to find qty × 25kg
            const kgMatch = orig.match(/(\d[\d.,]+)\s*KG/i);
            if (kgMatch) {
                const kg = parseFloat(kgMatch[1].replace(",", "."));
                if (kg > 0)
                    bags = Math.round(kg / 25).toString();
            }
        }
        // Cost per bag
        let costPerBag = "";
        if (bags && totalValue) {
            const b = parseInt(bags);
            const t = parseFloat(totalValue);
            if (b > 0 && t > 0)
                costPerBag = (t / b).toFixed(2);
        }
        // Feed type
        const feedTypeMatch = orig.match(/(?:EXTRA[OÃ]O|EXTRUS[AÃ]DA?|PELETIZADA?|GRANULADA?|FARELADA?|AFUNDANTE|FLUTUANTE)[A-Z\s]*/i);
        const feedType = ((_c = feedTypeMatch === null || feedTypeMatch === void 0 ? void 0 : feedTypeMatch[0]) === null || _c === void 0 ? void 0 : _c.trim()) || "";
        // Feed brand — common brands
        const brands = ["GUABI", "SUPRA", "NUTRON", "POTIMAR", "SOCIL", "INTEGRAL", "AGROCERES", "PURINA", "CARGILL", "COBIA", "FRI-RIBE", "RAÇÃO"];
        let feedBrand = "";
        for (const b of brands) {
            if (t.includes(b)) {
                feedBrand = b;
                break;
            }
        }
        if (!feedBrand) {
            const brandMatch = orig.match(/(?:FABRICANTE|MARCA|PRODUTO)[:\s]+([A-ZÁÊÓÃ\s]{3,30})/i);
            feedBrand = ((_d = brandMatch === null || brandMatch === void 0 ? void 0 : brandMatch[1]) === null || _d === void 0 ? void 0 : _d.trim()) || "";
        }
        // Protein %
        const protMatch = orig.match(/PROTE[IÍ]NA\s*BRUTA[^\d]*(\d{2})/i)
            || orig.match(/PB[:\s]+(\d{2})\s*%/i)
            || orig.match(/(\d{2})\s*%\s*PROTE[IÍ]NA/i);
        const rawProt = (protMatch === null || protMatch === void 0 ? void 0 : protMatch[1]) ? parseInt(protMatch[1]) : 0;
        const validProts = [45, 40, 36, 32, 28];
        const proteinPct = rawProt > 0
            ? (validProts.find(p => Math.abs(p - rawProt) <= 3) || "") + "%"
            : "";
        // Payment method
        const payMatch = orig.match(/(?:FORMA|MEIO)\s+(?:DE\s+)?PAGAMENTO[:\s]+([^\r\n.]{3,30})/i);
        let payMethod = ((_e = payMatch === null || payMatch === void 0 ? void 0 : payMatch[1]) === null || _e === void 0 ? void 0 : _e.trim()) || "PIX";
        if (/PIX/i.test(orig))
            payMethod = "PIX";
        else if (/BOLETO/i.test(orig))
            payMethod = "Boleto";
        else if (/CART[AÃ]O/i.test(orig))
            payMethod = "Cartão";
        else if (/DINHEIRO|ESPÉCIE/i.test(orig))
            payMethod = "À vista";
        return { supplier, nfNumber, date, feedType, feedBrand, proteinPct, bags, totalValue, costPerBag, payMethod, obs: "" };
    }
    function handleConfirm() {
        if (!bags || !cpp)
            return alert("Preencha pelo menos sacos e custo por saco.");
        if (!form.supplier)
            return alert("Informe o fornecedor.");
        addStockIn({ ...form, bags, costPerBag: cpp, totalValue: total, source: pdfName ? "pdf" : "manual" });
        setConfirmed(true);
    }
    if (confirmed)
        return (React.createElement("div", { style: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(10px)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 } },
            React.createElement("div", { className: "card slide", style: { width: "100%", maxWidth: 420, padding: 32, textAlign: "center" } },
                React.createElement("div", { style: { fontSize: 52, marginBottom: 16 } }, "\u2705"),
                React.createElement("h2", { style: { fontWeight: 700, fontSize: 20, marginBottom: 8 } }, "Estoque Atualizado!"),
                React.createElement("div", { style: { fontFamily: "var(--mono)", fontSize: 24, color: "var(--green)", fontWeight: 700, marginBottom: 6 } },
                    bags,
                    " sacos"),
                React.createElement("div", { style: { color: "var(--muted)", fontSize: 14, marginBottom: 4 } },
                    bags * 25,
                    " kg de ra\u00E7\u00E3o adicionados"),
                React.createElement("div", { style: { color: "var(--muted)", fontSize: 14, marginBottom: 20 } },
                    "Total da compra: ",
                    React.createElement("strong", { style: { color: "var(--text)" } }, fmtBRL(total))),
                form.nfNumber && React.createElement("div", { style: { fontSize: 13, color: "var(--muted)", marginBottom: 4 } },
                    "NF n\u00BA ",
                    form.nfNumber,
                    " \u00B7 ",
                    form.supplier),
                React.createElement("button", { className: "btn btn-p", style: { width: "100%", padding: 12, marginTop: 8 }, onClick: onClose }, "Fechar"))));
    return (React.createElement("div", { style: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(10px)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, overflowY: "auto" } },
        React.createElement("div", { className: "card slide", style: { width: "100%", maxWidth: 560, padding: 26, maxHeight: "92vh", overflowY: "auto", margin: "auto" } },
            React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 } },
                React.createElement("div", null,
                    React.createElement("h2", { style: { fontWeight: 700, fontSize: 18 } }, "\uD83D\uDCE5 Entrada de Ra\u00E7\u00E3o"),
                    pdfName && React.createElement("div", { style: { fontSize: 11, color: "var(--accent)", marginTop: 3 } },
                        "\uD83D\uDCC4 ",
                        pdfName)),
                React.createElement("button", { onClick: onClose, style: { background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: 20 } }, "\u2715")),
            React.createElement("div", { style: { display: "flex", gap: 6, marginBottom: 20 } },
                React.createElement("button", { className: `tab-btn ${tab === "manual" ? "active" : ""}`, onClick: () => setTab("manual") }, "\u270F\uFE0F Digitar Manualmente"),
                React.createElement("button", { className: `tab-btn ${tab === "upload" ? "active" : ""}`, onClick: () => setTab("upload") }, "\uD83D\uDCC4 Upload Nota Fiscal (PDF)")),
            tab === "upload" && (React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 14 } },
                React.createElement("input", { ref: fileRef, type: "file", accept: ".pdf,.jpg,.jpeg,.png,.heic,.heif,.webp,application/pdf,image/*", style: { display: "none" }, onChange: e => {
                        const file = e.target.files[0];
                        if (file) {
                            storedFile.current = file; // store reliably in ref
                            setPdfFile(file);
                            setPdfName(file.name);
                            setParsed(null);
                        }
                    } }),
                React.createElement("div", { style: { background: "rgba(255,255,255,0.03)", border: "1px solid var(--border2)", borderRadius: 12, padding: 16 } },
                    React.createElement("div", { style: { fontSize: 12, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".5px", marginBottom: 10 } }, "Passo 1 \u2014 Selecionar arquivo"),
                    React.createElement("button", { className: "btn btn-g", style: { width: "100%", padding: 14, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }, onClick: () => { var _a; return (_a = fileRef.current) === null || _a === void 0 ? void 0 : _a.click(); } },
                        React.createElement("span", { style: { fontSize: 20 } }, "\uD83D\uDCC2"),
                        React.createElement("span", null, pdfName ? `📄 ${pdfName}` : "Selecionar Foto ou PDF da NF")),
                    pdfName && (React.createElement("div", { style: { marginTop: 8, display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--green)" } },
                        React.createElement("span", null, "\u2705"),
                        React.createElement("span", { style: { fontWeight: 600 } }, pdfName),
                        React.createElement("button", { onClick: () => { storedFile.current = null; setPdfName(""); setPdfFile(null); setParsed(null); if (fileRef.current)
                                fileRef.current.value = ""; }, style: { marginLeft: "auto", background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: 12 } }, "Trocar")))),
                pdfName && !parsed && (React.createElement("div", { style: { background: "rgba(14,165,233,0.06)", border: "1px solid rgba(14,165,233,0.25)", borderRadius: 12, padding: 16 } },
                    React.createElement("div", { style: { fontSize: 12, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".5px", marginBottom: 10 } }, "Passo 2 \u2014 Ler com IA"),
                    loading ? (React.createElement("div", { style: { textAlign: "center", padding: "20px 0" } },
                        React.createElement("div", { style: { fontSize: 36, marginBottom: 10 }, className: "pulse" }, "\uD83E\uDD16"),
                        React.createElement("div", { style: { fontWeight: 700, fontSize: 14, marginBottom: 4 } }, loadingMsg || "Processando..."),
                        React.createElement("div", { style: { fontSize: 12, color: "var(--muted)" } }, "Aguarde alguns segundos."),
                        React.createElement("div", { style: { marginTop: 12, height: 4, borderRadius: 4, background: "rgba(255,255,255,0.08)", overflow: "hidden" } },
                            React.createElement("div", { className: "pulse", style: { height: "100%", width: "60%", background: "var(--accent)", borderRadius: 4 } })))) : (React.createElement("button", { className: "btn btn-p", style: { width: "100%", padding: 16, fontSize: 15, display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }, onClick: () => handleFile(storedFile.current) },
                        React.createElement("span", { style: { fontSize: 20 } }, "\uD83E\uDD16"),
                        React.createElement("span", null, "Enviar para IA Ler a NF"))),
                    React.createElement("div", { style: { marginTop: 10, fontSize: 11, color: "var(--muted)", textAlign: "center" } }, "A IA extrai: fornecedor, NF n\u00BA, sacos, valor, tipo e prote\u00EDna da ra\u00E7\u00E3o"))),
                parsed && (React.createElement("div", { style: { background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.3)", borderRadius: 12, padding: 16 } },
                    React.createElement("div", { style: { fontSize: 12, fontWeight: 700, color: "var(--green)", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 } },
                        React.createElement("span", { style: { fontSize: 18 } }, "\u2705"),
                        React.createElement("div", null,
                            React.createElement("div", null, "Dados extra\u00EDdos com sucesso! Revise abaixo."),
                            React.createElement("div", { style: { fontSize: 11, fontWeight: 400, color: "var(--muted)", marginTop: 2 } }, parsed.method === "vision-img" ? "📷 Lido de foto/imagem" :
                                parsed.method === "vision-pdf" ? "🤖 PDF lido por visão IA" :
                                    parsed.method === "text" ? "📄 Texto digital extraído" : ""))),
                    parsed._error && (React.createElement("div", { style: { background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, padding: "10px 13px", marginBottom: 12, fontSize: 12, color: "#f87171" } },
                        "\u26A0\uFE0F N\u00E3o foi poss\u00EDvel extrair o texto do PDF (",
                        parsed._error,
                        "). Preencha os campos manualmente abaixo.")),
                    React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 } }, [
                        ["Fornecedor", parsed.supplier],
                        ["NF nº", parsed.nfNumber],
                        ["Data", parsed.date],
                        ["Tipo", parsed.feedType],
                        ["Proteína", parsed.proteinPct],
                        ["Marca", parsed.feedBrand],
                        ["Sacos", parsed.bags],
                        ["Custo/saco", parsed.costPerBag ? fmtBRL(parseFloat(parsed.costPerBag)) : "—"],
                        ["Total NF", parsed.totalValue ? fmtBRL(parseFloat(parsed.totalValue)) : "—"],
                        ["Pagamento", parsed.payMethod],
                    ].map(([l, v]) => (React.createElement("div", { key: l, style: { background: "rgba(0,0,0,0.25)", borderRadius: 8, padding: "8px 10px",
                            border: v && v !== "—" ? "1px solid rgba(34,197,94,0.2)" : "1px solid rgba(255,255,255,0.04)" } },
                        React.createElement("div", { style: { color: "var(--muted)", fontSize: 10, textTransform: "uppercase", fontWeight: 600 } }, l),
                        React.createElement("div", { style: { fontWeight: 700, fontSize: 13, marginTop: 2, color: v && v !== "—" ? "var(--text)" : "var(--muted)" } }, v || "—"))))),
                    parsed.rawText && (React.createElement("details", { style: { marginBottom: 12 } },
                        React.createElement("summary", { style: { fontSize: 11, color: "var(--muted)", cursor: "pointer", padding: "6px 0" } }, "\uD83D\uDCC4 Ver texto bruto extra\u00EDdo do PDF"),
                        React.createElement("div", { style: { marginTop: 8, background: "rgba(0,0,0,0.3)", borderRadius: 8, padding: "10px 12px", fontSize: 10, color: "var(--muted)", fontFamily: "var(--mono)", maxHeight: 120, overflowY: "auto", lineHeight: 1.6, whiteSpace: "pre-wrap" } },
                            parsed.rawText.slice(0, 800),
                            parsed.rawText.length > 800 ? "..." : ""))),
                    React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 } },
                        React.createElement("button", { className: "btn btn-g", style: { padding: 12, fontSize: 13 }, onClick: () => { storedFile.current = null; setParsed(null); setPdfName(""); setPdfFile(null); if (fileRef.current)
                                fileRef.current.value = ""; } }, "\uD83D\uDD04 Ler outra NF"),
                        React.createElement("button", { className: "btn btn-p", style: { padding: 12, fontSize: 13 }, onClick: () => setTab("manual") }, "\u270F\uFE0F Revisar e Confirmar \u2192")))),
                React.createElement("div", { style: { fontSize: 12, color: "var(--muted)", padding: "10px 14px", background: "rgba(255,255,255,0.025)", borderRadius: 9 } },
                    "\uD83D\uDCF7 ",
                    React.createElement("strong", null, "Aceita foto do iPhone!"),
                    " Tire foto da nota com a c\u00E2mera, selecione a imagem e a IA l\u00EA. Tamb\u00E9m aceita PDF."))),
            tab === "manual" && (React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 14 } },
                parsed && !parsed._error && (React.createElement("div", { style: { background: "rgba(14,165,233,0.08)", border: "1px solid rgba(14,165,233,0.2)", borderRadius: 9, padding: "10px 14px", fontSize: 12, color: "var(--accent)" } },
                    "\uD83D\uDCC4 Dados extra\u00EDdos do PDF ",
                    React.createElement("strong", null, pdfName),
                    ". Revise e corrija o que estiver diferente antes de confirmar.")),
                (parsed === null || parsed === void 0 ? void 0 : parsed._error) && (React.createElement("div", { style: { background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: 9, padding: "10px 14px", fontSize: 12, color: "var(--yellow)" } }, "\u26A0\uFE0F Leitura parcial \u2014 preencha os campos em branco manualmente.")),
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
                            React.createElement("option", null, "Extrusada semi-afundante"),
                            React.createElement("option", null, "Extrusada micro (alevino)"),
                            React.createElement("option", null, "Peletizada"),
                            React.createElement("option", null, "Outro"))),
                    React.createElement("div", null,
                        React.createElement("lbl", null, "% Prote\u00EDna da Ra\u00E7\u00E3o"),
                        React.createElement("select", { className: "inp", value: form.proteinPct, onChange: e => handleField("proteinPct", e.target.value) },
                            React.createElement("option", { value: "" }, "Selecione..."),
                            React.createElement("option", null, "45%"),
                            React.createElement("option", null, "40%"),
                            React.createElement("option", null, "36%"),
                            React.createElement("option", null, "32%"),
                            React.createElement("option", null, "28%")))),
                React.createElement("div", null,
                    React.createElement("lbl", null, "Marca / Fabricante"),
                    React.createElement("input", { className: "inp", placeholder: "ex: Guabi, Supra, Nutron...", value: form.feedBrand, onChange: e => handleField("feedBrand", e.target.value) })),
                React.createElement("div", { style: { background: "rgba(255,255,255,0.025)", borderRadius: 10, padding: "14px 16px" } },
                    React.createElement("div", { style: { fontSize: 12, fontWeight: 600, color: "var(--accent)", marginBottom: 12, textTransform: "uppercase", letterSpacing: ".4px" } }, "\uD83D\uDCB0 Valores (preencha total ou custo/saco \u2014 o outro \u00E9 calculado)"),
                    React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 } },
                        React.createElement("div", null,
                            React.createElement("lbl", null, "Sacos (25kg) *"),
                            React.createElement("input", { className: "inp", type: "number", placeholder: "ex: 200", value: form.bags, onChange: e => handleBags(e.target.value) })),
                        React.createElement("div", null,
                            React.createElement("lbl", null, "Valor Total da NF (R$)"),
                            React.createElement("input", { className: "inp", type: "number", step: "0.01", placeholder: "ex: 20000,00", value: form.totalValue, onChange: e => handleTotal(e.target.value) })),
                        React.createElement("div", null,
                            React.createElement("lbl", null, "Custo por Saco (R$)"),
                            React.createElement("input", { className: "inp", type: "number", step: "0.01", placeholder: "calculado", value: form.costPerBag, onChange: e => handleField("costPerBag", e.target.value) })))),
                React.createElement("div", { className: "grid2" },
                    React.createElement("div", null,
                        React.createElement("lbl", null, "Forma de Pagamento"),
                        React.createElement("select", { className: "inp", value: form.payMethod, onChange: e => handleField("payMethod", e.target.value) },
                            React.createElement("option", null, "PIX"),
                            React.createElement("option", null, "\u00C0 vista"),
                            React.createElement("option", null, "Boleto 30d"),
                            React.createElement("option", null, "Boleto 60d"),
                            React.createElement("option", null, "Boleto 30/60/90d"),
                            React.createElement("option", null, "Cart\u00E3o"),
                            React.createElement("option", null, "Transfer\u00EAncia"),
                            React.createElement("option", null, "Outro"))),
                    React.createElement("div", null,
                        React.createElement("lbl", null, "Observa\u00E7\u00F5es (vencimento, frete...)"),
                        React.createElement("input", { className: "inp", placeholder: "opcional", value: form.obs, onChange: e => handleField("obs", e.target.value) }))),
                bags > 0 && cpp > 0 && (React.createElement("div", { style: { background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.25)", borderRadius: 10, padding: "14px 16px" } },
                    React.createElement("div", { style: { fontSize: 11, fontWeight: 700, color: "var(--green)", textTransform: "uppercase", letterSpacing: ".5px", marginBottom: 10 } }, "Resumo da Entrada"),
                    React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 } }, [
                        { l: "Sacos", v: `${bags} sacos` },
                        { l: "Ração total", v: `${bags * 25} kg` },
                        { l: "Custo/saco", v: fmtBRL(cpp) },
                        { l: "Total da NF", v: fmtBRL(total) },
                        { l: "Proteína", v: form.proteinPct || "—" },
                        { l: "Pagamento", v: form.payMethod },
                        { l: "Fornecedor", v: form.supplier || "—" },
                    ].map(i => (React.createElement("div", { key: i.l, style: { background: "rgba(0,0,0,0.2)", borderRadius: 8, padding: "8px 10px" } },
                        React.createElement("div", { style: { fontSize: 10, color: "var(--muted)", textTransform: "uppercase", fontWeight: 600 } }, i.l),
                        React.createElement("div", { style: { fontFamily: "var(--mono)", fontWeight: 700, fontSize: 13, marginTop: 2, color: "var(--text)" } }, i.v))))))),
                React.createElement("button", { className: "btn btn-p", style: { padding: 13, fontSize: 14 }, onClick: handleConfirm }, "\u2705 Confirmar Entrada no Estoque"))))));
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
                    { cat: "length", label: "📏 Comprimento", opts: { "cm": "cm", "m": "m" } },
                ].map(g => (React.createElement("div", { key: g.cat, style: { background: "rgba(255,255,255,0.025)", borderRadius: 10, padding: "14px 16px" } },
                    React.createElement("div", { style: { fontSize: 13, fontWeight: 600, marginBottom: 10 } }, g.label),
                    React.createElement("div", { style: { display: "flex", gap: 6 } }, Object.entries(g.opts).map(([k, label]) => (React.createElement("button", { key: k, className: `tab-btn ${units[g.cat] === k ? "active" : ""}`, style: { padding: "5px 14px", fontSize: 12 }, onClick: () => setUnits(u => ({ ...u, [g.cat]: k })) }, label))))))),
                React.createElement("div", { style: { background: "rgba(255,255,255,0.025)", borderRadius: 10, padding: "14px 16px" } },
                    React.createElement("div", { style: { fontSize: 13, fontWeight: 600, marginBottom: 4 } }, "\uD83C\uDF7D\uFE0F Ra\u00E7\u00E3o"),
                    React.createElement("div", { style: { fontSize: 12, color: "var(--muted)" } }, "Fixado em sacos de 25kg conforme configura\u00E7\u00E3o do projeto.")),
                React.createElement("div", { className: "section-hdr", style: { marginTop: 8 } }, "Hor\u00E1rios de Leitura de \u00C1gua"),
                React.createElement("div", { style: { background: "rgba(255,255,255,0.025)", borderRadius: 10, padding: "14px 16px" } },
                    React.createElement("div", { style: { fontSize: 13, fontWeight: 600, marginBottom: 4 } }, "\uD83D\uDCA7 3 leituras di\u00E1rias de O\u2082 e temperatura"),
                    React.createElement("div", { style: { fontSize: 12, color: "var(--muted)", marginBottom: 12 } }, "Defina os hor\u00E1rios fixos. S\u00E3o aplicados em todos os tanques."),
                    React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 } }, ["🌅 Manhã", "☀️ Tarde", "🌙 Noite"].map((label, i) => (React.createElement("div", { key: i },
                        React.createElement("lbl", null, label),
                        React.createElement("input", { type: "time", className: "inp", style: { marginTop: 4, textAlign: "center", fontFamily: "var(--mono)" }, value: waterTimes[i], onChange: e => {
                                const next = [...waterTimes];
                                next[i] = e.target.value;
                                setWaterTimes(next);
                            } })))))),
                React.createElement("div", { className: "section-hdr", style: { marginTop: 8 } }, "Notifica\u00E7\u00F5es"),
                React.createElement("div", { style: { background: "rgba(255,255,255,0.025)", borderRadius: 10, padding: "14px 16px" } },
                    React.createElement("div", { style: { fontSize: 13, fontWeight: 600, marginBottom: 4 } }, "\uD83D\uDD14 Alertas do navegador"),
                    React.createElement("div", { style: { fontSize: 12, color: "var(--muted)", marginBottom: 10 } }, "Receba alertas de O\u2082 cr\u00EDtico e estoque baixo mesmo com o app em segundo plano."),
                    notifPerm === "granted" ? (React.createElement("div", { style: { color: "var(--green)", fontSize: 13, fontWeight: 600 } }, "\u2705 Notifica\u00E7\u00F5es ativas")) : (React.createElement("button", { className: "btn btn-p", onClick: requestNotif }, "Ativar Notifica\u00E7\u00F5es"))),
                React.createElement("button", { className: "btn btn-p", style: { marginTop: 8, padding: 13 }, onClick: onClose }, "\u2705 Fechar")))));
}
// ═══════════════════════════════════════════════════════════════════════════════
// FINANCEIRO MODAL — CAPEX + OPEX GERAL + CRONOGRAMA
// ═══════════════════════════════════════════════════════════════════════════════
const CAPEX_CATS = [
    "Gerador", "Transformador", "Infraestrutura Elétrica", "Aeradores",
    "Botes e Rabetas", "Sistema de Câmeras", "Reforma Casa Caseiro",
    "Roçadeiras", "Máquinas e Equipamentos", "Outros CAPEX"
];
const OPEX_CATS = [
    "Energia Elétrica", "Salário Caseiro", "Salário Técnico",
    "Aluguel Tanques", "Assistência Técnica", "Manutenção", "Combustível",
    "Medicamentos", "Outros OPEX"
];
function FinanceiroModal({ onClose }) {
    var _a, _b, _c, _d;
    const { capex, setCapex, opexG, setOpexG, schedule, setSchedule, tanks, expenses } = useApp();
    const [tab, setTab] = (0, useState)("capex");
    const [form, setForm] = (0, useState)({ date: today(), cat: "", desc: "", amount: "", tankId: "", type: "geral" });
    const [schedForm, setSchedForm] = (0, useState)({ desc: "", amount: "", dueDate: "", paid: false, cat: "CAPEX" });
    const tabs = [
        { id: "capex", label: "🏗️ CAPEX" },
        { id: "opex", label: "📊 OPEX Geral" },
        { id: "resumo", label: "💰 Resumo" },
    ];
    // Totals
    const totalCapex = capex.reduce((s, e) => s + (e.amount || 0), 0);
    const totalOpexG = opexG.reduce((s, e) => s + (e.amount || 0), 0);
    const totalExpTanks = Object.values(useApp().expenses || {}).flat().reduce((s, e) => s + (e.amount || 0), 0);
    const totalOpex = totalOpexG + totalExpTanks;
    // Schedule
    const pending = schedule.filter(s => !s.paid).sort((a, b) => a.dueDate > b.dueDate ? 1 : -1);
    const totalPending = pending.reduce((s, e) => s + (e.amount || 0), 0);
    const nextPayment = pending[0];
    function cleanCat(cat) { var _a; return ((_a = cat.startsWith) === null || _a === void 0 ? void 0 : _a.call(cat, "__custom__")) ? cat.replace("__custom__", "") : cat; }
    function addCapex() {
        const cat = cleanCat(form.cat);
        if (!form.amount || !cat)
            return alert("Preencha categoria e valor.");
        setCapex(p => [...p, { ...form, cat, id: genId(), amount: parseFloat(form.amount) }]);
        setForm(p => ({ ...p, desc: "", amount: "", tankId: "", cat: "" }));
    }
    function addOpex() {
        const cat = cleanCat(form.cat);
        if (!form.amount || !cat)
            return alert("Preencha categoria e valor.");
        setOpexG(p => [...p, { ...form, cat, id: genId(), amount: parseFloat(form.amount) }]);
        setForm(p => ({ ...p, desc: "", amount: "", cat: "" }));
    }
    function addSched() {
        if (!schedForm.amount || !schedForm.dueDate || !schedForm.desc)
            return alert("Preencha descrição, valor e vencimento.");
        setSchedule(p => [...p, { ...schedForm, id: genId(), amount: parseFloat(schedForm.amount) }]);
        setSchedForm({ desc: "", amount: "", dueDate: "", paid: false, cat: "CAPEX" });
    }
    function togglePaid(id) {
        setSchedule(p => p.map(s => s.id === id ? { ...s, paid: !s.paid } : s));
    }
    function delCapex(id) { setCapex(p => p.filter(e => e.id !== id)); }
    function delOpex(id) { setOpexG(p => p.filter(e => e.id !== id)); }
    function delSched(id) { setSchedule(p => p.filter(e => e.id !== id)); }
    // Group by category
    function groupBy(arr, key) {
        return arr.reduce((acc, item) => {
            const k = item[key] || "Outros";
            if (!acc[k])
                acc[k] = [];
            acc[k].push(item);
            return acc;
        }, {});
    }
    const capexByCat = groupBy(capex, "cat");
    const opexByCat = groupBy(opexG, "cat");
    return (React.createElement("div", { style: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", backdropFilter: "blur(12px)", zIndex: 200, display: "flex", flexDirection: "column" } },
        React.createElement("div", { style: { padding: "14px 18px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 12, background: "var(--dark)" } },
            React.createElement("span", { style: { fontSize: 22 } }, "\uD83D\uDCB0"),
            React.createElement("div", null,
                React.createElement("div", { style: { fontWeight: 800, fontSize: 17 } }, "Financeiro da Fazenda"),
                React.createElement("div", { style: { fontSize: 11, color: "var(--muted)" } }, "CAPEX \u00B7 OPEX Geral \u00B7 Cronograma")),
            React.createElement("div", { style: { flex: 1 } }),
            React.createElement("button", { onClick: onClose, style: { background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: 22 } }, "\u2715")),
        React.createElement("div", { style: { display: "flex", gap: 4, padding: "10px 14px", borderBottom: "1px solid var(--border)", background: "var(--dark)" } }, tabs.map(t => (React.createElement("button", { key: t.id, className: `tab-btn ${tab === t.id ? "active" : ""}`, style: { flex: 1, fontSize: 11, padding: "7px 4px", opacity: t.disabled ? .5 : 1 }, onClick: () => !t.disabled && setTab(t.id) }, t.label)))),
        React.createElement("div", { style: { flex: 1, overflowY: "auto", padding: 16 } },
            tab === "capex" && (React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 14 } },
                React.createElement("div", { className: "card", style: { padding: 16 } },
                    React.createElement("div", { className: "section-hdr" }, "+ Novo Lan\u00E7amento CAPEX"),
                    React.createElement("div", { style: { display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" } }, ["geral", "tanque"].map(t => (React.createElement("button", { key: t, className: `tab-btn ${form.type === t ? "active" : ""}`, style: { fontSize: 12 }, onClick: () => setForm(p => ({ ...p, type: t })) }, t === "geral" ? "🏭 Geral da fazenda" : "🏊 Por tanque")))),
                    React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 10 } },
                        React.createElement("div", { className: "grid2" },
                            React.createElement("div", null,
                                React.createElement("lbl", null, "Data"),
                                React.createElement("input", { type: "date", className: "inp", value: form.date, onChange: e => setForm(p => ({ ...p, date: e.target.value })) })),
                            React.createElement("div", null,
                                React.createElement("lbl", null, "Categoria"),
                                React.createElement("select", { className: "inp", value: form.cat.startsWith("__custom__") ? "__custom__" : form.cat, onChange: e => setForm(p => ({ ...p, cat: e.target.value === "__custom__" ? "__custom__" : e.target.value })) },
                                    React.createElement("option", { value: "" }, "Selecione..."),
                                    CAPEX_CATS.map(c => React.createElement("option", { key: c }, c)),
                                    React.createElement("option", { value: "__custom__" }, "\u270F\uFE0F Outra categoria...")),
                                (form.cat === "__custom__" || form.cat.startsWith("__custom__")) && (React.createElement("input", { className: "inp", style: { marginTop: 6 }, placeholder: "Digite a categoria", value: form.cat === "__custom__" ? "" : form.cat.replace("__custom__", ""), onChange: e => setForm(p => ({ ...p, cat: "__custom__" + e.target.value })) })))),
                        form.type === "tanque" && (React.createElement("div", null,
                            React.createElement("lbl", null, "Tanque"),
                            React.createElement("select", { className: "inp", value: form.tankId, onChange: e => setForm(p => ({ ...p, tankId: e.target.value })) },
                                React.createElement("option", { value: "" }, "Selecione o tanque..."),
                                tanks.map(t => React.createElement("option", { key: t.id, value: t.id }, t.name))))),
                        React.createElement("div", null,
                            React.createElement("lbl", null, "Descri\u00E7\u00E3o"),
                            React.createElement("input", { className: "inp", placeholder: "ex: Gerador 107KVA marca X", value: form.desc, onChange: e => setForm(p => ({ ...p, desc: e.target.value })) })),
                        React.createElement("div", null,
                            React.createElement("lbl", null, "Valor (R$)"),
                            React.createElement("input", { className: "inp", type: "number", step: "0.01", placeholder: "0,00", value: form.amount, onChange: e => setForm(p => ({ ...p, amount: e.target.value })) })),
                        React.createElement("button", { className: "btn btn-p", onClick: addCapex }, "+ Adicionar CAPEX")),
                    React.createElement("div", { style: { marginTop: 10, padding: "10px 13px", background: "rgba(14,165,233,0.06)", borderRadius: 9, fontSize: 11, color: "var(--muted)", lineHeight: 1.7 } },
                        React.createElement("strong", { style: { color: "var(--accent)" } }, "CAPEX"),
                        " (Capital Expenditure) = ",
                        React.createElement("strong", null, "Investimento em infraestrutura"),
                        " \u2014 gastos \u00FAnicos ou de longa dura\u00E7\u00E3o que geram valor ao longo do tempo. Ex: gerador, aeradores, botes, instala\u00E7\u00F5es el\u00E9tricas. S\u00E3o amortizados ao longo dos ciclos produtivos.")),
                React.createElement("div", { className: "card", style: { padding: 14, background: "rgba(14,165,233,0.06)", borderColor: "rgba(14,165,233,0.2)" } },
                    React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center" } },
                        React.createElement("span", { style: { fontSize: 13, color: "var(--muted)" } }, "Total CAPEX investido"),
                        React.createElement("span", { style: { fontFamily: "var(--mono)", fontSize: 20, fontWeight: 800, color: "var(--accent)" } }, fmtBRL(totalCapex)))),
                Object.entries(capexByCat).map(([cat, items]) => (React.createElement("div", { key: cat, className: "card", style: { padding: 14 } },
                    React.createElement("div", { style: { display: "flex", justifyContent: "space-between", marginBottom: 10 } },
                        React.createElement("span", { style: { fontSize: 12, fontWeight: 700, color: "var(--accent)" } }, cat),
                        React.createElement("span", { style: { fontFamily: "var(--mono)", fontSize: 12, fontWeight: 700 } }, fmtBRL(items.reduce((s, e) => s + e.amount, 0)))),
                    items.map(e => {
                        var _a;
                        return (React.createElement("div", { key: e.id, style: { display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: "1px solid var(--border)" } },
                            React.createElement("div", { style: { flex: 1 } },
                                React.createElement("div", { style: { fontSize: 12, fontWeight: 600 } }, e.desc || e.cat),
                                React.createElement("div", { style: { fontSize: 11, color: "var(--muted)" } },
                                    e.date,
                                    " ",
                                    e.type === "tanque" && e.tankId ? `· ${((_a = tanks.find(t => t.id === e.tankId)) === null || _a === void 0 ? void 0 : _a.name) || ""}` : "")),
                            React.createElement("span", { style: { fontFamily: "var(--mono)", fontSize: 13, fontWeight: 700 } }, fmtBRL(e.amount)),
                            React.createElement("button", { onClick: () => delCapex(e.id), style: { background: "none", border: "none", color: "var(--red)", cursor: "pointer", fontSize: 14, opacity: .6 } }, "\u2715")));
                    })))),
                capex.length === 0 && React.createElement("div", { style: { textAlign: "center", color: "var(--muted)", padding: 30, fontSize: 13 } }, "Nenhum CAPEX registrado ainda."))),
            tab === "opex" && (React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 14 } },
                React.createElement("div", { className: "card", style: { padding: 16 } },
                    React.createElement("div", { className: "section-hdr" }, "+ Novo Custo Operacional Geral"),
                    React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 10 } },
                        React.createElement("div", { className: "grid2" },
                            React.createElement("div", null,
                                React.createElement("lbl", null, "Data"),
                                React.createElement("input", { type: "date", className: "inp", value: form.date, onChange: e => setForm(p => ({ ...p, date: e.target.value })) })),
                            React.createElement("div", null,
                                React.createElement("lbl", null, "Categoria"),
                                React.createElement("select", { className: "inp", value: ((_b = (_a = form.cat).startsWith) === null || _b === void 0 ? void 0 : _b.call(_a, "__custom__")) ? "__custom__" : form.cat, onChange: e => setForm(p => ({ ...p, cat: e.target.value === "__custom__" ? "__custom__" : e.target.value })) },
                                    React.createElement("option", { value: "" }, "Selecione..."),
                                    OPEX_CATS.map(c => React.createElement("option", { key: c }, c)),
                                    React.createElement("option", { value: "__custom__" }, "\u270F\uFE0F Outra categoria...")),
                                (form.cat === "__custom__" || ((_d = (_c = form.cat).startsWith) === null || _d === void 0 ? void 0 : _d.call(_c, "__custom__"))) && (React.createElement("input", { className: "inp", style: { marginTop: 6 }, placeholder: "Digite a categoria", value: form.cat === "__custom__" ? "" : form.cat.replace("__custom__", ""), onChange: e => setForm(p => ({ ...p, cat: "__custom__" + e.target.value })) })))),
                        React.createElement("div", { className: "grid2" },
                            React.createElement("div", null,
                                React.createElement("lbl", null, "Descri\u00E7\u00E3o"),
                                React.createElement("input", { className: "inp", placeholder: "ex: Conta de energia mar\u00E7o", value: form.desc, onChange: e => setForm(p => ({ ...p, desc: e.target.value })) })),
                            React.createElement("div", null,
                                React.createElement("lbl", null, "Valor (R$)"),
                                React.createElement("input", { className: "inp", type: "number", step: "0.01", value: form.amount, onChange: e => setForm(p => ({ ...p, amount: e.target.value })) }))),
                        React.createElement("button", { className: "btn btn-p", onClick: addOpex }, "+ Adicionar OPEX")),
                    React.createElement("div", { style: { marginTop: 10, padding: "10px 13px", background: "rgba(245,158,11,0.06)", borderRadius: 9, fontSize: 11, color: "var(--muted)", lineHeight: 1.7 } },
                        React.createElement("strong", { style: { color: "var(--yellow)" } }, "OPEX"),
                        " (Operational Expenditure) = ",
                        React.createElement("strong", null, "Custo operacional recorrente"),
                        " \u2014 gastos do dia a dia para manter a opera\u00E7\u00E3o funcionando. Ex: energia el\u00E9trica, sal\u00E1rios, manuten\u00E7\u00E3o, combust\u00EDvel. Renovam-se todo ciclo.")),
                React.createElement("div", { className: "card", style: { padding: 14, background: "rgba(245,158,11,0.06)", borderColor: "rgba(245,158,11,0.2)" } },
                    React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center" } },
                        React.createElement("span", { style: { fontSize: 13, color: "var(--muted)" } }, "Total OPEX geral"),
                        React.createElement("span", { style: { fontFamily: "var(--mono)", fontSize: 20, fontWeight: 800, color: "var(--yellow)" } }, fmtBRL(totalOpexG))),
                    React.createElement("div", { style: { fontSize: 11, color: "var(--muted)", marginTop: 4 } },
                        "+ ",
                        fmtBRL(totalExpTanks),
                        " em despesas por tanque = ",
                        React.createElement("strong", { style: { color: "var(--text)" } }, fmtBRL(totalOpex)),
                        " total OPEX")),
                Object.entries(opexByCat).map(([cat, items]) => (React.createElement("div", { key: cat, className: "card", style: { padding: 14 } },
                    React.createElement("div", { style: { display: "flex", justifyContent: "space-between", marginBottom: 10 } },
                        React.createElement("span", { style: { fontSize: 12, fontWeight: 700, color: "var(--yellow)" } }, cat),
                        React.createElement("span", { style: { fontFamily: "var(--mono)", fontSize: 12, fontWeight: 700 } }, fmtBRL(items.reduce((s, e) => s + e.amount, 0)))),
                    items.map(e => (React.createElement("div", { key: e.id, style: { display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: "1px solid var(--border)" } },
                        React.createElement("div", { style: { flex: 1 } },
                            React.createElement("div", { style: { fontSize: 12, fontWeight: 600 } }, e.desc || e.cat),
                            React.createElement("div", { style: { fontSize: 11, color: "var(--muted)" } }, e.date)),
                        React.createElement("span", { style: { fontFamily: "var(--mono)", fontSize: 13, fontWeight: 700 } }, fmtBRL(e.amount)),
                        React.createElement("button", { onClick: () => delOpex(e.id), style: { background: "none", border: "none", color: "var(--red)", cursor: "pointer", fontSize: 14, opacity: .6 } }, "\u2715"))))))),
                opexG.length === 0 && React.createElement("div", { style: { textAlign: "center", color: "var(--muted)", padding: 30, fontSize: 13 } }, "Nenhum custo geral registrado."))),
            tab === "resumo" && (React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 14 } },
                [
                    { label: "Total CAPEX investido", value: totalCapex, color: "var(--accent)", ico: "🏗️" },
                    { label: "OPEX Geral acumulado", value: totalOpexG, color: "var(--yellow)", ico: "📊" },
                    { label: "Despesas por tanque", value: totalExpTanks, color: "var(--yellow)", ico: "🏊" },
                    { label: "OPEX Total", value: totalOpex, color: "var(--yellow)", ico: "💸", bold: true },
                    { label: "Total investido (CAPEX+OPEX)", value: totalCapex + totalOpex, color: "var(--red)", ico: "📉", bold: true },
                    { label: "Pendente a pagar", value: totalPending, color: "var(--red)", ico: "📅" },
                ].map(k => (React.createElement("div", { key: k.label, className: "card", style: { padding: "14px 16px", display: "flex", alignItems: "center", gap: 14 } },
                    React.createElement("span", { style: { fontSize: 24 } }, k.ico),
                    React.createElement("div", { style: { flex: 1 } },
                        React.createElement("div", { style: { fontSize: 12, color: "var(--muted)" } }, k.label)),
                    React.createElement("span", { style: { fontFamily: "var(--mono)", fontSize: k.bold ? 20 : 16, fontWeight: k.bold ? 800 : 700, color: k.color } }, fmtBRL(k.value))))),
                capex.length > 0 && (React.createElement("div", { className: "card", style: { padding: 14 } },
                    React.createElement("div", { className: "section-hdr" }, "CAPEX por Categoria"),
                    Object.entries(capexByCat).map(([cat, items]) => {
                        const total = items.reduce((s, e) => s + e.amount, 0);
                        const pct = totalCapex > 0 ? (total / totalCapex * 100).toFixed(1) : 0;
                        return (React.createElement("div", { key: cat, style: { marginBottom: 10 } },
                            React.createElement("div", { style: { display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 } },
                                React.createElement("span", null, cat),
                                React.createElement("span", { style: { fontFamily: "var(--mono)" } },
                                    fmtBRL(total),
                                    " ",
                                    React.createElement("span", { style: { color: "var(--muted)" } },
                                        pct,
                                        "%"))),
                            React.createElement("div", { style: { height: 6, borderRadius: 4, background: "rgba(255,255,255,0.06)" } },
                                React.createElement("div", { style: { height: "100%", borderRadius: 4, background: "var(--accent)", width: `${pct}%`, transition: "width .4s" } }))));
                    }))))))));
}
// ═══════════════════════════════════════════════════════════════════════════════
// RELATÓRIOS MODAL
// ═══════════════════════════════════════════════════════════════════════════════
function RelatoriosModal({ onClose }) {
    var _a;
    const { tanks, logs, expenses, capex, opexG, stock, cycles } = useApp();
    const [tab, setTab] = (0, useState)("manejo");
    const [tankSel, setTankSel] = (0, useState)(((_a = tanks[0]) === null || _a === void 0 ? void 0 : _a.id) || "");
    const [exporting, setExporting] = (0, useState)("");
    const tabs = [
        { id: "manejo", label: "🎣 Manejo por Tanque" },
        { id: "operacao", label: "🏭 Operação Completa" },
    ];
    // ── helpers ────────────────────────────────────────────────────────────────
    const selTank = tanks.find(t => t.id === tankSel);
    const sp = SP[(selTank === null || selTank === void 0 ? void 0 : selTank.species) || "matrinxa"];
    const tl = logs[tankSel] || {};
    const tankExp = expenses[tankSel] || [];
    const tankCyc = cycles[tankSel] || [];
    const allDays = Object.entries(tl).sort(([a], [b]) => a > b ? 1 : -1);
    const totalFedKg = allDays.reduce((s, [, d]) => s + (d.feedGivenKg || parseFloat(d.feedGiven || 0) * 25), 0);
    const totalMort = allDays.reduce((s, [, d]) => s + (parseFloat(d.mortality || 0)), 0);
    const totalExpTank = tankExp.reduce((s, e) => s + (e.amount || 0), 0);
    const biomassKg = (((selTank === null || selTank === void 0 ? void 0 : selTank.fishCount) || 0) * ((selTank === null || selTank === void 0 ? void 0 : selTank.avgWeightG) || 0)) / 1000;
    const phase = getPhase((selTank === null || selTank === void 0 ? void 0 : selTank.species) || "matrinxa", (selTank === null || selTank === void 0 ? void 0 : selTank.avgWeightG) || 0);
    // Global
    const totalCapex = capex.reduce((s, e) => s + (e.amount || 0), 0);
    const totalOpexG = opexG.reduce((s, e) => s + (e.amount || 0), 0);
    const totalExpAll = Object.values(expenses).flat().reduce((s, e) => s + (e.amount || 0), 0);
    const totalFedAll = Object.values(logs).flatMap(tl => Object.values(tl)).reduce((s, d) => s + (d.feedGivenKg || parseFloat(d.feedGiven || 0) * 25), 0);
    const totalBiomass = tanks.reduce((s, t) => s + ((t.fishCount || 0) * (t.avgWeightG || 0) / 1000), 0);
    // ── Biomet history for tank ────────────────────────────────────────────────
    const bioHist = (selTank === null || selTank === void 0 ? void 0 : selTank.bioHistory) || [];
    // ── Export CSV (simple, works without library) ─────────────────────────────
    function downloadCSV(rows, filename) {
        const csv = rows.map(r => r.map(c => `"${String(c || "").replace(/"/g, '""')}"`).join(",")).join("\n");
        const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
    // ── Export HTML→PDF via print ──────────────────────────────────────────────
    function printReport(html, title) {
        const w = window.open("", "_blank", "width=900,height=700");
        w.document.write(`<!DOCTYPE html><html lang="pt-BR"><head>
      <meta charset="UTF-8"/>
      <title>${title}</title>
      <style>
        *{box-sizing:border-box;font-family:Arial,sans-serif;margin:0;padding:0;}
        body{padding:28px;color:#111;font-size:13px;}
        h1{font-size:20px;color:#1a3a6a;margin-bottom:6px;}
        h2{font-size:14px;color:#1a3a6a;margin:18px 0 8px;border-bottom:2px solid #1a3a6a;padding-bottom:4px;}
        .meta{font-size:11px;color:#666;margin-bottom:18px;}
        table{width:100%;border-collapse:collapse;margin-bottom:16px;font-size:12px;}
        th{background:#1a3a6a;color:#fff;padding:7px 9px;text-align:left;}
        td{padding:6px 9px;border-bottom:1px solid #ddd;}
        tr:nth-child(even)td{background:#f5f8ff;}
        .kpi-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:18px;}
        .kpi{background:#f0f4ff;border:1px solid #c5d5f0;border-radius:8px;padding:12px;}
        .kpi .val{font-size:18px;font-weight:700;color:#1a3a6a;}
        .kpi .lbl{font-size:10px;color:#666;text-transform:uppercase;margin-top:2px;}
        .badge{display:inline-block;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;background:#e0edff;color:#1a3a6a;}
        @media print{body{padding:14px;}button{display:none!important;}}
      </style>
    </head><body>
    <div style="text-align:right;margin-bottom:16px;">
      <button onclick="window.print()" style="background:#1a3a6a;color:#fff;border:none;padding:8px 20px;border-radius:6px;cursor:pointer;font-size:13px;">🖨️ Imprimir / Salvar PDF</button>
    </div>
    ${html}
    <div style="margin-top:30px;font-size:10px;color:#999;text-align:center;">
      Relatório gerado em ${new Date().toLocaleString("pt-BR")} · AquaCulture
    </div>
    </body></html>`);
        w.document.close();
    }
    // ── Build manejo report HTML ───────────────────────────────────────────────
    function buildManejoHTML(t) {
        const tl2 = logs[t.id] || {};
        const exp2 = expenses[t.id] || [];
        const bio2 = t.bioHistory || [];
        const days = Object.entries(tl2).sort(([a], [b]) => a > b ? 1 : -1);
        const fedKg = days.reduce((s, [, d]) => s + (d.feedGivenKg || parseFloat(d.feedGiven || 0) * 25), 0);
        const mort = days.reduce((s, [, d]) => s + (parseFloat(d.mortality || 0)), 0);
        const expT = exp2.reduce((s, e) => s + (e.amount || 0), 0);
        const bKg = ((t.fishCount || 0) * (t.avgWeightG || 0)) / 1000;
        const ph = getPhase(t.species, t.avgWeightG || 0);
        const sp2 = SP[t.species];
        return `
      <h1>${(sp2 === null || sp2 === void 0 ? void 0 : sp2.icon) || ""} Relatório de Manejo — ${t.name}</h1>
      <div class="meta">Espécie: ${(sp2 === null || sp2 === void 0 ? void 0 : sp2.name) || t.species} · Fase atual: ${ph === null || ph === void 0 ? void 0 : ph.name} · Gerado em: ${new Date().toLocaleDateString("pt-BR")}</div>

      <h2>Situação Atual</h2>
      <div class="kpi-grid">
        <div class="kpi"><div class="val">${(t.fishCount || 0).toLocaleString("pt-BR")}</div><div class="lbl">Peixes em estoque</div></div>
        <div class="kpi"><div class="val">${t.avgWeightG || 0}g</div><div class="lbl">Peso médio</div></div>
        <div class="kpi"><div class="val">${bKg.toFixed(1)} kg</div><div class="lbl">Biomassa estimada</div></div>
        <div class="kpi"><div class="val">${t.areaM2} m²</div><div class="lbl">Área do tanque</div></div>
        <div class="kpi"><div class="val">${sacos(fedKg)} sacos</div><div class="lbl">Total de ração fornecida</div></div>
        <div class="kpi"><div class="val">${mort}</div><div class="lbl">Mortalidade acumulada</div></div>
      </div>

      <h2>Histórico de Biometrias</h2>
      <table><thead><tr><th>Data</th><th>Peso Médio (g)</th><th>Comprimento (cm)</th><th>Qtd Peixes</th><th>Biomassa (kg)</th><th>Fase</th></tr></thead><tbody>
        ${bio2.length ? bio2.map(b => {
            var _a;
            return `<tr>
          <td>${b.date}</td><td>${b.avgWeightG}g</td><td>${b.avgLengthCm || "—"}</td>
          <td>${(b.fishCount || 0).toLocaleString("pt-BR")}</td>
          <td>${((b.fishCount || 0) * b.avgWeightG / 1000).toFixed(1)} kg</td>
          <td>${((_a = getPhase(t.species, b.avgWeightG)) === null || _a === void 0 ? void 0 : _a.name) || "—"}</td>
        </tr>`;
        }).join("") : "<tr><td colspan='6' style='text-align:center;color:#999'>Nenhuma biometria registrada</td></tr>"}
      </tbody></table>

      <h2>Registros Diários (últimos 30 dias)</h2>
      <table><thead><tr><th>Data</th><th>O₂ Manhã</th><th>O₂ Tarde</th><th>O₂ Noite</th><th>Temp (°C)</th><th>Ração (sacos)</th><th>Mortalidade</th><th>Obs</th></tr></thead><tbody>
        ${days.slice(-30).map(([date, d]) => {
            var _a, _b, _c, _d, _e, _f, _g, _h;
            return `<tr>
          <td>${date}</td>
          <td>${((_b = (_a = d.readings) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.o2) || d.o2 || "—"}</td>
          <td>${((_d = (_c = d.readings) === null || _c === void 0 ? void 0 : _c[1]) === null || _d === void 0 ? void 0 : _d.o2) || "—"}</td>
          <td>${((_f = (_e = d.readings) === null || _e === void 0 ? void 0 : _e[2]) === null || _f === void 0 ? void 0 : _f.o2) || "—"}</td>
          <td>${((_h = (_g = d.readings) === null || _g === void 0 ? void 0 : _g[0]) === null || _h === void 0 ? void 0 : _h.temp) || d.temp || "—"}</td>
          <td>${((d.feedGivenKg || parseFloat(d.feedGiven || 0) * 25) / 25).toFixed(3)}</td>
          <td>${d.mortality || 0}</td>
          <td>${d.obs || "—"}</td>
        </tr>`;
        }).join("")}
        ${days.length === 0 ? "<tr><td colspan='8' style='text-align:center;color:#999'>Nenhum registro</td></tr>" : ""}
      </tbody></table>

      <h2>Despesas do Tanque</h2>
      <table><thead><tr><th>Data</th><th>Categoria</th><th>Descrição</th><th>Valor</th></tr></thead><tbody>
        ${exp2.map(e => `<tr><td>${e.date}</td><td>${e.cat}</td><td>${e.desc || "—"}</td><td>${fmtBRL(e.amount)}</td></tr>`).join("")}
        ${exp2.length === 0 ? "<tr><td colspan='4' style='text-align:center;color:#999'>Nenhuma despesa</td></tr>" : ""}
        ${exp2.length > 0 ? `<tr style='font-weight:700'><td colspan='3'>Total</td><td>${fmtBRL(expT)}</td></tr>` : ""}
      </tbody></table>
    `;
    }
    // ── Build operação completa HTML ───────────────────────────────────────────
    function buildOperacaoHTML() {
        return `
      <h1>🏭 Relatório de Operação Completa</h1>
      <div class="meta">Gerado em: ${new Date().toLocaleDateString("pt-BR")} · ${tanks.length} tanque(s) em produção</div>

      <h2>Resumo Geral</h2>
      <div class="kpi-grid">
        <div class="kpi"><div class="val">${tanks.length}</div><div class="lbl">Tanques ativos</div></div>
        <div class="kpi"><div class="val">${tanks.reduce((s, t) => s + (t.fishCount || 0), 0).toLocaleString("pt-BR")}</div><div class="lbl">Total de peixes</div></div>
        <div class="kpi"><div class="val">${totalBiomass.toFixed(1)} kg</div><div class="lbl">Biomassa total</div></div>
        <div class="kpi"><div class="val">${fmtBRL(totalCapex)}</div><div class="lbl">CAPEX total</div></div>
        <div class="kpi"><div class="val">${fmtBRL(totalOpexG + totalExpAll)}</div><div class="lbl">OPEX total</div></div>
        <div class="kpi"><div class="val">${stock.bags}</div><div class="lbl">Sacos em estoque</div></div>
      </div>

      <h2>Tanques em Produção</h2>
      <table><thead><tr><th>Tanque</th><th>Espécie</th><th>Fase</th><th>Peixes</th><th>Peso Médio</th><th>Biomassa</th><th>Ração Consumida</th><th>Despesas</th></tr></thead><tbody>
        ${tanks.map(t => {
            var _a;
            const tl3 = logs[t.id] || {};
            const fKg = Object.values(tl3).reduce((s, d) => s + (d.feedGivenKg || parseFloat(d.feedGiven || 0) * 25), 0);
            const exp3 = expenses[t.id] || [];
            const eT = exp3.reduce((s, e) => s + (e.amount || 0), 0);
            const ph3 = getPhase(t.species, t.avgWeightG || 0);
            return `<tr>
            <td><strong>${t.name}</strong></td>
            <td>${((_a = SP[t.species]) === null || _a === void 0 ? void 0 : _a.name) || t.species}</td>
            <td><span class="badge">${ph3 === null || ph3 === void 0 ? void 0 : ph3.name}</span></td>
            <td>${(t.fishCount || 0).toLocaleString("pt-BR")}</td>
            <td>${t.avgWeightG || 0}g</td>
            <td>${((t.fishCount || 0) * (t.avgWeightG || 0) / 1000).toFixed(1)} kg</td>
            <td>${sacos(fKg)} sacos</td>
            <td>${fmtBRL(eT)}</td>
          </tr>`;
        }).join("")}
      </tbody></table>

      <h2>CAPEX — Investimentos em Infraestrutura</h2>
      <table><thead><tr><th>Data</th><th>Categoria</th><th>Descrição</th><th>Tanque</th><th>Valor</th></tr></thead><tbody>
        ${capex.map(e => {
            var _a;
            return `<tr>
          <td>${e.date}</td><td>${e.cat}</td><td>${e.desc || "—"}</td>
          <td>${e.tankId ? ((_a = tanks.find(t => t.id === e.tankId)) === null || _a === void 0 ? void 0 : _a.name) || "—" : "Geral"}</td>
          <td>${fmtBRL(e.amount)}</td>
        </tr>`;
        }).join("")}
        ${capex.length === 0 ? "<tr><td colspan='5' style='text-align:center;color:#999'>Nenhum registro</td></tr>" : ""}
        ${capex.length > 0 ? `<tr style='font-weight:700'><td colspan='4'>Total CAPEX</td><td>${fmtBRL(totalCapex)}</td></tr>` : ""}
      </tbody></table>

      <h2>OPEX Geral — Custos Operacionais da Fazenda</h2>
      <table><thead><tr><th>Data</th><th>Categoria</th><th>Descrição</th><th>Valor</th></tr></thead><tbody>
        ${opexG.map(e => `<tr><td>${e.date}</td><td>${e.cat}</td><td>${e.desc || "—"}</td><td>${fmtBRL(e.amount)}</td></tr>`).join("")}
        ${opexG.length === 0 ? "<tr><td colspan='4' style='text-align:center;color:#999'>Nenhum registro</td></tr>" : ""}
        ${opexG.length > 0 ? `<tr style='font-weight:700'><td colspan='3'>Total OPEX Geral</td><td>${fmtBRL(totalOpexG)}</td></tr>` : ""}
      </tbody></table>

      <h2>Estoque de Ração</h2>
      <table><thead><tr><th>Data</th><th>Tipo</th><th>Fornecedor</th><th>Sacos</th><th>R$/saco</th><th>Total</th></tr></thead><tbody>
        ${stock.history.slice(-20).map(h => `<tr>
          <td>${h.date}</td>
          <td><span class="badge" style="background:${h.type === "in" ? "#e0f5e9" : "#fff3e0"}">${h.type === "in" ? "Entrada" : "Saída"}</span></td>
          <td>${h.supplier || h.note || "—"}</td>
          <td>${h.bags}</td>
          <td>${h.costPerBag ? fmtBRL(h.costPerBag) : "—"}</td>
          <td>${h.total ? fmtBRL(h.total) : "—"}</td>
        </tr>`).join("")}
      </tbody></table>
    `;
    }
    // ── Export CSV handlers ────────────────────────────────────────────────────
    function exportManejoCSV() {
        var _a;
        if (!selTank)
            return;
        const rows = [
            ["=== RELATÓRIO DE MANEJO ===", "", "", "", "", "", "", ""],
            ["Tanque", selTank.name, "Espécie", (_a = SP[selTank.species]) === null || _a === void 0 ? void 0 : _a.name, "Fase", phase === null || phase === void 0 ? void 0 : phase.name, "", ""],
            ["", "", "", "", "", "", "", ""],
            ["=== REGISTROS DIÁRIOS ===", "", "", "", "", "", "", ""],
            ["Data", "O₂ Manhã (mg/L)", "O₂ Tarde", "O₂ Noite", "Temp (°C)", "Ração (sacos)", "Mortalidade", "Observações"],
            ...allDays.map(([date, d]) => {
                var _a, _b, _c, _d, _e, _f, _g, _h;
                return [
                    date,
                    ((_b = (_a = d.readings) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.o2) || d.o2 || "",
                    ((_d = (_c = d.readings) === null || _c === void 0 ? void 0 : _c[1]) === null || _d === void 0 ? void 0 : _d.o2) || "",
                    ((_f = (_e = d.readings) === null || _e === void 0 ? void 0 : _e[2]) === null || _f === void 0 ? void 0 : _f.o2) || "",
                    ((_h = (_g = d.readings) === null || _g === void 0 ? void 0 : _g[0]) === null || _h === void 0 ? void 0 : _h.temp) || d.temp || "",
                    ((d.feedGivenKg || parseFloat(d.feedGiven || 0) * 25) / 25).toFixed(3),
                    d.mortality || 0,
                    d.obs || ""
                ];
            }),
            ["", "", "", "", "", "", "", ""],
            ["=== BIOMETRIAS ===", "", "", "", "", "", "", ""],
            ["Data", "Peso Médio (g)", "Comprimento (cm)", "Qtd Peixes", "Biomassa (kg)", "Fase", "", ""],
            ...(selTank.bioHistory || []).map(b => {
                var _a;
                return [
                    b.date, b.avgWeightG, b.avgLengthCm || "", b.fishCount || "",
                    ((b.fishCount || 0) * b.avgWeightG / 1000).toFixed(1),
                    ((_a = getPhase(selTank.species, b.avgWeightG)) === null || _a === void 0 ? void 0 : _a.name) || "", "", ""
                ];
            }),
            ["", "", "", "", "", "", "", ""],
            ["=== DESPESAS ===", "", "", "", "", "", "", ""],
            ["Data", "Categoria", "Descrição", "Valor (R$)", "", "", "", ""],
            ...tankExp.map(e => [e.date, e.cat, e.desc || "", e.amount, "", "", "", ""]),
            ["TOTAL", "", "", tankExp.reduce((s, e) => s + e.amount, 0), "", "", "", ""],
        ];
        downloadCSV(rows, `manejo_${selTank.name.replace(/\s/g, "_")}_${today()}.csv`);
        setExporting("");
    }
    function exportOperacaoCSV() {
        const rows = [
            ["=== RELATÓRIO DE OPERAÇÃO COMPLETA ===", "", "", "", "", "", ""],
            ["Gerado em", new Date().toLocaleDateString("pt-BR"), "", "", "", "", ""],
            ["", "", "", "", "", "", ""],
            ["=== TANQUES ===", "", "", "", "", "", ""],
            ["Tanque", "Espécie", "Fase", "Peixes", "Peso Médio (g)", "Biomassa (kg)", "Despesas (R$)"],
            ...tanks.map(t => {
                var _a, _b;
                const eT = (expenses[t.id] || []).reduce((s, e) => s + e.amount, 0);
                return [t.name, (_a = SP[t.species]) === null || _a === void 0 ? void 0 : _a.name, (_b = getPhase(t.species, t.avgWeightG || 0)) === null || _b === void 0 ? void 0 : _b.name, t.fishCount || 0, t.avgWeightG || 0, ((t.fishCount || 0) * (t.avgWeightG || 0) / 1000).toFixed(1), eT];
            }),
            ["", "", "", "", "", "", ""],
            ["=== CAPEX ===", "", "", "", "", "", ""],
            ["Data", "Categoria", "Descrição", "Tanque", "Valor (R$)", "", ""],
            ...capex.map(e => { var _a; return [e.date, e.cat, e.desc || "", e.tankId ? ((_a = tanks.find(t => t.id === e.tankId)) === null || _a === void 0 ? void 0 : _a.name) || "" : "Geral", e.amount, "", ""]; }),
            ["TOTAL CAPEX", "", "", "", totalCapex, "", ""],
            ["", "", "", "", "", "", ""],
            ["=== OPEX GERAL ===", "", "", "", "", "", ""],
            ["Data", "Categoria", "Descrição", "Valor (R$)", "", "", ""],
            ...opexG.map(e => [e.date, e.cat, e.desc || "", e.amount, "", "", ""]),
            ["TOTAL OPEX GERAL", "", "", totalOpexG, "", "", ""],
            ["TOTAL OPEX (com tanques)", "", "", totalOpexG + totalExpAll, "", "", ""],
            ["TOTAL INVESTIDO (CAPEX+OPEX)", "", "", totalCapex + totalOpexG + totalExpAll, "", "", ""],
        ];
        downloadCSV(rows, `operacao_completa_${today()}.csv`);
        setExporting("");
    }
    return (React.createElement("div", { style: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", backdropFilter: "blur(12px)", zIndex: 200, display: "flex", flexDirection: "column" } },
        React.createElement("div", { style: { padding: "14px 18px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 12, background: "var(--dark)" } },
            React.createElement("span", { style: { fontSize: 22 } }, "\uD83D\uDCCB"),
            React.createElement("div", null,
                React.createElement("div", { style: { fontWeight: 800, fontSize: 17 } }, "Relat\u00F3rios"),
                React.createElement("div", { style: { fontSize: 11, color: "var(--muted)" } }, "Manejo por tanque \u00B7 Opera\u00E7\u00E3o completa")),
            React.createElement("div", { style: { flex: 1 } }),
            React.createElement("button", { onClick: onClose, style: { background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: 22 } }, "\u2715")),
        React.createElement("div", { style: { display: "flex", gap: 4, padding: "10px 14px", borderBottom: "1px solid var(--border)", background: "var(--dark)" } }, tabs.map(t => (React.createElement("button", { key: t.id, className: `tab-btn ${tab === t.id ? "active" : ""}`, style: { flex: 1, fontSize: 12, padding: "8px 4px" }, onClick: () => setTab(t.id) }, t.label)))),
        React.createElement("div", { style: { flex: 1, overflowY: "auto", padding: 16 } },
            tab === "manejo" && (React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 14 } },
                React.createElement("div", { className: "card", style: { padding: 16 } },
                    React.createElement("div", { className: "section-hdr" }, "Selecionar Tanque"),
                    tanks.length === 0 ? (React.createElement("p", { style: { color: "var(--muted)", fontSize: 13 } }, "Nenhum tanque cadastrado.")) : (React.createElement("select", { className: "inp", value: tankSel, onChange: e => setTankSel(e.target.value) }, tanks.map(t => { var _a, _b; return React.createElement("option", { key: t.id, value: t.id }, (_a = SP[t.species]) === null || _a === void 0 ? void 0 :
                        _a.icon,
                        " ",
                        t.name,
                        " \u2014 ", (_b = SP[t.species]) === null || _b === void 0 ? void 0 :
                        _b.name); })))),
                selTank && (React.createElement(React.Fragment, null,
                    React.createElement("div", { className: "grid2" }, [
                        { l: "Período monitorado", v: `${allDays.length} dias` },
                        { l: "Biometrias", v: `${bioHist.length} registros` },
                        { l: "Mortalidade total", v: `${totalMort} peixes` },
                        { l: "Ração fornecida", v: sacosLabel(totalFedKg) },
                        { l: "Despesas do tanque", v: fmtBRL(totalExpTank) },
                        { l: "Biomassa atual", v: `${biomassKg.toFixed(1)} kg` },
                    ].map(k => (React.createElement("div", { key: k.l, className: "card", style: { padding: "11px 13px" } },
                        React.createElement("div", { style: { fontSize: 10, color: "var(--muted)", textTransform: "uppercase", fontWeight: 600 } }, k.l),
                        React.createElement("div", { style: { fontFamily: "var(--mono)", fontSize: 14, fontWeight: 700, marginTop: 3 } }, k.v))))),
                    React.createElement("div", { className: "card", style: { padding: 16 } },
                        React.createElement("div", { className: "section-hdr" },
                            "Exportar Relat\u00F3rio \u2014 ",
                            selTank.name),
                        React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 10 } },
                            React.createElement("button", { className: "btn btn-p", style: { padding: 13, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }, onClick: () => { setExporting("pdf-manejo"); printReport(buildManejoHTML(selTank), `Manejo - ${selTank.name}`); setTimeout(() => setExporting(""), 1000); } }, exporting === "pdf-manejo" ? "⏳ Abrindo..." : "🖨️ Abrir PDF / Imprimir"),
                            React.createElement("button", { className: "btn btn-g", style: { padding: 13, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }, onClick: () => { setExporting("csv-manejo"); exportManejoCSV(); } }, exporting === "csv-manejo" ? "⏳ Gerando..." : "📊 Baixar Excel / CSV")),
                        React.createElement("div", { style: { marginTop: 12, fontSize: 11, color: "var(--muted)", lineHeight: 1.6 } },
                            React.createElement("strong", null, "PDF:"),
                            " abre nova aba com relat\u00F3rio formatado \u2192 use \"Imprimir\" do navegador e escolha \"Salvar como PDF\".",
                            React.createElement("br", null),
                            React.createElement("strong", null, "Excel/CSV:"),
                            " baixa arquivo .csv que abre direto no Excel ou Google Sheets.")))))),
            tab === "operacao" && (React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 14 } },
                React.createElement("div", { className: "grid2" }, [
                    { l: "Tanques ativos", v: tanks.length },
                    { l: "Total de peixes", v: tanks.reduce((s, t) => s + (t.fishCount || 0), 0).toLocaleString("pt-BR") },
                    { l: "Biomassa total", v: `${totalBiomass.toFixed(1)} kg` },
                    { l: "CAPEX total", v: fmtBRL(totalCapex) },
                    { l: "OPEX total", v: fmtBRL(totalOpexG + totalExpAll) },
                    { l: "Estoque ração", v: `${stock.bags} sacos` },
                ].map(k => (React.createElement("div", { key: k.l, className: "card", style: { padding: "11px 13px" } },
                    React.createElement("div", { style: { fontSize: 10, color: "var(--muted)", textTransform: "uppercase", fontWeight: 600 } }, k.l),
                    React.createElement("div", { style: { fontFamily: "var(--mono)", fontSize: 14, fontWeight: 700, marginTop: 3 } }, k.v))))),
                React.createElement("div", { className: "card", style: { padding: 16 } },
                    React.createElement("div", { className: "section-hdr" }, "Exportar Relat\u00F3rio Completo"),
                    React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 10 } },
                        React.createElement("button", { className: "btn btn-p", style: { padding: 13, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }, onClick: () => { setExporting("pdf-op"); printReport(buildOperacaoHTML(), "Operação Completa - AquaCulture"); setTimeout(() => setExporting(""), 1000); } }, exporting === "pdf-op" ? "⏳ Abrindo..." : "🖨️ Abrir PDF / Imprimir"),
                        React.createElement("button", { className: "btn btn-g", style: { padding: 13, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }, onClick: () => { setExporting("csv-op"); exportOperacaoCSV(); } }, exporting === "csv-op" ? "⏳ Gerando..." : "📊 Baixar Excel / CSV")),
                    React.createElement("div", { style: { marginTop: 12, fontSize: 11, color: "var(--muted)", lineHeight: 1.6 } }, "O relat\u00F3rio completo inclui: todos os tanques, CAPEX, OPEX geral, hist\u00F3rico de estoque e resumo financeiro.")),
                React.createElement("div", { className: "card", style: { padding: 14 } },
                    React.createElement("div", { className: "section-hdr" }, "Situa\u00E7\u00E3o dos Tanques"),
                    React.createElement("table", null,
                        React.createElement("thead", null,
                            React.createElement("tr", null,
                                React.createElement("th", null, "Tanque"),
                                React.createElement("th", null, "Esp\u00E9cie"),
                                React.createElement("th", null, "Fase"),
                                React.createElement("th", null, "Peixes"),
                                React.createElement("th", null, "Biomassa"))),
                        React.createElement("tbody", null,
                            tanks.map(t => {
                                const ph4 = getPhase(t.species, t.avgWeightG || 0);
                                const sp4 = SP[t.species];
                                return (React.createElement("tr", { key: t.id },
                                    React.createElement("td", null,
                                        React.createElement("strong", null, t.name)),
                                    React.createElement("td", null, sp4 === null || sp4 === void 0 ? void 0 :
                                        sp4.icon,
                                        " ", sp4 === null || sp4 === void 0 ? void 0 :
                                        sp4.name),
                                    React.createElement("td", null,
                                        React.createElement("span", { className: "badge", style: { background: (sp4 === null || sp4 === void 0 ? void 0 : sp4.color) + "22", color: sp4 === null || sp4 === void 0 ? void 0 : sp4.color } }, ph4 === null || ph4 === void 0 ? void 0 : ph4.name)),
                                    React.createElement("td", { style: { fontFamily: "var(--mono)" } }, (t.fishCount || 0).toLocaleString("pt-BR")),
                                    React.createElement("td", { style: { fontFamily: "var(--mono)" } },
                                        ((t.fishCount || 0) * (t.avgWeightG || 0) / 1000).toFixed(1),
                                        " kg")));
                            }),
                            tanks.length === 0 && React.createElement("tr", null,
                                React.createElement("td", { colSpan: 5, style: { textAlign: "center", color: "var(--muted)", padding: 20 } }, "Nenhum tanque"))))))))));
}

    ReactDOM.createRoot(document.getElementById("root")).render(React.createElement(App));
  
