'use strict';
/* =========================================================================
   sync.js – Cloud-Synchronisation mit Supabase (PostgreSQL)
   -------------------------------------------------------------------------
   Die App arbeitet intern mit einem Zustandsobjekt (state). Diese Datei
   übersetzt es in die Tabellen aus supabase.sql und zurück:

     state ──toRows()──▶ Zeilen je Tabelle ──diff gegen Snapshot──▶ upsert/delete
     Supabase ──pullAll()──▶ Zeilen ──fromRows()──▶ state

   • Snapshot = zuletzt bestätigter Server-Stand (kanonisiert, je Zeile).
     Nur geänderte Zeilen werden übertragen, gelöschte werden gelöscht.
   • Der Snapshot wird lokal mitgespeichert → Offline-Änderungen werden
     beim nächsten Kontakt korrekt nachgeholt (inkl. Löschungen).
   • Konflikte: pro Zeile gewinnt die zuletzt gespeicherte Änderung.
   ========================================================================= */

/** Spalten & Typen je Tabelle: t=Text, n=Zahl, d=Datum, ts=Zeitstempel, b=Bool, j=JSON */
const SCHEMA = {
  user_settings:   { settings: 'j', payday_overrides: 'j' },
  cycles:          { id: 't', start_date: 'd', end_date: 'd', salary: 'n', savings_rate: 'n', limits: 'j' },
  incomes:         { id: 't', cycle_key: 't', title: 't', amount: 'n', date: 'd', note: 't', created_at: 'ts' },
  expenses:        { id: 't', cycle_key: 't', category: 't', sub_category: 't', title: 't', amount: 'n', date: 'd', note: 't', liters: 'n', price_per_liter: 'n', km: 'n', created_at: 'ts' },
  subscriptions:   { id: 't', name: 't', amount: 'n', billing_day: 'n', start_date: 'd', end_date: 'd', notice_months: 'n', renew_months: 'n', cancelled: 'b', paused: 'b', note: 't' },
  savings_buckets: { id: 't', name: 't', percent: 'n', color: 't', sort_order: 'n', archived: 'b' },
  savings_entries: { id: 't', cycle_key: 't', bucket_id: 't', amount: 'n', kind: 't', date: 'd', note: 't', group_id: 't', created_at: 'ts' },
};
const TABLES = Object.keys(SCHEMA);         // Reihenfolge = Upsert-Reihenfolge (Töpfe vor Buchungen)
const rowKey = (t, r) => (t === 'user_settings' ? '_' : String(r.id));

/* ---------- Kanonisierung: gleiche Daten → gleicher String (egal ob lokal oder vom Server) ---------- */
function stableStringify(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(v[k])}`).join(',')}}`;
}
function canon(table, row) {
  const out = {};
  for (const [col, type] of Object.entries(SCHEMA[table])) {
    const v = row[col];
    if (type === 'n') out[col] = v === null || v === undefined || v === '' ? null : Math.round(Number(v) * 1000) / 1000;
    else if (type === 'ts') out[col] = v ? Date.parse(v) || null : null;
    else if (type === 'd') out[col] = v || null;
    else if (type === 'b') out[col] = !!v;
    else if (type === 'j') out[col] = v || {};
    else out[col] = v == null ? '' : String(v);
  }
  return stableStringify(out);
}
function indexRows(rowsByTable) {
  const snap = {};
  for (const t of TABLES) {
    snap[t] = {};
    (rowsByTable[t] || []).forEach((r) => { snap[t][rowKey(t, r)] = canon(t, r); });
  }
  return snap;
}

/* ---------- state ⇄ Tabellenzeilen ---------- */
function toRows(st) {
  const r = { user_settings: [{ settings: st.settings, payday_overrides: st.paydayOverrides }] };
  TABLES.slice(1).forEach((t) => { r[t] = []; });
  for (const [key, c] of Object.entries(st.cycles)) {
    const rg = cycleRange(key);
    r.cycles.push({ id: key, start_date: rg.start, end_date: rg.end, salary: c.salary || 0, savings_rate: c.savingsRate || 0, limits: c.limits || {} });
    c.incomes.forEach((i) => r.incomes.push({
      id: i.id, cycle_key: key, title: i.title, amount: i.amount, date: i.date, note: i.note || '', created_at: i.created || null,
    }));
    c.expenses.forEach((e) => r.expenses.push({
      id: e.id, cycle_key: key, category: e.cat, sub_category: e.sub || null, title: e.title, amount: e.amount, date: e.date,
      note: e.note || '', liters: e.liters ?? null, price_per_liter: e.pricePerLiter ?? null, km: e.km ?? null, created_at: e.created || null,
    }));
  }
  st.contracts.forEach((ct) => r.subscriptions.push({
    id: ct.id, name: ct.name, amount: ct.amount, billing_day: Number(ct.day) || 1, start_date: ct.start || null, end_date: ct.end || null,
    notice_months: Number(ct.notice) || 0, renew_months: Number(ct.renew) || 12, cancelled: !!ct.cancelled, paused: !!ct.paused, note: ct.note || '',
  }));
  st.buckets.forEach((b, i) => r.savings_buckets.push({
    id: b.id, name: b.name, percent: Number(b.percent) || 0, color: b.color, sort_order: i, archived: !!b.archived,
  }));
  st.savings.forEach((s) => r.savings_entries.push({
    id: s.id, cycle_key: s.cycle, bucket_id: s.bucketId, amount: s.amount, kind: s.kind, date: s.date,
    note: s.note || '', group_id: s.groupId, created_at: s.created || null,
  }));
  return r;
}

