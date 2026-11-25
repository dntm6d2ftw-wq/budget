'use strict';
/* =========================================================================
   budget.js – Fachlogik
   -------------------------------------------------------------------------
   • Datenmodell & Migration          • Gehaltszyklus (Werktage/Feiertage)
   • Abos & Verträge (wiederkehrend)  • Kennzahlen pro Zyklus
   • Kündigungs-Erinnerungen          • Beispieldaten
   ========================================================================= */

/** Kategorien. kind: 'fixed' = geplant/fest, 'var' = variable Ausgaben */
const CATS = {
  fix:   { label: 'Fixkosten',  long: 'Allgemeine Fixkosten', icon: 'doc',    color: '#5856D6', kind: 'fixed' },
  subs:  { label: 'Abos',       long: 'Abos & Verträge',      icon: 'repeat', color: '#AF52DE', kind: 'fixed' },
  daily: { label: 'Alltag',     long: 'Laufende Kosten',      icon: 'cart',   color: '#30B0C7', kind: 'var' },
  fuel:  { label: 'Tanken',     long: 'Tankkosten',           icon: 'fuel',   color: '#FF9500', kind: 'var' },
  hobby: { label: 'Freizeit',   long: 'Hobby & Freizeit',     icon: 'star',   color: '#FF2D55', kind: 'var' },
  misc:  { label: 'Sonstiges',  long: 'Sonstiges & Einfälle', icon: 'bulb',   color: '#A2845E', kind: 'var' },
};
const INCOME_META = { label: 'Einnahme', icon: 'income', color: '#34C759' };
const SAVE_META = { label: 'Sparen', icon: 'piggy', color: '#32ADE6' };

/** Optionale Unterkategorien je Bereich */
const SUBCATS = {
  fix: ['Wohnen', 'Energie', 'Versicherung', 'Kredit', 'Kommunikation', 'Mobilität', 'Sonstiges'],
  daily: ['Lebensmittel', 'Drogerie', 'Bäcker', 'Haushalt', 'Getränke', 'Sonstiges'],
  fuel: ['Benzin / Diesel', 'Laden (E-Auto)', 'Wäsche & Pflege', 'Parken & Maut'],
  hobby: ['Sport', 'Kino & Kultur', 'Restaurant & Bar', 'Hobby', 'Reisen', 'Sonstiges'],
  misc: [],
};

/** Farben für Spartöpfe (Apple-Systemfarben) */
const BUCKET_COLORS = ['#5856D6', '#34C759', '#FF9500', '#32ADE6', '#FF2D55', '#AF52DE', '#A2845E', '#30B0C7'];
const defaultBuckets = () => [
  { id: uid(), name: 'ETF-Depot', percent: 60, color: '#5856D6', archived: false },
  { id: uid(), name: 'Tagesgeld', percent: 30, color: '#34C759', archived: false },
  { id: uid(), name: 'Urlaub & Rücklagen', percent: 10, color: '#FF9500', archived: false },
];
const EXPENSE_CATS = ['fix', 'daily', 'fuel', 'hobby', 'misc'];   // per Buchung erfasst
const VAR_CATS = ['daily', 'fuel', 'hobby', 'misc'];              // mit Budget-Limit

/** Schnellvorschläge für Titel (sekundenschnelles Eintragen) */
const SUGGEST = {
  fix: ['Miete', 'Strom', 'Gas', 'Internet', 'Haftpflicht', 'KFZ-Versicherung', 'Kredit', 'Rundfunkbeitrag'],
  daily: ['Rewe', 'Edeka', 'Lidl', 'Aldi', 'Kaufland', 'dm', 'Rossmann', 'Bäcker', 'Haushalt'],
  fuel: ['Aral', 'Shell', 'Esso', 'Jet', 'TotalEnergies'],
  hobby: ['Restaurant', 'Kino', 'Café', 'Bar', 'Sport', 'Konzert', 'Ausflug'],
  misc: ['Geschenk', 'Reparatur', 'Apotheke', 'Kleidung', 'Online-Bestellung'],
  income: ['Rückzahlung', 'Verkauf', 'Trinkgeld', 'Nachhilfe', 'Bonus', 'Erstattung'],
  subs: ['Netflix', 'Spotify', 'Disney+', 'Amazon Prime', 'Fitnessstudio', 'Handyvertrag', 'iCloud+', 'YouTube Premium'],
};

