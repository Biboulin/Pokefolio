// PokéFolio — suivi de collection Pokémon (PWA, données locales)
import { SEED } from "./seed.js";

/* ============ stockage (IndexedDB) ============ */
const DB_NAME = "pokefolio", DB_VER = 1;
let dbp = null;
function idb() {
  if (dbp) return dbp;
  dbp = new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, DB_VER);
    r.onupgradeneeded = () => { const d = r.result; d.createObjectStore("kv"); d.createObjectStore("photos"); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  return dbp;
}
async function tx(store, mode, fn) {
  const d = await idb();
  return new Promise((res, rej) => { const t = d.transaction(store, mode), s = t.objectStore(store); const out = fn(s);
    t.oncomplete = () => res(out && "result" in out ? out.result : out); t.onerror = () => rej(t.error); });
}
const kvGet = k => tx("kv", "readonly", s => s.get(k));
const kvSet = (k, v) => tx("kv", "readwrite", s => s.put(v, k));
const phGet = k => tx("photos", "readonly", s => s.get(k));
const phSet = (k, v) => tx("photos", "readwrite", s => s.put(v, k));
const phDel = k => tx("photos", "readwrite", s => s.delete(k));
const phKeys = () => tx("photos", "readonly", s => s.getAllKeys());

/* ============ constantes ============ */
const COND = { MT: "Mint", NM: "Near Mint", EX: "Excellent", GD: "Good", LP: "Light Played", PL: "Played", PO: "Poor" };
const CM_MIN = { MT: 1, NM: 2, EX: 3, GD: 4, LP: 5, PL: 6, PO: 7 }, CM_LANG = { FR: 2, EN: 1, JP: 7 };
const TYPES = {
  electric: { c1: "#fde047", c2: "#f59e0b", ink: "#3b2a00", label: "Électrique" }, dragon: { c1: "#a78bfa", c2: "#d97706", ink: "#1e1240", label: "Dragon" },
  dark: { c1: "#4b5563", c2: "#1f2937", ink: "#f3f4f6", label: "Obscurité" }, water: { c1: "#60a5fa", c2: "#1d4ed8", ink: "#06183d", label: "Eau" },
  fire: { c1: "#fb923c", c2: "#dc2626", ink: "#3b0a00", label: "Feu" }, grass: { c1: "#86efac", c2: "#16a34a", ink: "#052e16", label: "Plante" },
  psychic: { c1: "#f0abfc", c2: "#a21caf", ink: "#3b0040", label: "Psy" }, fighting: { c1: "#fdba74", c2: "#9a3412", ink: "#2a0e00", label: "Combat" },
  metal: { c1: "#e5e7eb", c2: "#6b7280", ink: "#111827", label: "Métal" }, colorless: { c1: "#f5f5f4", c2: "#a8a29e", ink: "#292524", label: "Incolore" },
};
const SERIES = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#8b5cf6", "#64748b"];
const $ = id => document.getElementById(id);

/* ============ état ============ */
let S, view = "home", sortBy = "pl", filter = "all", query = "";
const photoURL = {}; // id -> objectURL

async function load() {
  let st = null;
  try { st = await kvGet("state"); } catch (e) { console.warn(e); }
  S = st || structuredClone(SEED);
  S.cards.forEach((c, i) => { if (c.slot == null) c.slot = i; });
  try { for (const k of await phKeys()) { const b = await phGet(k); if (b) photoURL[k] = URL.createObjectURL(b); } } catch (e) {}
  if (!S.history?.length) stampHistory();
  if (!st) await persist(false);
  if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
}
async function persist(showToast = true, msg = "Enregistré") {
  S.savedAt = Date.now(); stampHistory();
  try { await kvSet("state", structuredClone(S)); if (showToast) toast(msg); }
  catch (e) { toast("Échec de l'enregistrement : " + (e?.message || e)); }
  render();
}

/* ============ calculs ============ */
const owned = () => S.cards.filter(c => !c.sold);
function breakdown(c) {
  const hasFr = c.lang === "FR" && c.refFr != null && c.refFr !== "";
  const base = hasFr ? +c.refFr : +c.refAll, lk = hasFr ? 1 : (S.langCoef[c.lang] ?? 1), ck = S.coef[c.cond] ?? 1;
  const calc = +(base * lk * ck).toFixed(2), man = c.manual != null && c.manual !== "";
  return { hasFr, base, lk, ck, calc, man, value: man ? +c.manual : calc };
}
const valOf = c => c.sold ? +c.sold.price : breakdown(c).value;
function totals() {
  const o = owned(), value = o.reduce((a, c) => a + valOf(c), 0), paidOwned = o.reduce((a, c) => a + +c.paid, 0);
  const sold = S.cards.filter(c => c.sold), revenue = sold.reduce((a, c) => a + +c.sold.price, 0), realized = sold.reduce((a, c) => a + (+c.sold.price - c.paid), 0);
  const paidAll = S.cards.reduce((a, c) => a + +c.paid, 0);
  return { value, paidOwned, paidAll, revenue, realized };
}
const today = () => new Date().toISOString().slice(0, 10);
function stampHistory() {
  const t = totals(), d = today(); S.history = S.history || [];
  const pt = { d, v: +t.value.toFixed(2), p: +t.paidOwned.toFixed(2) }, last = S.history[S.history.length - 1];
  if (last && last.d === d) S.history[S.history.length - 1] = pt; else S.history.push(pt);
}

/* ============ format ============ */
const f2 = n => Math.abs(n).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const eur = n => (n < 0 ? "−" : "") + f2(n) + " €";
const eur0 = n => (n < 0 ? "−" : "") + Math.round(Math.abs(n)).toLocaleString("fr-FR") + " €";
const sgn = n => (n > 0 ? "+" : n < 0 ? "−" : "") + f2(n) + " €";
const sgn0 = n => (n > 0 ? "+" : n < 0 ? "−" : "") + Math.round(Math.abs(n)) + " €";
const pct = n => (n > 0 ? "+" : n < 0 ? "−" : "") + Math.abs(n * 100).toFixed(1).replace(".", ",") + " %";
const cf = n => (+n).toFixed(2).replace(".", ",");
const esc = s => String(s ?? "").replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
const fdate = d => new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
const fdateY = d => new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
const base = n => n.replace(/\s*\(.*\)/, "");
const short = c => { const b = base(c.name), n = b.replace(/-GX$/, "").replace(" et ", " & ");
  return S.cards.filter(x => base(x.name) === b).length > 1 ? n + " " + (c.num || "").split("/")[0] : n; };
