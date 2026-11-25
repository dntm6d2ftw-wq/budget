'use strict';
/* =========================================================================
   main.js – Start, Anmeldeablauf, zentrale Klick-Steuerung, Export/Import
   ========================================================================= */

/** Nach erfolgreichem Login / Demo-Start: Daten laden und App anzeigen */
async function enterApp() {
  // App-Gerüst sofort zeigen, Inhalt als Skeleton, bis die (Cloud-)Daten da sind
  state = null;
  ui.view = 'overview';
  mountApp();
  $('#main').innerHTML = skeletonHTML();
  $$('[data-action="nav"]').forEach((b) => b.classList.toggle('active', b.dataset.view === 'overview'));

  let data = await Session.loadData();
  if (!data && Session.mode === 'demo') data = buildSampleData();
  state = normalizeData(data);
  ensureRateBooked(currentKey());   // Sparrate direkt nach Gehaltseingang abziehen
  save();
  applyTheme(state.settings.theme);
  ui.key = currentKey();
  render();
}

async function startDemo() {
  LS.del(LS_KEYS.data('demo'));   // jede Demo startet frisch
  Session.start({ id: 'demo', email: 'demo@monatsbudget' }, 'demo');
  await enterApp();
  toast('Demo gestartet – viel Spaß beim Ausprobieren!');
}

/** 1-Klick-Gastzugang: eigenes, dauerhaftes Profil pro Browser – ohne Registrierung */
async function startGuest() {
  Session.start({ id: 'guest', email: 'gast' }, 'guest');
  await enterApp();
  toast('Willkommen! Deine Daten bleiben auf diesem Gerät.');
}

async function logout() {
  closeSheet();
  await Session.end();
  state = null;
  ui.authTab = 'login';
  applyTheme(LS.get(LS_KEYS.theme, 'auto'));
  renderAuth();
}