/** Daten des angemeldeten Nutzers (wird nach Login gesetzt) */
let state = null;

function defaultData() {
  return {
    version: 3,
    settings: { theme: 'auto', workdaysBefore: 3, region: '', bankHolidays: false, defaultSalary: 0, defaultSavingsRate: 0 },
    paydayOverrides: {},  // { 'YYYY-MM': 'YYYY-MM-DD' } manuell gesetzter Gehaltseingang
    contracts: [],        // Abos & Verträge (gelten automatisch für jeden Zyklus)
    cycles: {},           // { 'YYYY-MM': { salary, savingsRate, incomes[], expenses[], limits{} } }
    buckets: defaultBuckets(),  // Spartöpfe mit Prozentanteil
    savings: [],          // Spar-Buchungen: { id, cycle, bucketId, amount(±), kind, date, note, groupId }
  };
}

/** Fehlende Felder ergänzen (auch für Importe & Version-1-Daten) */
function normalizeData(d) {
  const base = defaultData();
  d = d && typeof d === 'object' ? d : {};
  const out = {
    ...base, ...d,
    settings: { ...base.settings, ...(d.settings || {}) },
    paydayOverrides: d.paydayOverrides || {},
    contracts: Array.isArray(d.contracts) ? d.contracts : [],
    cycles: d.cycles || {},
    buckets: Array.isArray(d.buckets) && d.buckets.length ? d.buckets : base.buckets,
    savings: Array.isArray(d.savings) ? d.savings : [],
    version: 3,
  };
  out.buckets.forEach((b) => { b.percent = Number(b.percent) || 0; b.archived = !!b.archived; b.color = b.color || BUCKET_COLORS[0]; });
  for (const k of Object.keys(out.cycles)) {
    const c = out.cycles[k];
    c.salary = Number(c.salary) || 0;
    c.savingsRate = Number(c.savingsRate) || 0;
    c.incomes = Array.isArray(c.incomes) ? c.incomes : [];
    c.expenses = (Array.isArray(c.expenses) ? c.expenses : []).filter((e) => CATS[e.cat]);
    c.limits = { daily: 0, fuel: 0, hobby: 0, misc: 0, ...(c.limits || {}) };
    delete c.limits.fix; delete c.savings;
  }
  return out;
}

const save = () => Session.saveData(state);

/* ---------- Gehaltszyklus ---------- */
function isWorkday(d) {
  const wd = d.getDay();
  return wd !== 0 && wd !== 6 && !holidaysFor(d.getFullYear(), state.settings.region, state.settings.bankHolidays).has(toISO(d));
}

/** n-letzter Werktag des Monats (Standard: 3) – Wochenenden/Feiertage werden vorgezogen */
function autoPayday(ym) {
  const [y, m] = ym.split('-').map(Number);
  let d = new Date(y, m, 0, 12);
  const n = clamp(parseInt(state.settings.workdaysBefore, 10) || 3, 1, 10);
  let count = 0;
  for (let i = 0; i < 40; i++) {
    if (isWorkday(d) && ++count === n) break;
    d = addDays(d, -1);
  }
  return toISO(d);
}
const payday = (ym) => state.paydayOverrides[ym] || autoPayday(ym);

/** Zyklus "YYYY-MM" = Budgetmonat. Start: Gehalt im Vormonat, Ende: Tag vor dem nächsten Gehalt */
function cycleRange(key) {
  const start = payday(shiftYM(key, -1));
  const end = addDaysISO(payday(key), -1);
  return { start, end, days: Math.max(1, daysBetween(start, end) + 1) };
}
function cycleKeyForDate(iso) {
  const ym = ymOf(iso);
  for (const k of [shiftYM(ym, 1), ym, shiftYM(ym, 2), shiftYM(ym, -1)]) {
    const r = cycleRange(k);
    if (iso >= r.start && iso <= r.end) return k;
  }
  return iso >= payday(ym) ? shiftYM(ym, 1) : ym;
}
const currentKey = () => cycleKeyForDate(todayISO());
const cycleLabel = (key) => `${MONTHS[Number(key.slice(5)) - 1]} ${key.slice(0, 4)}`;
const rangeLabel = (key) => { const r = cycleRange(key); return `${fmtDM(r.start)} – ${fmtDate(r.end)}`; };