const num = v => v === "" || v == null ? null : +String(v).replace(",", ".");

/* ============ images ============ */
function candidates(c) {
  const list = [];
  if (photoURL[c.id]) list.push(photoURL[c.id]);
  if (c.imgUrl) list.push(c.imgUrl);
  if (c.tcgdex) { list.push(`https://assets.tcgdex.net/fr/${c.tcgdex}/high.webp`); list.push(`https://assets.tcgdex.net/en/${c.tcgdex}/high.webp`); }
  return list;
}
function artSVG(c) {
  const t = TYPES[c.type] || TYPES.colorless, n = esc((c.num || "").replace("MEP ", ""));
  const words = esc(base(c.name)).split(" "); let lines = [], cur = "";
  words.forEach(w => { if ((cur + " " + w).trim().length > 14) { lines.push(cur.trim()); cur = w; } else cur += " " + w; }); lines.push(cur.trim());
  const tx = lines.slice(0, 3).map((l, i) => `<text x="63" y="${110 + i * 15}" text-anchor="middle" font-family="Space Grotesk,sans-serif" font-weight="700" font-size="13" fill="${t.ink}">${l}</text>`).join("");
  const g = "g" + c.id + Math.random().toString(36).slice(2, 6);
  return `<svg viewBox="0 0 126 176" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="${g}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${t.c1}"/><stop offset="1" stop-color="${t.c2}"/></linearGradient><radialGradient id="r${g}" cx=".3" cy=".25" r=".8"><stop offset="0" stop-color="#fff" stop-opacity=".5"/><stop offset=".6" stop-color="#fff" stop-opacity="0"/></radialGradient></defs><rect width="126" height="176" fill="#f4d35e"/><rect x="5" y="5" width="116" height="166" rx="7" fill="url(#${g})"/><rect x="5" y="5" width="116" height="166" rx="7" fill="url(#r${g})"/><circle cx="63" cy="60" r="30" fill="none" stroke="${t.ink}" stroke-opacity=".18" stroke-width="10"/><text x="63" y="61" text-anchor="middle" dominant-baseline="middle" font-family="Space Grotesk,sans-serif" font-weight="700" font-size="${n.length > 4 ? 18 : 26}" fill="${t.ink}" fill-opacity=".85">${n.split("/")[0]}</text>${tx}</svg>`;
}
function imgHTML(c) {
  const cands = candidates(c);
  if (!cands.length) return artSVG(c);
  return `<img src="${esc(cands[0])}" alt="${esc(c.name)}" loading="lazy" decoding="async" data-card="${c.id}" data-i="0" referrerpolicy="no-referrer">`;
}
document.addEventListener("error", e => {
  const im = e.target; if (im.tagName !== "IMG" || !im.dataset.card) return;
  const c = S.cards.find(x => x.id === im.dataset.card); if (!c) return;
  const cands = candidates(c), i = +im.dataset.i + 1;
  if (i < cands.length) { im.dataset.i = i; im.src = cands[i]; } else im.outerHTML = artSVG(c);
}, true);
function artHTML(c, tile) {
  const b = breakdown(c);
  return `<div class="art">${imgHTML(c)}<div class="shine"></div>${tile ? `<span class="badge">${c.cond}</span><span class="flag">${esc(c.lang)}</span>${c.sold ? '<span class="tag sold">Vendue</span>' : b.man ? '<span class="tag">✎ manuel</span>' : ""}` : ""}</div>`;
}

/* ============ tooltip ============ */
const tip = $("tip");
function showTip(el, x, y) { tip.innerHTML = el.getAttribute("data-tip"); tip.classList.add("on");
  const r = tip.getBoundingClientRect(); let L = x + 12, T = y - r.height - 12; if (L + r.width > innerWidth - 8) L = x - r.width - 12; if (L < 8) L = 8; if (T < 8) T = y + 16; tip.style.left = L + "px"; tip.style.top = T + "px"; }
document.addEventListener("pointermove", e => { const h = e.target.closest?.("[data-tip]"); if (h && e.pointerType === "mouse") showTip(h, e.clientX, e.clientY); else if (e.pointerType === "mouse") tip.classList.remove("on"); });
addEventListener("scroll", () => tip.classList.remove("on"), { passive: true });