function fromRows(t) {
  const s = (t.user_settings || [])[0];
  const d = { settings: s?.settings || {}, paydayOverrides: s?.payday_overrides || {}, contracts: [], cycles: {}, buckets: [], savings: [] };
  const cyc = (k) => d.cycles[k] || (d.cycles[k] = { salary: 0, savingsRate: 0, incomes: [], expenses: [], limits: {} });
  const n = (v) => (v === null || v === undefined ? undefined : Number(v));

  (t.cycles || []).forEach((c) => Object.assign(cyc(c.id), { salary: n(c.salary) || 0, savingsRate: n(c.savings_rate) || 0, limits: c.limits || {} }));
  (t.incomes || []).forEach((i) => cyc(i.cycle_key).incomes.push({ id: i.id, title: i.title, amount: n(i.amount), date: i.date, note: i.note || '', created: i.created_at || '' }));
  (t.expenses || []).forEach((e) => {
    const x = { id: e.id, cat: e.category, title: e.title, amount: n(e.amount), date: e.date, note: e.note || '', created: e.created_at || '' };
    if (e.sub_category) x.sub = e.sub_category;
    if (e.liters != null) x.liters = n(e.liters);
    if (e.price_per_liter != null) x.pricePerLiter = n(e.price_per_liter);
    if (e.km != null) x.km = n(e.km);
    cyc(e.cycle_key).expenses.push(x);
  });
  (t.subscriptions || []).forEach((ct) => d.contracts.push({
    id: ct.id, name: ct.name, amount: n(ct.amount), day: ct.billing_day, start: ct.start_date || '', end: ct.end_date || '',
    notice: ct.notice_months || 0, renew: ct.renew_months || 12, cancelled: !!ct.cancelled, paused: !!ct.paused, note: ct.note || '',
  }));
  [...(t.savings_buckets || [])].sort((a, b) => a.sort_order - b.sort_order)
    .forEach((b) => d.buckets.push({ id: b.id, name: b.name, percent: n(b.percent) || 0, color: b.color, archived: !!b.archived }));
  (t.savings_entries || []).forEach((e) => d.savings.push({
    id: e.id, cycle: e.cycle_key, bucketId: e.bucket_id, amount: n(e.amount), kind: e.kind, date: e.date,
    note: e.note || '', groupId: e.group_id, created: e.created_at || '',
  }));
  d._isNew = !s && !(t.cycles || []).length && !(t.subscriptions || []).length && !(t.savings_buckets || []).length;
  return d;
}