/** Erstes Datum im Zyklus mit Tag `day` (z. B. Abbuchung am 15.) – sonst Zyklusende */
function dateInCycle(key, day) {
  const r = cycleRange(key);
  for (let ym = ymOf(r.start); ym <= ymOf(r.end); ym = shiftYM(ym, 1)) {
    const [y, m] = ym.split('-').map(Number);
    const d = `${ym}-${pad(Math.min(day, new Date(y, m, 0).getDate()))}`;
    if (d >= r.start && d <= r.end) return d;
  }
  return r.end;
}

function blankCycle(key) {
  const prevKey = Object.keys(state.cycles).filter((k) => k < key).sort().pop();
  const prev = prevKey ? state.cycles[prevKey] : null;
  return {
    salary: Number(state.settings.defaultSalary) || 0,
    savingsRate: Number(state.settings.defaultSavingsRate) || 0,
    incomes: [], expenses: [],
    limits: prev ? { ...prev.limits } : { daily: 0, fuel: 0, hobby: 0, misc: 0 },
  };
}
/** Lesen ohne Anlegen (Blättern erzeugt keine leeren Zyklen) */
const cycleView = (key) => state.cycles[key] || blankCycle(key);
function mutCycle(key) {
  if (!state.cycles[key]) state.cycles[key] = blankCycle(key);
  return state.cycles[key];
}