/* ---------- Export / Import ---------- */
function download(filename, content, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

/** CSV mit Semikolon & Dezimalkomma → öffnet direkt korrekt in Excel */
function exportCSV() {
  const cell = (v) => {
    const s = typeof v === 'number' ? String(round2(v)).replace('.', ',') : String(v ?? '');
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = [['Monat', 'Zeitraum', 'Typ', 'Kategorie', 'Datum', 'Titel', 'Betrag', 'Notiz', 'Liter', 'Literpreis', 'km-Stand']];
  Object.keys(state.cycles).sort().forEach((k) => {
    const c = state.cycles[k], r = cycleRange(k), name = cycleLabel(k), rl = `${fmtDate(r.start)} - ${fmtDate(r.end)}`;
    if (c.salary) rows.push([name, rl, 'Einnahme', 'Gehalt', fmtDate(r.start), 'Gehalt', c.salary, '', '', '', '']);
    c.incomes.forEach((i) => rows.push([name, rl, 'Einnahme', 'Zusatzeinnahme', fmtDate(i.date), i.title, i.amount, i.note || '', '', '', '']));
    subsForCycle(k).forEach((x) => rows.push([name, rl, 'Ausgabe', CATS.subs.long, fmtDate(x.date), x.ct.name, -x.amount, x.ct.note || '', '', '', '']));
    c.expenses.forEach((e) => rows.push([name, rl, 'Ausgabe', CATS[e.cat].long + (e.sub ? ` / ${e.sub}` : ''), fmtDate(e.date), e.title, -e.amount, e.note || '', e.liters ?? '', e.pricePerLiter ?? '', e.km ?? '']));
  });
  [...state.savings].sort((a, b) => a.date.localeCompare(b.date)).forEach((x) => {
    const r = cycleRange(x.cycle);
    rows.push([cycleLabel(x.cycle), `${fmtDate(r.start)} - ${fmtDate(r.end)}`, x.amount < 0 ? 'Spar-Entnahme' : 'Sparen',
      bucketById(x.bucketId)?.name || '', fmtDate(x.date), { rate: 'Sparrate', extra: 'Gespart', withdrawal: 'Entnahme' }[x.kind], -x.amount, x.note || '', '', '', '']);
  });
  if (rows.length === 1) return toast('Noch keine Daten zum Exportieren');
  download(`monatsbudget_${todayISO()}.csv`, '﻿' + rows.map((r) => r.map(cell).join(';')).join('\r\n'), 'text/csv;charset=utf-8');
  toast('CSV exportiert');
}

function exportJSON() {
  download(`monatsbudget_backup_${todayISO()}.json`, JSON.stringify(state, null, 2), 'application/json');
  toast('Backup exportiert');
}

$('#importFile').addEventListener('change', async (ev) => {
  const file = ev.target.files[0];
  ev.target.value = '';
  if (!file || !state) return;
  try {
    const data = JSON.parse(await file.text());
    if (!data || typeof data.cycles !== 'object') throw new Error('Format');
    if (!(await askConfirm(`Backup mit ${Object.keys(data.cycles).length} Monaten importieren? Deine aktuellen Daten werden ersetzt.`, 'Importieren'))) return;
    state = normalizeData(data);
    save(); applyTheme(state.settings.theme); closeSheet(); ui.key = currentKey(); render();
    toast('Backup importiert');
  } catch (e) {
    toast('Datei konnte nicht gelesen werden');
  }
});

/* ---------- Zentrale Klick-Steuerung (Event-Delegation über data-action) ---------- */
document.addEventListener('click', async (ev) => {
  const el = ev.target.closest('[data-action]');
  if (!el) return;
  const d = el.dataset;

  switch (d.action) {
    /* Login */
    case 'auth-tab': ui.authTab = d.tab; renderAuth(); break;
    case 'demo': await startDemo(); break;
    case 'guest': await startGuest(); break;

    /* Navigation */
    case 'nav':
      ui.view = d.view;
      if (d.sub) ui.fixedSub = d.sub;
      render(); window.scrollTo({ top: 0 });
      break;
    case 'fixed-sub': ui.fixedSub = d.sub; render(); break;
    case 'prev': ui.key = shiftYM(ui.key, -1); render(); break;
    case 'next': ui.key = shiftYM(ui.key, 1); render(); break;
    case 'archive': openArchive(); break;
    case 'select-cycle': ui.key = d.key; closeSheet(); render(); break;
    case 'settings': openSettings(); break;
    case 'sheet-close': closeSheet(); break;

    /* Erfassen & Bearbeiten */
    case 'add': openEntrySheet({ kind: 'expense', cat: d.cat }); break;
    case 'add-income': openEntrySheet({ kind: 'income' }); break;
    case 'add-contract': openEntrySheet({ kind: 'contract' }); break;
    case 'edit': {
      const e = findEntry(ui.key, d.kind, d.id);
      if (e) openEntrySheet({ kind: d.kind, entry: e, key: ui.key });
      break;
    }
    case 'edit-contract': {
      const ct = state.contracts.find((c) => c.id === d.id);
      if (ct) openEntrySheet({ kind: 'contract', entry: ct });
      break;
    }
    case 'edit-salary': openSalarySheet(); break;

    /* Sparen */
    case 'save-now': openSaveNowSheet(); break;
    case 'withdraw': openWithdrawSheet(d.bucket); break;
    case 'edit-rate': openRateSheet(); break;
    case 'edit-buckets': openBucketsSheet(); break;
    case 'savings-group': openSavingsGroupSheet(d.id); break;
    case 'import-guest': {
      const g = LS.get(LS_KEYS.data('guest'));
      if (!g) break;
      if ((Object.keys(state.cycles).length || state.savings.length) && !(await askConfirm('Gast-Daten übernehmen? Deine aktuellen Cloud-Daten werden dabei ersetzt.', 'Übernehmen', true))) break;
      state = normalizeData({ ...g, settings: { ...g.settings, theme: state.settings.theme } });
      ensureRateBooked(currentKey());
      save(); closeSheet(); ui.key = currentKey(); render();
      toast('Gast-Daten übernommen – werden jetzt synchronisiert');
      break;
    }
    case 'edit-limit': openLimitSheet(d.cat); break;
    case 'copy-fix': {
      const res = copyFixFromPrev(ui.key);
      if (res.added) { save(); render(); toast(`${res.added} Fixkosten aus ${cycleLabel(res.src)} übernommen`); }
      else toast(res.reason === 'exists' ? 'Alle Fixkosten sind bereits vorhanden' : 'Im Vormonat sind keine Fixkosten erfasst');
      break;
    }

    /* Daten */
    case 'export-csv': exportCSV(); break;
    case 'export-json': exportJSON(); break;
    case 'import-json': $('#importFile').click(); break;
    case 'sample':
      if (Object.keys(state.cycles).length && !(await askConfirm('Beispieldaten laden? Deine aktuellen Daten werden ersetzt.', 'Laden', true))) break;
    {
      const sample = buildSampleData();
      sample.settings.theme = state.settings.theme;
      state = normalizeData(sample);
    }
      save(); closeSheet(); ui.key = currentKey(); render(); toast('Beispieldaten geladen');
      break;
    case 'legacy': {
      const old = LS.get(LS_KEYS.legacy);
      if (!old) break;
      if (Object.keys(state.cycles).length && !(await askConfirm('Daten aus Version 1 übernehmen? Deine aktuellen Monatsdaten werden ersetzt (Abos bleiben).', 'Übernehmen'))) break;
      state = normalizeData({ ...old, contracts: state.contracts });
      save(); applyTheme(state.settings.theme); closeSheet(); ui.key = currentKey(); render();
      toast('Daten aus Version 1 übernommen');
      break;
    }
    case 'reset':
      if (!(await askConfirm('Wirklich ALLE Daten dieses Kontos unwiderruflich löschen?', 'Alles löschen', true))) break;
      state = normalizeData({ settings: { theme: state.settings.theme } });
      save(); closeSheet(); ui.key = currentKey(); render(); toast('Alle Daten gelöscht');
      break;
    case 'logout':
      if (Session.mode === 'demo' || (await askConfirm(Session.mode === 'guest'
        ? 'Abmelden? Deine Gastdaten bleiben auf diesem Gerät und sind beim nächsten „Als Gast fortfahren“ wieder da.'
        : 'Möchtest du dich abmelden?', 'Abmelden'))) await logout();
      break;
    default: break;
  }
});

document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && !sheetEl.hidden) closeSheet();
});

/* Tageswechsel (App bleibt offen / kommt aus dem Hintergrund) → neu berechnen */
let lastDay = todayISO();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !state) return;
  if (todayISO() !== lastDay) {
    const wasCurrent = ui.key === cycleKeyForDate(lastDay);
    lastDay = todayISO();
    if (wasCurrent) ui.key = currentKey();
    if (ensureRateBooked(currentKey())) save();   // neuer Gehaltszyklus → Sparrate buchen
    render();
  }
  Sync.refresh();   // Änderungen von anderen Geräten holen
});
// Solange die App offen ist: alle 2 Minuten mit der Cloud abgleichen
setInterval(() => { if (document.visibilityState === 'visible') Sync.refresh(); }, 120000);
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => applyTheme(state ? state.settings.theme : LS.get(LS_KEYS.theme, 'auto')));

/* ---------- Start ---------- */
(async function boot() {
  applyTheme(LS.get(LS_KEYS.theme, 'auto'));
  if (await Session.restore()) await enterApp();
  else renderAuth();

  // PWA: Offline-Cache + Auto-Update, danach dezenter Installationshinweis
  registerServiceWorker();
  setTimeout(showInstallHint, 1500);
})();