/* ============ graphiques ============ */
const W = 360;
const niceMax = v => { const p = Math.pow(10, Math.floor(Math.log10(v || 1))), m = v / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p; };
function chartDumbbell() {
  const rows = owned().map(c => ({ c, v: valOf(c), p: +c.paid })).sort((a, b) => Math.max(b.v, b.p) - Math.max(a.v, a.p));
  if (!rows.length) { $("chDumb").innerHTML = `<div class="mut">Aucune carte en stock.</div>`; return; }
  const L = 130, R = W - 14, top = 6, rh = 38, H = top + rows.length * rh + 22, max = niceMax(Math.max(...rows.map(r => Math.max(r.v, r.p))) * 1.05);
  const x = v => L + (R - L) * v / max; let g = "";
  [0, .25, .5, .75, 1].forEach(f => { const xv = x(max * f); g += `<line x1="${xv}" x2="${xv}" y1="${top}" y2="${H - 20}" stroke="#262a35"/><text x="${xv}" y="${H - 6}" text-anchor="middle" font-size="10" fill="#8a90a0">${Math.round(max * f)} €</text>`; });
  rows.forEach((r, i) => { const cy = top + i * rh + rh / 2, up = r.v >= r.p, col = up ? "#34d399" : "#fb7185", d = r.v - r.p;
    g += `<text x="0" y="${cy - 3}" font-size="11.5" fill="#eef0f5" font-weight="600">${esc(short(r.c).slice(0, 22))}</text><text x="0" y="${cy + 11}" font-size="10.5" fill="${col}" font-family="Space Grotesk">${sgn0(d)} · ${pct(r.p ? d / r.p : 0)}</text>`;
    g += `<line x1="${x(r.p)}" x2="${x(r.v)}" y1="${cy}" y2="${cy}" stroke="${col}" stroke-width="2" stroke-linecap="round"/>`;
    g += `<circle cx="${x(r.p)}" cy="${cy}" r="5" fill="#14161d" stroke="#8a90a0" stroke-width="2"/><circle cx="${x(r.v)}" cy="${cy}" r="5.5" fill="${col}" stroke="#14161d" stroke-width="2"/>`;
    g += `<rect class="hit" x="0" y="${cy - rh / 2}" width="${W}" height="${rh}" fill="transparent" data-open="${r.c.id}" data-tip="<b>${esc(r.c.name)}</b><br>Payé : ${eur(r.p)}<br>Valeur : <b>${eur(r.v)}</b><br><span style='color:${col}'>${sgn(d)}</span>"/>`; });
  $("chDumb").innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="100%">${g}</svg>`;
}
function chartDonut() {
  const items = owned().map(c => ({ c, v: valOf(c) })).filter(i => i.v > 0), tot = items.reduce((a, i) => a + i.v, 0) || 1;
  const cx = 75, cy = 75, r = 56, sw = 22, C = 2 * Math.PI * r; let off = 0, g = "";
  items.forEach(it => { const len = C * it.v / tot, gap = Math.min(2, len / 2), col = SERIES[it.c.slot % SERIES.length];
    g += `<circle class="hit" cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${col}" stroke-width="${sw}" stroke-dasharray="${Math.max(0, len - gap)} ${C}" stroke-dashoffset="${-off}" transform="rotate(-90 ${cx} ${cy})" data-open="${it.c.id}" data-tip="<b>${esc(it.c.name)}</b><br>${eur(it.v)} · ${Math.round(it.v / tot * 100)} %"/>`; off += len; });
  g += `<text x="${cx}" y="${cy - 2}" text-anchor="middle" font-family="Space Grotesk" font-weight="700" font-size="18" fill="#eef0f5">${eur0(tot)}</text><text x="${cx}" y="${cy + 15}" text-anchor="middle" font-size="10.5" fill="#8a90a0">en stock</text>`;
  $("chDonut").innerHTML = `<svg viewBox="0 0 150 150" width="150" height="150">${g}</svg>`;
  $("lgDonut").innerHTML = items.sort((a, b) => b.v - a.v).map(it => `<div><i style="background:${SERIES[it.c.slot % SERIES.length]}"></i><span>${esc(short(it.c))}</span><b>${Math.round(it.v / tot * 100)} %</b></div>`).join("");
}
function chartHistory() {
  const h = (S.history || []).slice(-90);
  $("histCap").textContent = h.length ? `depuis le ${fdateY(h[0].d)}` : "";
  if (h.length < 2) { const t = totals();
    $("chHist").innerHTML = `<div style="display:flex;align-items:center;gap:12px;padding:6px 2px"><div class="num" style="font:700 22px var(--num);white-space:nowrap">${eur(t.value)}</div><div class="mut" style="font-size:12.5px">Un point est enregistré chaque jour où tu modifies un prix. La courbe apparaîtra au deuxième jour.</div></div>`; return; }
  const L = 40, R = W - 10, T = 10, B = 150, H = 172, vals = h.flatMap(p => [p.v, p.p]); const lo = Math.max(0, Math.min(...vals) * 0.9), hi = niceMax(Math.max(...vals) * 1.05);
  const x = i => L + (R - L) * i / (h.length - 1), y = v => B - (B - T) * (v - lo) / (hi - lo || 1); let g = "";
  for (let k = 0; k <= 3; k++) { const v = lo + (hi - lo) * k / 3, yy = y(v); g += `<line x1="${L}" x2="${R}" y1="${yy}" y2="${yy}" stroke="#262a35"/><text x="${L - 6}" y="${yy + 3}" text-anchor="end" font-size="10" fill="#8a90a0">${Math.round(v)}</text>`; }
  g += `<polyline points="${h.map((p, i) => x(i) + "," + y(p.p)).join(" ")}" fill="none" stroke="#8a90a0" stroke-width="2" stroke-dasharray="4 4"/>`;
  g += `<path d="M${x(0)},${B} ${h.map((p, i) => "L" + x(i) + "," + y(p.v)).join(" ")} L${x(h.length - 1)},${B}Z" fill="#3987e5" fill-opacity=".12"/>`;
  g += `<polyline points="${h.map((p, i) => x(i) + "," + y(p.v)).join(" ")}" fill="none" stroke="#3987e5" stroke-width="2" stroke-linejoin="round"/>`;
  h.forEach((p, i) => { g += `<circle cx="${x(i)}" cy="${y(p.v)}" r="${h.length > 30 ? 2.5 : 4}" fill="#3987e5" stroke="#14161d" stroke-width="1.5"/><rect class="hit" x="${x(i) - 12}" y="${T}" width="24" height="${B - T}" fill="transparent" data-tip="<b>${fdate(p.d)}</b><br>Valeur : <b>${eur(p.v)}</b><br>Payé : ${eur(p.p)}"/>`; });
  g += `<text x="${x(0)}" y="${H - 4}" font-size="10" fill="#8a90a0">${fdate(h[0].d)}</text><text x="${x(h.length - 1)}" y="${H - 4}" text-anchor="end" font-size="10" fill="#8a90a0">${fdate(h[h.length - 1].d)}</text>`;
  $("chHist").innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="100%">${g}</svg>`;
}

/* ============ rendu ============ */
const TITLES = { home: "Portefeuille", cards: "Mes cartes", settings: "Réglages" };
function render() {
  $("title").textContent = TITLES[view];
  const t = totals(), inv = +S.invested || t.paidAll, global = t.value + t.revenue - inv;
  $("subtitle").textContent = `${owned().length} carte${owned().length > 1 ? "s" : ""} · prix au ${fdateY(S.snapshot)}`;
  if (view === "home") {
    $("hValue").textContent = eur(t.value);
    $("hDelta").innerHTML = `<span class="${global >= 0 ? "up" : "down"}">${sgn(global)} (${pct(inv ? global / inv : 0)})</span> <span class="mut" style="font-family:Inter;font-weight:400;font-size:12.5px">par rapport à l'investi</span>`;
    $("kInv").textContent = eur0(inv); $("kPaid").textContent = eur(t.paidOwned);
    $("kReal").innerHTML = t.revenue ? `<span class="${t.realized >= 0 ? "up" : "down"}">${sgn(t.realized)}</span>` : `<span class="mut">—</span>`;
    const gap = inv - t.paidAll, gn = $("gapNote");
    if (Math.abs(gap) > .5) { gn.hidden = false; gn.textContent = `Tes cartes ont coûté ${eur(t.paidAll)} au total, mais l'investi est réglé sur ${eur0(inv)} : ${eur(gap)} ne sont rattachés à aucune carte (frais de port ?). Touche « Investi » pour corriger.`; } else gn.hidden = true;
    const rows = owned().map(c => ({ c, d: valOf(c) - c.paid })).sort((a, b) => b.d - a.d);
    $("movers").innerHTML = rows.length ? [["Meilleure carte", rows[0]], ["Moins bonne", rows[rows.length - 1]]].map(([lbl, r]) =>
      `<button class="mover" data-open="${r.c.id}"><div class="mini">${imgHTML(r.c)}</div><div><small>${lbl}</small><b>${esc(short(r.c))}</b><small class="${r.d >= 0 ? "up" : "down"} num" style="font-weight:600">${sgn(r.d)}</small></div></button>`).join("") : "";
    chartDumbbell(); chartDonut(); chartHistory();
  }
  if (view === "cards") renderGrid();
  if (view === "settings") renderSettings();
}
function renderGrid() {
  let rows = S.cards.map(c => { const v = valOf(c); return { c, v, pl: v - c.paid, pc: c.paid ? (v - c.paid) / c.paid : 0 }; });
  const q = query.trim().toLowerCase();
  if (q) rows = rows.filter(r => (r.c.name + " " + r.c.set + " " + r.c.num).toLowerCase().includes(q));
  if (filter === "owned") rows = rows.filter(r => !r.c.sold);
  if (filter === "sold") rows = rows.filter(r => r.c.sold);
  if (filter === "nophoto") rows = rows.filter(r => !photoURL[r.c.id] && !r.c.imgUrl);
  rows.sort((a, b) => sortBy === "val" ? b.v - a.v : sortBy === "pct" ? b.pc - a.pc : sortBy === "name" ? a.c.name.localeCompare(b.c.name) : b.pl - a.pl);
  $("grid").innerHTML = rows.map(({ c, v, pl, pc }) => `<button class="tile ${c.sold ? "sold" : ""}" data-open="${c.id}">${artHTML(c, true)}<div class="nm">${esc(c.name)}</div><div class="meta">${esc(c.set)} · ${esc(c.num)}</div><div class="row"><span class="val">${eur(v)}</span><span class="pl ${pl >= 0 ? "up" : "down"}">${pct(pc)}</span></div><div class="paid">${c.sold ? "vendue · " : ""}payé ${eur(+c.paid)}</div></button>`).join("")
    || `<div class="empty">Aucune carte ne correspond.<br><br><button class="btn pri" id="emptyAdd">＋ Ajouter une carte</button></div>`;
  $("emptyAdd")?.addEventListener("click", () => edit(null));
}

