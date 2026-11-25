'use strict';
/* =========================================================================
   utils.js – Hilfsfunktionen: DOM, Datum, Formatierung, Feiertage, Icons
   (klassische Skripte teilen sich den globalen Namensraum)
   ========================================================================= */

/* ---------- DOM ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/* ---------- Datum (immer als ISO-String YYYY-MM-DD, 12 Uhr gegen Sommerzeitfehler) ---------- */
const pad = (n) => String(n).padStart(2, '0');
const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromISO = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, 12); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const addDaysISO = (iso, n) => toISO(addDays(fromISO(iso), n));
const daysBetween = (a, b) => Math.round((fromISO(b) - fromISO(a)) / 86400000);
const todayISO = () => toISO(new Date());
const ymOf = (iso) => iso.slice(0, 7);
function shiftYM(ym, n) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1, 12);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}
/** Gleicher Tag n Monate später/früher (auf Monatsende begrenzt) */
function shiftDateMonth(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const last = new Date(y, m + n, 0, 12).getDate();
  return toISO(new Date(y, m - 1 + n, Math.min(d, last), 12));
}
const monthsBetween = (a, b) => (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + Number(b.slice(5, 7)) - Number(a.slice(5, 7));

const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const WD = ['So.', 'Mo.', 'Di.', 'Mi.', 'Do.', 'Fr.', 'Sa.'];
const WD_LONG = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];