/* ---------- Abos & Verträge ---------- */
/** Abbuchungen eines Zyklus: [{ ct, date, amount, paid }] */
function subsForCycle(key) {
  const t = todayISO();
  return state.contracts.map((ct) => {
    const date = dateInCycle(key, Number(ct.day) || 1);
    const active = !ct.paused
      && (!ct.start || ct.start <= date)
      && !(ct.cancelled && ct.end && date > ct.end);
    return active ? { ct, date, amount: Number(ct.amount) || 0, paid: date <= t } : null;
  }).filter(Boolean).sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Kündigungsinfo: nächstes Vertragsende (verlängert sich automatisch um
 * `renew` Monate) und letzter Kündigungstag (Ende − Kündigungsfrist).
 */
function contractDeadline(ct) {
  if (!ct.end || ct.cancelled) return null;
  const t = todayISO();
  const renew = Math.max(1, Number(ct.renew) || 12);
  const notice = Math.max(0, Number(ct.notice) || 0);
  let end = ct.end, guard = 0;
  while (guard++ < 200) {
    const by = shiftDateMonth(end, -notice);
    if (by >= t) return { end, by, days: daysBetween(t, by) };
    end = shiftDateMonth(end, renew);
  }
  return null;
}
/** Erinnerungen: Kündigungsfrist endet in ≤ 60 Tagen */
const reminders = () => state.contracts
  .map((ct) => ({ ct, d: contractDeadline(ct) }))
  .filter((x) => x.d && x.d.days <= 60 && !x.ct.paused)
  .sort((a, b) => a.d.days - b.d.days);

/* ---------- Kennzahlen ---------- */
function stats(key) {
  const c = cycleView(key);
  const r = cycleRange(key);
  const t = todayISO();

  const salary = Number(c.salary) || 0;
  const extra = sum(c.incomes.map((i) => i.amount));
  const income = salary + extra;

  const fixItems = c.expenses.filter((e) => e.cat === 'fix');
  const fixPlanned = sum(fixItems.map((e) => e.amount));
  const fixPaid = sum(fixItems.filter((e) => e.date <= t).map((e) => e.amount));

  const subs = subsForCycle(key);
  const subsPlanned = sum(subs.map((s) => s.amount));
  const subsPaid = sum(subs.filter((s) => s.paid).map((s) => s.amount));

  const byCat = { fix: fixPlanned, subs: subsPlanned, daily: 0, fuel: 0, hobby: 0, misc: 0 };
  c.expenses.forEach((e) => { if (CATS[e.cat].kind === 'var') byCat[e.cat] += Number(e.amount) || 0; });
  const variable = sum(VAR_CATS.map((k) => byCat[k]));

  const fixedTotal = fixPlanned + subsPlanned;
  const status = t < r.start ? 'future' : t > r.end ? 'past' : 'current';

  // Sparen: gebuchte Beträge (Einzahlungen − Entnahmen); in künftigen Monaten zählt die geplante Sparrate
  const savedBooked = savedInCycle(key);
  const rateBooked = state.savings.some((x) => x.groupId === rateGroupId(key));
  const saved = round2(savedBooked + (!rateBooked && status === 'future' ? Number(c.savingsRate) || 0 : 0));

  const free = income - fixedTotal - variable - saved;   // "Frei verfügbar"
  const daysLeft = status === 'current' ? daysBetween(t, r.end) + 1 : status === 'future' ? r.days : 0;
  const perDay = daysLeft > 0 ? free / daysLeft : 0;
  const saveRate = income > 0 ? Math.max(0, saved) / income : 0;   // Sparquote

  return { c, r, salary, extra, income, fixPlanned, fixPaid, subs, subsPlanned, subsPaid, byCat, variable, fixedTotal, saved, saveRate, free, status, daysLeft, perDay };
}

/* ---------- Sparen & Vermögen ---------- */
const activeBuckets = () => state.buckets.filter((b) => !b.archived);
const percentSum = (list = activeBuckets()) => round2(sum(list.map((b) => b.percent)));
const rateGroupId = (key) => `rate-${key}`;
const bucketById = (id) => state.buckets.find((b) => b.id === id);
const bucketBalance = (id) => round2(sum(state.savings.filter((s) => s.bucketId === id).map((s) => s.amount)));
const bucketInCycle = (id, key) => round2(sum(state.savings.filter((s) => s.bucketId === id && s.cycle === key).map((s) => s.amount)));
const savedInCycle = (key) => round2(sum(state.savings.filter((s) => s.cycle === key).map((s) => s.amount)));
const totalWealth = () => round2(sum(state.savings.map((s) => s.amount)));

/** Betrag gemäß Prozentanteilen aufteilen (auf den Cent genau, Rest an den letzten Topf) */
function splitAmount(amount) {
  const list = activeBuckets().filter((b) => b.percent > 0);
  const cents = Math.round(amount * 100);
  let rest = cents;
  return list.map((b, i) => {
    const c = i === list.length - 1 ? rest : Math.round((cents * b.percent) / 100);
    rest -= c;
    return { bucket: b, amount: c / 100 };
  }).filter((x) => x.amount !== 0);
}

/**
 * Sparbetrag buchen → wird automatisch auf die Töpfe verteilt.
 * idPrefix: feste IDs (z. B. für die Sparrate), damit zwei Geräte nicht doppelt buchen.
 */
function bookSavings(key, amount, { kind = 'extra', date, note = '', groupId = uid(), idPrefix = null } = {}) {
  const created = new Date().toISOString();
  splitAmount(amount).forEach(({ bucket, amount: a }) => state.savings.push({
    id: idPrefix ? `${idPrefix}-${bucket.id}` : uid(), cycle: key, bucketId: bucket.id, amount: a, kind,
    date: date || cycleRange(key).start, note, groupId, created,
  }));
  return groupId;
}

/** Geld aus einem Topf zurück ins Monatsbudget buchen */
function withdrawSavings(key, bucketId, amount, date, note = '') {
  state.savings.push({ id: uid(), cycle: key, bucketId, amount: -round2(amount), kind: 'withdrawal', date, note, groupId: uid(), created: new Date().toISOString() });
}

/** Monatliche Sparrate direkt nach Gehaltseingang buchen (einmal pro Zyklus) */
function ensureRateBooked(key) {
  const c = state.cycles[key];
  if (!c || !(c.savingsRate > 0) || percentSum() !== 100) return false;
  if (todayISO() < cycleRange(key).start) return false;
  if (state.savings.some((s) => s.groupId === rateGroupId(key))) return false;
  bookSavings(key, c.savingsRate, { kind: 'rate', date: cycleRange(key).start, note: 'Monatliche Sparrate', groupId: rateGroupId(key), idPrefix: rateGroupId(key) });
  return true;
}
/** Sparrate eines Monats ändern → bestehende Buchung wird neu aufgeteilt */
function setSavingsRate(key, amount) {
  mutCycle(key).savingsRate = round2(amount);
  state.savings = state.savings.filter((s) => s.groupId !== rateGroupId(key));
  ensureRateBooked(key);
}

/** Spar-Transfers gruppiert (ein Transfer = mehrere Topf-Buchungen) */
function savingsGroups() {
  const map = new Map();
  state.savings.forEach((s) => {
    if (!map.has(s.groupId)) map.set(s.groupId, { id: s.groupId, kind: s.kind, date: s.date, cycle: s.cycle, note: s.note, created: s.created, items: [] });
    map.get(s.groupId).items.push(s);
  });
  return [...map.values()]
    .map((g) => ({ ...g, amount: round2(sum(g.items.map((i) => i.amount))) }))
    .sort((a, b) => b.date.localeCompare(a.date) || (b.created || '').localeCompare(a.created || ''));
}

/** Ampel für Soll/Ist: < 75 % ok, < 100 % mid, ab 100 % over */
function limitClass(spent, limit) {
  if (!limit) return 'ok';
  const p = spent / limit;
  return p >= 1 ? 'over' : p >= 0.75 ? 'mid' : 'ok';
}

/** Verbrauch nach Vollgetankt-Methode über alle Zyklen */
function fuelStats(key) {
  const fuel = cycleView(key).expenses.filter((e) => e.cat === 'fuel');
  const withL = fuel.filter((e) => e.liters > 0);
  const liters = sum(withL.map((e) => e.liters));
  const avgPrice = liters ? sum(withL.map((e) => e.amount)) / liters : 0;
  const all = Object.values(state.cycles).flatMap((c) => c.expenses)
    .filter((e) => e.cat === 'fuel' && e.km > 0 && e.liters > 0).sort((a, b) => a.km - b.km);
  let dist = 0, lit = 0;
  for (let i = 1; i < all.length; i++) {
    const d = all[i].km - all[i - 1].km;
    if (d > 0) { dist += d; lit += all[i].liters; }
  }
  return { liters, avgPrice, consumption: dist ? (lit / dist) * 100 : null };
}

/** Fixkosten des Vormonats übernehmen (gleiche Titel werden übersprungen) */
function copyFixFromPrev(key) {
  let src = shiftYM(key, -1);
  let items = (state.cycles[src]?.expenses || []).filter((e) => e.cat === 'fix');
  if (!items.length) {
    src = Object.keys(state.cycles).filter((k) => k < key && state.cycles[k].expenses.some((e) => e.cat === 'fix')).sort().pop();
    items = src ? state.cycles[src].expenses.filter((e) => e.cat === 'fix') : [];
  }
  if (!items.length) return { added: 0, reason: 'none' };
  const r = cycleRange(key);
  const diff = monthsBetween(src, key);
  const c = mutCycle(key);
  const have = new Set(c.expenses.filter((e) => e.cat === 'fix').map((e) => e.title.trim().toLowerCase()));
  let added = 0;
  items.forEach((e) => {
    if (have.has(e.title.trim().toLowerCase())) return;
    const d = clampISO(shiftDateMonth(e.date, diff), r.start, r.end);
    c.expenses.push({ ...e, id: uid(), date: d, created: new Date().toISOString() });
    added++;
  });
  return { added, src, reason: added ? '' : 'exists' };
}
const clampISO = (d, a, b) => (d < a ? a : d > b ? b : d);

/* ---------- Beispieldaten (Demo & „Mit Beispieldaten starten“) ---------- */
function buildSampleData() {
  const prevState = state;
  state = defaultData();
  const rnd = seededRandom(7);
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const t = todayISO();
  const cur = currentKey();
  const prev = shiftYM(cur, -1);
  const now = new Date().toISOString();
  const E = (cat, title, amount, date, extra = {}) => ({ id: uid(), cat, title, amount: round2(amount), date, note: '', created: now, ...extra });

  state.settings.defaultSalary = 2850;
  state.settings.defaultSavingsRate = 300;
  let km = 48210;

  for (const key of [prev, cur]) {
    const c = mutCycle(key);
    const r = cycleRange(key);
    const lastIdx = Math.min(r.days - 1, daysBetween(r.start, t));
    const at = () => addDaysISO(r.start, Math.floor(rnd() * (lastIdx + 1)));
    c.salary = 2850;
    c.limits = { daily: 420, fuel: 180, hobby: 220, misc: 120 };
    c.savingsRate = 300;

    // Allgemeine Fixkosten (geplant über den ganzen Zyklus)
    [['Miete (warm)', 890, 1], ['Strom', 68, 3], ['Internet', 39.99, 5], ['Haftpflicht', 6.5, 15], ['KFZ-Versicherung', 48.2, 1], ['Kredit Auto', 150, 28]]
      .forEach(([title, a, day]) => c.expenses.push(E('fix', title, a, dateInCycle(key, day))));

    // Laufende Kosten
    for (let i = 0; i < 12; i++) c.expenses.push(E('daily', pick(['Rewe', 'Lidl', 'Aldi', 'Edeka', 'dm', 'Bäcker', 'Rossmann']), 6 + rnd() * 52, at()));
    // Tanken
    for (let i = 0; i < 2; i++) {
      const l = round2(36 + rnd() * 9), p = Math.round((1.71 + rnd() * 0.1) * 1000) / 1000;
      km += 560 + Math.floor(rnd() * 120);
      c.expenses.push(E('fuel', pick(['Aral', 'Shell', 'Esso']), l * p, at(), { liters: l, pricePerLiter: p, km }));
    }
    // Freizeit
    c.expenses.push(E('hobby', 'Restaurant', 46.8, at(), { note: 'Pizza mit Freunden' }));
    c.expenses.push(E('hobby', 'Kino', 13.5, at()));
    c.expenses.push(E('hobby', 'Kletterhalle', 15, at()));
    // Sonstiges (Notiz ist Pflicht)
    c.expenses.push(E('misc', 'Geschenk', 35, at(), { note: 'Geburtstag Mama – Blumen & Karte' }));
    if (key === cur) c.expenses.push(E('misc', 'Schlüsseldienst', 89, at(), { note: 'Wohnungstür zugefallen 🙈' }));
    // Zusatzeinnahmen
    c.incomes.push({ id: uid(), title: 'Nachhilfe', amount: 120, date: at(), note: 'Mathe, 4 Stunden', created: now });
    if (key === cur) c.incomes.push({ id: uid(), title: 'Verkauf Kleinanzeigen', amount: 45, date: at(), note: 'Alte Kamera', created: now });
  }

  // Abos & Verträge
  const C = (name, amount, day, extra = {}) => ({ id: uid(), name, amount, day, start: '', end: '', notice: 0, renew: 12, cancelled: false, paused: false, note: '', ...extra });
  state.contracts = [
    C('Netflix', 13.99, 15),
    C('Spotify', 10.99, 5),
    C('iCloud+', 2.99, 12),
    C('Fitnessstudio', 29.9, 1, { end: shiftDateMonth(t, 2).slice(0, 8) + '01', notice: 1, renew: 12, note: 'Kündigung schriftlich' }),
    C('Handyvertrag', 24.99, 20, { end: shiftDateMonth(t, 4), notice: 3, renew: 12 }),
  ];

  // Sparen: Sparrate in beiden Monaten, eine spontane Einzahlung, eine Entnahme
  ensureRateBooked(prev);
  ensureRateBooked(cur);
  const r0 = cycleRange(cur);
  bookSavings(cur, 50, { date: addDaysISO(r0.start, Math.min(9, r0.days - 1)), note: 'Rest vom Flohmarkt' });
  withdrawSavings(prev, state.buckets[2].id, 25, addDaysISO(cycleRange(prev).start, 12), 'Konzertkarte');

  const result = state;
  state = prevState;
  return result;
}