/* ============ navigation ============ */
function go(v) {
  view = v; document.querySelectorAll(".view").forEach(s => s.classList.toggle("on", s.id === "v-" + v));
  document.querySelectorAll(".tab").forEach(b => b.classList.toggle("on", b.dataset.v === v));
  scrollTo(0, 0); render();
}
document.querySelectorAll(".tab").forEach(b => b.addEventListener("click", () => go(b.dataset.v)));

/* ============ sheet ============ */
let sheetStack = [];
function open(html, after) { $("sheetBody").innerHTML = html; $("scrim").classList.add("on"); $("sheet").classList.add("on"); $("sheet").scrollTop = 0; tip.classList.remove("on"); after && after(); }
function close() { $("scrim").classList.remove("on"); $("sheet").classList.remove("on"); }
$("scrim").addEventListener("click", close);
// glisser vers le bas pour fermer
(() => { const sh = $("sheet"); let y0 = null, dy = 0;
  sh.addEventListener("touchstart", e => { if (sh.scrollTop <= 0) { y0 = e.touches[0].clientY; dy = 0; } }, { passive: true });
  sh.addEventListener("touchmove", e => { if (y0 == null) return; dy = e.touches[0].clientY - y0; if (dy > 0) { sh.style.transition = "none"; sh.style.transform = `translateY(${dy}px)`; } }, { passive: true });
  sh.addEventListener("touchend", () => { if (y0 == null) return; sh.style.transition = ""; sh.style.transform = ""; if (dy > 110) close(); y0 = null; });
})();
function toast(t) { const e = $("toast"); e.textContent = t; e.classList.add("on"); clearTimeout(e._t); e._t = setTimeout(() => e.classList.remove("on"), 2300); }