/* ---------- Formatierung ---------- */
const eurFmt = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
const eur = (n) => eurFmt.format(Number(n) || 0);
const num = (n, d = 2) => new Intl.NumberFormat('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d }).format(Number(n) || 0);
const pct = (n) => `${Math.round((Number(n) || 0) * 100)} %`;
const fmtDate = (iso) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;
const fmtDM = (iso) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.`;
const fmtWDM = (iso) => `${WD[fromISO(iso).getDay()]} ${fmtDM(iso)}`;
function relDay(iso) {
  const d = daysBetween(todayISO(), iso);
  if (d === 0) return 'Heute';
  if (d === -1) return 'Gestern';
  if (d === 1) return 'Morgen';
  return `${WD_LONG[fromISO(iso).getDay()]}, ${fmtDM(iso)}`;
}

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const sum = (arr) => arr.reduce((a, b) => a + (Number(b) || 0), 0);
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const clamp = (n, a, b) => Math.min(b, Math.max(a, n));

/** HTML-Escaping für sämtliche Nutzereingaben */
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Betrag aus "1.234,56", "12,5" oder "12.50" lesen */
function parseAmount(v) {
  let s = String(v ?? '').trim().replace(/[€\s]/g, '');
  if (!s) return NaN;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  return parseFloat(s);
}
const amountStr = (n) => (n === '' || n == null || isNaN(Number(n)) ? '' : String(round2(n)).replace('.', ','));

function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

/** Deterministischer Zufall (für reproduzierbare Beispieldaten) */
function seededRandom(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- Feiertage (bundesweit + optional Bundesland) ---------- */
const REGIONS = {
  '': 'Nur bundesweit', BW: 'Baden-Württemberg', BY: 'Bayern', BE: 'Berlin', BB: 'Brandenburg', HB: 'Bremen',
  HH: 'Hamburg', HE: 'Hessen', MV: 'Mecklenburg-Vorpommern', NI: 'Niedersachsen', NW: 'Nordrhein-Westfalen',
  RP: 'Rheinland-Pfalz', SL: 'Saarland', SN: 'Sachsen', ST: 'Sachsen-Anhalt', SH: 'Schleswig-Holstein', TH: 'Thüringen',
};

function easterSunday(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(y, month - 1, day, 12);
}

const _holidayCache = new Map();
function holidaysFor(year, region = '', bank = false) {
  const ck = `${year}|${region}|${bank}`;
  if (_holidayCache.has(ck)) return _holidayCache.get(ck);
  const set = new Set();
  const add = (d) => set.add(typeof d === 'string' ? d : toISO(d));
  const fx = (m, d) => `${year}-${pad(m)}-${pad(d)}`;
  const e = easterSunday(year);
  const inR = (...l) => l.includes(region);
  [fx(1, 1), addDays(e, -2), addDays(e, 1), fx(5, 1), addDays(e, 39), addDays(e, 50), fx(10, 3), fx(12, 25), fx(12, 26)].forEach(add);
  if (inR('BW', 'BY', 'ST')) add(fx(1, 6));
  if (inR('BE', 'MV')) add(fx(3, 8));
  if (inR('BW', 'BY', 'HE', 'NW', 'RP', 'SL')) add(addDays(e, 60));
  if (inR('BY', 'SL')) add(fx(8, 15));
  if (inR('TH')) add(fx(9, 20));
  if (inR('BB', 'HB', 'HH', 'MV', 'NI', 'SN', 'ST', 'SH', 'TH')) add(fx(10, 31));
  if (inR('BW', 'BY', 'NW', 'RP', 'SL')) add(fx(11, 1));
  if (inR('SN')) { let d = new Date(year, 10, 22, 12); while (d.getDay() !== 3) d = addDays(d, -1); add(d); }
  if (bank) { add(fx(12, 24)); add(fx(12, 31)); }
  _holidayCache.set(ck, set);
  return set;
}

/* ---------- Icons (schlichte Linien-Icons im SF-Symbols-Stil) ---------- */
const ICONS = {
  home: '<path d="M3.5 10.2 12 3.5l8.5 6.7V19a1.5 1.5 0 0 1-1.5 1.5h-4.5v-6h-5v6H5A1.5 1.5 0 0 1 3.5 19z"/>',
  doc: '<rect x="5" y="3" width="14" height="18" rx="2.5"/><path d="M9 8h6M9 12h6M9 16h3.5"/>',
  repeat: '<path d="m17 2.5 3 3-3 3"/><path d="M4 11.5v-1a5 5 0 0 1 5-5h11"/><path d="m7 21.5-3-3 3-3"/><path d="M20 12.5v1a5 5 0 0 1-5 5H4"/>',
  cart: '<path d="M2.5 4h2.2l2.3 10.6a1.2 1.2 0 0 0 1.2.9h8.7a1.2 1.2 0 0 0 1.1-.9L20 8H6"/><circle cx="9" cy="19.5" r="1.4"/><circle cx="17" cy="19.5" r="1.4"/>',
  fuel: '<path d="M4.5 21V5.5a2 2 0 0 1 2-2h5a2 2 0 0 1 2 2V21M3 21h12M4.5 10.5h9"/><path d="M13.5 8.5h1.8a1.7 1.7 0 0 1 1.7 1.7v6.3a1.5 1.5 0 0 0 3 0V9l-2.8-2.8"/>',
  star: '<path d="m12 3.2 2.7 5.5 6 .9-4.35 4.25 1.03 6L12 17l-5.38 2.85 1.03-6L3.3 9.6l6-.9z"/>',
  bulb: '<path d="M9.5 18h5M10.5 21h3M12 3a6 6 0 0 0-3.6 10.8c.7.5 1.1 1.3 1.1 2.1v.1h5v-.1c0-.8.4-1.6 1.1-2.1A6 6 0 0 0 12 3z"/>',
  income: '<path d="M12 3.5v11m0 0-4-4m4 4 4-4"/><path d="M4 14.5v3.5a2.5 2.5 0 0 0 2.5 2.5h11A2.5 2.5 0 0 0 20 18v-3.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  plusc: '<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>',
  chevL: '<path d="m15 18-6-6 6-6"/>',
  chevR: '<path d="m9 18 6-6-6-6"/>',
  bell: '<path d="M6 9a6 6 0 1 1 12 0c0 6.5 2.5 8.5 2.5 8.5h-17S6 15.5 6 9"/><path d="M10.2 20.5a2 2 0 0 0 3.6 0"/>',
  cal: '<rect x="3.5" y="4.5" width="17" height="16" rx="2.5"/><path d="M8 2.5v4M16 2.5v4M3.5 10h17"/>',
  copy: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  wallet: '<rect x="3" y="6" width="18" height="14" rx="3"/><path d="M3 10h18M16 15h2"/><path d="M6 6V5a2 2 0 0 1 2-2h9"/>',
  piggy: '<path d="M19 11.5c0-3.6-3.4-6-7.5-6S4 8 4 11.5c0 2.1 1.1 3.7 2.6 4.8V20h3v-2h4v2h3v-3.5c.9-.7 1.6-1.5 2-2.5H21v-3h-2.2"/><circle cx="15.5" cy="10.5" r=".6"/>',
  out: '<path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4"/><path d="M10 16l-4-4 4-4M6 12h10"/>',
  down: '<path d="M12 4v12m0 0-4.5-4.5M12 16l4.5-4.5"/><path d="M5 20h14"/>',
  up: '<path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5"/><path d="M5 20h14"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4.5h6V7"/>',
  spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/>',
  person: '<circle cx="12" cy="8" r="4"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/>',
  share: '<path d="M12 3v12M8 7l4-4 4 4"/><path d="M8.5 10.5H7a2 2 0 0 0-2 2V19a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6.5a2 2 0 0 0-2-2h-1.5"/>',
};
const icon = (name, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ''}</svg>`;