/* ---------- Sync-Engine ---------- */
const Sync = {
  status: 'idle',        // loading | saving | synced | offline | error
  snapshot: null,
  busy: false,
  again: false,
  lastPull: 0,

  snapKey: () => `mb2.snap.${Session.user.id}`,

  setStatus(s) {
    this.status = s;
    const el = document.getElementById('syncPill');
    if (el) el.outerHTML = syncPillHTML();
  },

  /** Alle Zeilen einer Tabelle laden (seitenweise, PostgREST liefert max. 1000 je Abfrage) */
  async fetchAll(c, table) {
    const cols = Object.keys(SCHEMA[table]).join(',');
    const out = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await c.from(table).select(cols).eq('user_id', Session.user.id).range(from, from + 999);
      if (error) throw new Error(deError(error.message));
      out.push(...data);
      if (data.length < 1000) break;
    }
    return out;
  },

  async pullAll() {
    const c = await getSupabase();
    const res = {};
    await Promise.all(TABLES.map(async (t) => { res[t] = await this.fetchAll(c, t); }));
    return res;
  },

  /** Beim Login/Start: Server-Stand laden (offline → lokaler Cache + gespeicherter Snapshot) */
  async load() {
    this.setStatus('loading');
    const cacheKey = LS_KEYS.data(Session.user.id);
    try {
      const remote = await this.pullAll();
      this.snapshot = indexRows(remote);
      LS.set(this.snapKey(), this.snapshot);
      this.lastPull = Date.now();
      const d = fromRows(remote);
      this.setStatus('synced');
      if (d._isNew) return null;
      delete d._isNew;
      return d;
    } catch (e) {
      console.warn('Cloud-Laden fehlgeschlagen', e);
      this.snapshot = LS.get(this.snapKey()) || indexRows({});
      this.setStatus('offline');
      return LS.get(cacheKey);
    }
  },

  /** Änderungen bündeln und nach kurzer Pause übertragen */
  schedule: debounce(() => Sync.flush(), 700),

  async flush() {
    if (!state || Session.mode !== 'cloud' || !this.snapshot) return;
    if (this.busy) { this.again = true; return; }
    this.busy = true;
    try {
      const local = toRows(state);
      const ops = [];
      for (const t of TABLES) {
        const snap = this.snapshot[t] || {};
        const seen = new Set();
        const up = [];
        local[t].forEach((r) => {
          const k = rowKey(t, r);
          seen.add(k);
          if (snap[k] !== canon(t, r)) up.push(r);
        });
        const del = t === 'user_settings' ? [] : Object.keys(snap).filter((k) => !seen.has(k));
        if (up.length || del.length) ops.push({ t, up, del });
      }
      if (!ops.length) { this.setStatus('synced'); return; }
      this.setStatus('saving');

      const c = await getSupabase();
      const uidv = Session.user.id;
      // 1) Upserts in Tabellen-Reihenfolge (Spartöpfe vor Buchungen)
      for (const { t, up } of ops) {
        for (let i = 0; i < up.length; i += 500) {
          const chunk = up.slice(i, i + 500).map((r) => ({ ...r, user_id: uidv }));
          const { error } = await c.from(t).upsert(chunk, { onConflict: t === 'user_settings' ? 'user_id' : 'user_id,id' });
          if (error) throw new Error(`${t}: ${deError(error.message)}`);
          chunk.forEach((r) => { this.snapshot[t][rowKey(t, r)] = canon(t, r); });
        }
      }
      // 2) Löschungen in umgekehrter Reihenfolge (Buchungen vor Töpfen)
      for (const { t, del } of [...ops].reverse()) {
        for (let i = 0; i < del.length; i += 100) {
          const ids = del.slice(i, i + 100);
          const { error } = await c.from(t).delete().eq('user_id', uidv).in('id', ids);
          if (error) throw new Error(`${t}: ${deError(error.message)}`);
          ids.forEach((k) => { delete this.snapshot[t][k]; });
        }
      }
      LS.set(this.snapKey(), this.snapshot);
      this.setStatus('synced');
    } catch (e) {
      console.warn('Sync fehlgeschlagen', e);
      LS.set(this.snapKey(), this.snapshot);
      this.setStatus(navigator.onLine === false || /fetch|network/i.test(e.message) ? 'offline' : 'error');
      if (this.status === 'error') toast(`Sync-Fehler: ${e.message}`, 4000);
    } finally {
      this.busy = false;
      if (this.again) { this.again = false; this.flush(); }
    }
  },

  /**
   * Neueste Daten anderer Geräte holen (beim Zurückkehren in die App).
   * Läuft nur, wenn lokal nichts mehr aussteht und kein Formular offen ist.
   */
  async refresh(force = false) {
    if (Session.mode !== 'cloud' || !state || this.busy) return;
    if (!force && Date.now() - this.lastPull < 15000) return;
    if (!$('#sheet').hidden) return;
    await this.flush();
    if (this.status !== 'synced') return;
    try {
      const remote = await this.pullAll();
      this.lastPull = Date.now();
      const snap = indexRows(remote);
      if (stableStringify(snap) === stableStringify(this.snapshot)) return;   // nichts Neues
      if (!$('#sheet').hidden || this.busy) return;
      this.snapshot = snap;
      LS.set(this.snapKey(), snap);
      const d = fromRows(remote);
      delete d._isNew;
      state = normalizeData(d);
      LS.set(LS_KEYS.data(Session.user.id), state);
      render();
      toast('Aktualisiert');
    } catch (e) {
      this.setStatus('offline');
    }
  },
};

/** Dezente Statusanzeige im Kopfbereich */
function syncPillHTML() {
  if (Session.mode !== 'cloud') return '<span id="syncPill" hidden></span>';
  const m = {
    loading: ['Lädt …', 'busy'], saving: ['Speichert …', 'busy'], synced: ['Synchronisiert', 'ok'],
    offline: ['Offline · wird nachgeholt', 'warn'], error: ['Nicht synchronisiert', 'err'],
  }[Sync.status] || ['Cloud', 'ok'];
  return `<span id="syncPill" class="sync ${m[1]}" role="status"><i></i>${m[0]}</span>`;
}

window.addEventListener('online', () => { if (Session.mode === 'cloud') Sync.flush(); });