/* ============ photos ============ */
function compress(file) {
  return new Promise((res, rej) => { const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => { const s = Math.min(1, 900 / Math.max(img.width, img.height)), cv = document.createElement("canvas");
      cv.width = Math.round(img.width * s); cv.height = Math.round(img.height * s); cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
      URL.revokeObjectURL(url); cv.toBlob(b => b ? res(b) : rej(new Error("encodage")), "image/jpeg", .85); };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error("format non lu")); }; img.src = url; });
}
function pickPhoto(c, done) {
  const inp = $("filePick"); inp.value = "";
  inp.onchange = async () => { const f = inp.files?.[0]; if (!f) return;
    try { const blob = await compress(f); await phSet(c.id, blob);
      if (photoURL[c.id]) URL.revokeObjectURL(photoURL[c.id]); photoURL[c.id] = URL.createObjectURL(blob);
      await persist(true, "Photo enregistrée"); done && done(); }
    catch (e) { toast("Photo non enregistrée : " + (e?.message || e)); } };
  inp.click();
}
async function removePhoto(c) { try { await phDel(c.id); } catch (e) {} if (photoURL[c.id]) URL.revokeObjectURL(photoURL[c.id]); delete photoURL[c.id]; }

/* ============ fiche carte ============ */
function cmLink(c) { if (c.cmUrl) return `${c.cmUrl}?minCondition=${CM_MIN[c.cond] || 2}&language=${CM_LANG[c.lang] || 2}`;
  return "https://www.cardmarket.com/fr/Pokemon/Products/Search?searchString=" + encodeURIComponent(c.q || base(c.name)); }
function detail(id) {
  const c = S.cards.find(x => x.id === id); if (!c) return;
  const b = breakdown(c), v = valOf(c), pl = v - c.paid, conf = { ok: ["ok", "prix FR observé"], mid: ["mid", "estimé"], low: ["low", "très volatil"] }[c.conf || "mid"];
  const hasP = !!photoURL[c.id];
  open(`<div class="dimg">${artHTML(c, false)}</div>
    <div class="dname"><h3>${esc(c.name)}</h3><div class="mut">${esc(c.set)} · ${esc(c.num)}</div>
      <div class="chips"><span class="chip">${c.cond} · ${COND[c.cond]}</span><span class="chip">${esc(c.lang)}</span>${c.sold ? `<span class="chip">Vendue le ${fdateY(c.sold.date)}</span>` : b.man ? '<span class="chip man">valeur manuelle</span>' : `<span class="chip ${conf[0]}">${conf[1]}</span>`}</div></div>
    <div class="dval"><div><small>${c.sold ? "Prix de vente" : "Valeur estimée"}</small><b>${eur(v)}</b></div><div><small>${c.sold ? "Plus-value réalisée" : "Plus-value latente"}</small><b class="${pl >= 0 ? "up" : "down"}">${sgn(pl)}</b><small class="${pl >= 0 ? "up" : "down"}">${pct(c.paid ? pl / c.paid : 0)} · payé ${eur(+c.paid)}</small></div></div>

    <div class="box"><div class="t">Image</div><div class="hint">Prends ta carte en photo ou colle le lien d'une image. Sans photo, l'app essaie l'image officielle de TCGdex, puis affiche une illustration par défaut.</div>
      <div class="imgsrc"><button class="btn sm" id="dPhoto">📷 ${hasP ? "Changer la photo" : "Photo / galerie"}</button><button class="btn sm" id="dUrlBtn">🔗 Coller un lien</button></div>
      <div class="r1" id="dUrlRow" ${c.imgUrl ? "" : "hidden"}><input id="dUrl" type="url" inputmode="url" placeholder="https://…/carte.jpg" value="${esc(c.imgUrl || "")}"><button class="btn pri sm" id="dUrlOk">OK</button></div>
      ${hasP || c.imgUrl ? `<div class="actions" style="margin-top:8px">${hasP ? '<button class="btn sm dan" id="dPhotoDel">Retirer la photo</button>' : ""}${c.imgUrl ? '<button class="btn sm dan" id="dUrlDel">Retirer le lien</button>' : ""}</div>` : ""}</div>

    ${c.sold ? "" : `
    <div class="box y"><div class="t">Valeur finale</div><div class="hint">Le prix auquel tu penses vraiment vendre la carte. Il remplace le calcul.</div>
      <div class="r1"><input id="dMan" type="text" inputmode="decimal" placeholder="${cf(b.calc)} (calculé)" value="${b.man ? String(c.manual).replace(".", ",") : ""}"><button class="btn pri sm" id="dManOk">Appliquer</button></div>
      ${b.man ? `<div class="actions" style="margin-top:8px"><button class="btn sm" id="dManReset">Revenir au calcul (${eur(b.calc)})</button></div>` : ""}</div>

    <div class="box b"><div class="t">Prix de référence Near Mint</div><div class="hint">Le point de départ du calcul : un prix observé pour la version FR, ou un prix toutes langues (dans ce cas, la décote FR s'applique).</div>
      <div class="r2" style="margin-top:8px"><select id="dRefSrc"><option value="fr" ${b.hasFr ? "selected" : ""}>Prix FR</option><option value="all" ${b.hasFr ? "" : "selected"}>Toutes langues</option></select><input id="dRef" type="text" inputmode="decimal" value="${String(b.base).replace(".", ",")}"></div>
      <div class="prev" id="dRefPrev"></div><button class="btn pri sm full" id="dRefOk" style="margin-top:8px">Appliquer le prix de référence</button></div>

    <details class="box calc"><summary>Détail du calcul</summary>
      <div class="l ${b.man ? "strike" : ""}"><span>${b.hasFr ? "Réf. NM version FR" : "Réf. NM toutes langues"}</span><b>${eur(b.base)}</b></div>
      <div class="l ${b.man ? "strike" : ""}"><span>× coef langue ${esc(c.lang)}<small>${b.hasFr ? "prix FR connu, pas de décote" : "aucun prix FR, décote appliquée"}</small></span><b>${cf(b.lk)}</b></div>
      <div class="l ${b.man ? "strike" : ""}"><span>× coef état ${c.cond}<small>${COND[c.cond]}</small></span><b>${cf(b.ck)}</b></div>
      <div class="l ${b.man ? "strike" : "tot"}"><span>= Valeur calculée</span><b>${eur(b.calc)}</b></div>
      ${b.man ? `<div class="l tot"><span>Valeur finale saisie</span><b>${eur(b.value)}</b></div>` : ""}
      <div class="l"><span>− Prix payé</span><b>${eur(+c.paid)}</b></div>
      <div class="l tot"><span>= Plus-value</span><b class="${pl >= 0 ? "up" : "down"}">${sgn(pl)}</b></div>
    </details>`}

    <div class="src"><b style="color:var(--txt)">Sources et notes</b><br>${esc(c.why || "—")}${c.src?.length ? `<ul>${c.src.map(s => `<li><a href="${esc(s[1])}" target="_blank" rel="noopener">${esc(s[0])} ↗</a></li>`).join("")}</ul>` : ""}</div>
    <div class="actions"><a class="btn sm" href="${cmLink(c)}" target="_blank" rel="noopener">Voir sur Cardmarket ↗</a>${c.sold ? '<button class="btn sm" id="dUnsell">Annuler la vente</button>' : '<button class="btn sm" id="dSell">💶 Marquer vendue</button>'}<button class="btn sm" id="dEdit">✎ Modifier</button></div>
    <button class="btn full" id="dClose" style="margin-top:12px">Fermer</button>`, () => {
    $("dClose").onclick = close; $("dEdit").onclick = () => edit(c.id);
    $("dPhoto").onclick = () => pickPhoto(c, () => detail(c.id));
    $("dUrlBtn").onclick = () => { $("dUrlRow").hidden = false; $("dUrl").focus(); };
    $("dUrlOk").onclick = async () => { const u = $("dUrl").value.trim(); if (u && !/^https?:\/\//i.test(u)) { toast("Le lien doit commencer par http"); return; } c.imgUrl = u || null; await persist(true, u ? "Lien d'image enregistré" : "Lien retiré"); detail(c.id); };
    $("dPhotoDel") && ($("dPhotoDel").onclick = async () => { await removePhoto(c); await persist(true, "Photo retirée"); detail(c.id); });
    $("dUrlDel") && ($("dUrlDel").onclick = async () => { c.imgUrl = null; await persist(true, "Lien retiré"); detail(c.id); });
    $("dSell") && ($("dSell").onclick = () => sell(c));
    $("dUnsell") && ($("dUnsell").onclick = async () => { c.sold = null; await persist(true, "Vente annulée"); detail(c.id); });
    if (c.sold) return;
    $("dManOk").onclick = async () => { const v = num($("dMan").value); if (v == null || isNaN(v)) { toast("Saisis un montant"); return; } c.manual = v; await persist(true, "Valeur finale appliquée"); detail(c.id); };
    $("dManReset") && ($("dManReset").onclick = async () => { c.manual = null; await persist(true, "Retour au calcul"); detail(c.id); });
    const refPrev = () => { const v = num($("dRef").value), src = $("dRefSrc").value; if (v == null || isNaN(v)) { $("dRefPrev").textContent = ""; return; }
      const nb = breakdown({ ...c, refFr: src === "fr" ? v : null, refAll: src === "all" ? v : c.refAll, manual: null });
      $("dRefPrev").innerHTML = `→ ${cf(nb.base)} × ${cf(nb.lk)} × ${cf(nb.ck)} = <span style="color:var(--txt)">${eur(nb.calc)}</span>` + (b.man ? ` <span class="mut" style="font-family:Inter;font-weight:400">(ta valeur finale reste prioritaire)</span>` : ""); };
    $("dRef").addEventListener("input", refPrev); $("dRefSrc").addEventListener("change", refPrev); refPrev();
    $("dRefOk").onclick = async () => { const v = num($("dRef").value); if (v == null || isNaN(v)) { toast("Saisis un prix"); return; }
      const fr = $("dRefSrc").value === "fr"; if (fr) { c.refFr = v; c.conf = "ok"; } else { c.refAll = v; c.refFr = null; c.conf = "mid"; }
      c.why = (c.why || "") + ` Réf. NM modifiée le ${new Date().toLocaleDateString("fr-FR")} (${eur(v)}, ${fr ? "prix FR" : "toutes langues"}).`;
      await persist(true, "Prix de référence mis à jour"); detail(c.id); };
  });
}
function sell(c) {
  open(`<h3 class="sh-title">Marquer comme vendue</h3><div class="mut" style="font-size:13px">${esc(c.name)} · payé ${eur(+c.paid)}</div>
    <div class="r2"><div><label>Prix de vente net (€)</label><input id="sPrice" type="text" inputmode="decimal" value="${String(valOf(c)).replace(".", ",")}"></div><div><label>Date</label><input id="sDate" type="date" value="${today()}"></div></div>
    <div class="hint">Indique le montant réellement encaissé, après la commission et les frais de port.</div>
    <div class="actions"><button class="btn pri" id="sOk">Valider la vente</button><button class="btn" id="sCancel">Annuler</button></div>`, () => {
    $("sCancel").onclick = () => detail(c.id);
    $("sOk").onclick = async () => { const p = num($("sPrice").value); if (p == null || isNaN(p)) { toast("Prix invalide"); return; } c.sold = { price: p, date: $("sDate").value || today() }; await persist(true, "Vente enregistrée"); detail(c.id); };
  });
}

/* ============ ajout / modification ============ */
function edit(id) {
  const isNew = !id;
  const c = isNew ? { id: "c" + Date.now(), slot: S.cards.reduce((m, x) => Math.max(m, x.slot ?? 0), -1) + 1, name: "", set: "", num: "", type: "colorless", lang: "FR", cond: "NM", paid: 0, refAll: 0, refFr: null, manual: null, conf: "mid", why: "Ajoutée à la main.", q: "", src: [], imgUrl: null, tcgdex: null }
    : S.cards.find(x => x.id === id);
  const o = (obj, sel, fmt) => Object.keys(obj).map(k => `<option value="${k}" ${k === sel ? "selected" : ""}>${fmt(k)}</option>`).join("");
  const fv = v => v == null ? "" : String(v).replace(".", ",");
  open(`<h3 class="sh-title">${isNew ? "Nouvelle carte" : "Modifier la carte"}</h3>
    <label>Nom</label><input id="fName" value="${esc(c.name)}" placeholder="ex. Dracaufeu-GX" autocomplete="off">
    <div class="r2"><div><label>Extension</label><input id="fSet" value="${esc(c.set)}" placeholder="ex. Duo de Choc"></div><div><label>Numéro</label><input id="fNum" value="${esc(c.num)}" placeholder="ex. 33/181"></div></div>
    <div class="r2"><div><label>État</label><select id="fCond">${o(COND, c.cond, k => k + " · " + COND[k])}</select></div><div><label>Langue</label><select id="fLang">${o({ FR: 1, EN: 1, JP: 1 }, c.lang, k => k)}</select></div></div>
    <div class="r2"><div><label>Prix payé (€)</label><input id="fPaid" type="text" inputmode="decimal" value="${fv(c.paid)}"></div><div><label>Couleur</label><select id="fType">${o(TYPES, c.type, k => TYPES[k].label)}</select></div></div>
    <div class="r2"><div><label>Réf. NM prix FR (€)</label><input id="fRefFr" type="text" inputmode="decimal" value="${fv(c.refFr)}" placeholder="vide si inconnu"></div><div><label>Réf. NM toutes langues</label><input id="fRefAll" type="text" inputmode="decimal" value="${fv(c.refAll)}"></div></div>
    <label>Valeur finale (€) · facultatif</label><input id="fMan" type="text" inputmode="decimal" value="${fv(c.manual)}" placeholder="vide = valeur calculée">
    <label>Lien d'image · facultatif</label><input id="fImg" type="url" inputmode="url" value="${esc(c.imgUrl || "")}" placeholder="https://…">
    <details class="box" style="margin-top:12px"><summary>Options avancées</summary>
      <label>Code image TCGdex (série/extension/numéro)</label><input id="fTcg" value="${esc(c.tcgdex || "")}" placeholder="ex. sm/sm9/33">
      <div class="hint">Sert à afficher automatiquement l'image officielle quand tu n'as pas de photo. Exemples : sm/sm9/33 (Duo de Choc), swsh/swsh7/215.</div>
      <label>Recherche Cardmarket</label><input id="fQ" value="${esc(c.q || "")}" placeholder="nom anglais, ex. Pikachu Zekrom GX">
      <label>Notes</label><textarea id="fWhy" rows="3">${esc(c.why || "")}</textarea></details>
    <div class="box calc" id="fCalc"></div>
    <div class="actions"><button class="btn pri" id="fSave">Enregistrer</button>${isNew ? "" : '<button class="btn dan" id="fDel">Supprimer</button>'}<button class="btn" id="fCancel">Annuler</button></div>`, () => {
    const read = () => ({ ...c, cond: $("fCond").value, lang: $("fLang").value, paid: num($("fPaid").value) || 0, refAll: num($("fRefAll").value) || 0, refFr: num($("fRefFr").value), manual: num($("fMan").value) });
    const upd = () => { const t = read(), b = breakdown(t), d = b.value - t.paid;
      $("fCalc").innerHTML = `<div class="l ${b.man ? "strike" : ""}"><span>${cf(b.base)} × ${cf(b.lk)} × ${cf(b.ck)}</span><b>${eur(b.calc)}</b></div>${b.man ? `<div class="l"><span>Valeur finale saisie</span><b>${eur(b.value)}</b></div>` : ""}<div class="l tot"><span>Plus-value</span><b class="${d >= 0 ? "up" : "down"}">${sgn(d)}</b></div>`; };
    ["fCond", "fLang", "fPaid", "fRefAll", "fRefFr", "fMan"].forEach(i => $(i).addEventListener("input", upd)); upd();
    $("fCancel").onclick = () => isNew ? close() : detail(c.id);
    $("fSave").onclick = async () => { const t = read(), name = $("fName").value.trim(); if (!name) { toast("Donne un nom à la carte"); $("fName").focus(); return; }
      const img = $("fImg").value.trim(); if (img && !/^https?:\/\//i.test(img)) { toast("Le lien d'image doit commencer par http"); return; }
      Object.assign(c, t, { name, set: $("fSet").value.trim(), num: $("fNum").value.trim(), type: $("fType").value, imgUrl: img || null, tcgdex: $("fTcg").value.trim() || null, q: $("fQ").value.trim(), why: $("fWhy").value.trim() });
      if (isNew) S.cards.push(c); await persist(true, isNew ? "Carte ajoutée" : "Modifications enregistrées"); detail(c.id); };
    if (!isNew) { let armed = false; $("fDel").onclick = async e => { if (!armed) { armed = true; e.target.textContent = "Confirmer la suppression"; return; }
      await removePhoto(c); S.cards = S.cards.filter(x => x.id !== c.id); await persist(true, "Carte supprimée"); close(); }; }
    if (isNew) $("fName").focus();
  });
}

/* ============ réglages ============ */
const isStandalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone;
function renderSettings() {
  $("v-settings").innerHTML = `<div class="set">
    ${isStandalone() ? "" : `<h4>Installer sur l'iPhone</h4><div class="card">
      <div class="install"><b>1</b><div>Ouvre cette page dans <b>Safari</b>.</div></div>
      <div class="install"><b>2</b><div>Touche le bouton <b>Partager</b> (le carré avec une flèche vers le haut).</div></div>
      <div class="install"><b>3</b><div>Choisis <b>« Sur l'écran d'accueil »</b>, puis <b>Ajouter</b>.</div></div>
      <div class="hint">L'app s'ouvre ensuite en plein écran et fonctionne même sans réseau. Tes données restent sur ton iPhone.</div></div>`}
    <h4>Portefeuille</h4><div class="card">
      <div class="r2"><div><label>Montant investi (€)</label><input id="sInv" type="text" inputmode="decimal" value="${String(S.invested).replace(".", ",")}"></div><div><label>Date des prix</label><input id="sDate" type="date" value="${S.snapshot}"></div></div>
      <label>Décote langue (appliquée quand aucun prix FR n'est connu)</label>
      <div class="r4"><div><label>FR</label><input id="sLangFR" type="text" inputmode="decimal" value="${cf(S.langCoef.FR)}"></div><div><label>EN</label><input id="sLangEN" type="text" inputmode="decimal" value="${cf(S.langCoef.EN)}"></div><div><label>JP</label><input id="sLangJP" type="text" inputmode="decimal" value="${cf(S.langCoef.JP)}"></div></div>
      <label>Coefficient par état (valeur = réf. NM × coef)</label>
      <div class="r4">${Object.keys(COND).map(k => `<div><label>${k}</label><input data-k="${k}" class="sCoef" type="text" inputmode="decimal" value="${cf(S.coef[k])}"></div>`).join("")}</div>
      <button class="btn pri full" id="sSave" style="margin-top:12px">Enregistrer les réglages</button></div>

    <h4>Comment la valeur est calculée</h4><div class="card">
      <div class="formula">Valeur = Réf. NM × coef langue × coef état</div>
      <p>Si tu as saisi une <b>valeur finale</b> pour une carte, c'est elle qui compte. <b>Réf. NM</b> : prix d'un exemplaire Near Mint, version FR si elle est connue, sinon prix toutes langues avec la décote FR. <b>Coef état</b> : calé sur les écarts de prix observés entre les états.</p>
      <table><tr><th>État Cardmarket</th><th>Équivalent TCGplayer</th><th>Observé</th></tr>
        <tr><td>GD Good</td><td>≈ Lightly Played</td><td>0,62 – 0,76</td></tr><tr><td>PL Played</td><td>≈ Moderately Played</td><td>0,37 – 0,60</td></tr><tr><td>PO Poor</td><td>≈ Heavily Played</td><td>0,15 – 0,40</td></tr></table>
      <p class="hint">Plus-value latente = valeur estimée − prix payé, avant la commission Cardmarket (5 %) et les frais de port. Plus-value réalisée = prix de vente net − prix payé.</p></div>

    <h4>Sauvegarde</h4><div class="card">
      <p style="margin-top:0">Tes données et photos sont stockées sur cet appareil. Exporte régulièrement un fichier de sauvegarde (par exemple dans Fichiers ou iCloud Drive) : si tu effaces les données de Safari, elles seront perdues.</p>
      <div class="actions"><button class="btn" id="sExport">⬇︎ Exporter</button><button class="btn" id="sImport">⬆︎ Importer</button></div>
      <div class="hint" id="sInfo"></div>
      <hr><button class="btn dan sm" id="sReset">Réinitialiser l'app</button></div>
    <p class="hint" style="text-align:center;margin:20px 0">PokéFolio · v1.0 · données locales</p></div>`;
  navigator.storage?.estimate?.().then(e => { $("sInfo") && ($("sInfo").textContent = `Espace utilisé : ${(e.usage / 1048576).toFixed(1)} Mo`); }).catch(() => {});
  $("sSave").onclick = async () => { S.invested = num($("sInv").value) || 0; S.snapshot = $("sDate").value || S.snapshot;
    S.langCoef = { FR: num($("sLangFR").value) || 1, EN: num($("sLangEN").value) || 1, JP: num($("sLangJP").value) || 1 };
    document.querySelectorAll(".sCoef").forEach(i => S.coef[i.dataset.k] = num(i.value) || 0); await persist(true, "Réglages enregistrés"); };
  $("sExport").onclick = exportData; $("sImport").onclick = () => $("importPick").click();
  let armed = false; $("sReset").onclick = async e => { if (!armed) { armed = true; e.target.textContent = "Confirmer : tout effacer ?"; return; }
    for (const k of Object.keys(photoURL)) await removePhoto({ id: k }); S = structuredClone(SEED); await persist(true, "App réinitialisée"); };
}
const blobToDataURL = b => new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(b); });
async function exportData() {
  const photos = {}; for (const k of await phKeys()) { const b = await phGet(k); if (b) photos[k] = await blobToDataURL(b); }
  const data = JSON.stringify({ app: "pokefolio", version: 1, exportedAt: new Date().toISOString(), state: S, photos });
  const file = new File([data], `pokefolio-${today()}.json`, { type: "application/json" });
  if (navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file], title: "Sauvegarde PokéFolio" }); return; } catch (e) { if (e.name === "AbortError") return; } }
  const a = document.createElement("a"); a.href = URL.createObjectURL(file); a.download = file.name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast("Sauvegarde exportée");
}
$("importPick").addEventListener("change", async e => {
  const f = e.target.files?.[0]; e.target.value = ""; if (!f) return;
  try { const o = JSON.parse(await f.text()); const st = o.state || o; if (!Array.isArray(st.cards)) throw new Error("fichier non reconnu");
    S = st; for (const k of Object.keys(photoURL)) await removePhoto({ id: k });
    for (const [k, d] of Object.entries(o.photos || {})) { const b = await (await fetch(d)).blob(); await phSet(k, b); photoURL[k] = URL.createObjectURL(b); }
    await persist(true, `Sauvegarde importée (${st.cards.length} cartes)`); }
  catch (err) { toast("Import impossible : " + (err?.message || err)); }
});

/* ============ événements ============ */
document.addEventListener("click", e => { const h = e.target.closest("[data-open]"); if (h) { e.preventDefault(); detail(h.dataset.open); } });
$("bAdd").addEventListener("click", () => edit(null));
$("kInvest").addEventListener("click", () => go("settings"));
$("sort").addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return; sortBy = b.dataset.s; [...$("sort").children].forEach(x => x.classList.toggle("on", x === b)); renderGrid(); });
$("filters").addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return; filter = b.dataset.f; [...$("filters").children].forEach(x => x.classList.toggle("on", x === b)); renderGrid(); });
$("search").addEventListener("input", e => { query = e.target.value; renderGrid(); });

/* ============ démarrage ============ */
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("sw.js").catch(() => {});
load().then(render).catch(err => { document.body.insertAdjacentHTML("beforeend", `<div class="toast on">Erreur au démarrage : ${esc(err?.message || err)}</div>`); });
