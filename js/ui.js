'use strict';
/* =========================================================================
   ui.js – Oberfläche
   -------------------------------------------------------------------------
   1. Zustand & Navigation      5. Reiter: Fixkosten & Abos
   2. Login-Screen              6. Reiter: variable Kategorien
   3. App-Gerüst                7. Sheets (Formulare, Einstellungen, Archiv)
   4. Übersicht (Dashboard)     8. Theme & Toast
   ========================================================================= */

/* ---------- 1. Zustand & Navigation ---------- */
const ui = { view: 'overview', key: null, fixedSub: 'general', authTab: 'login' };

const NAV = [
  { id: 'overview', label: 'Übersicht', title: 'Übersicht',            icon: 'home' },
  { id: 'fixed',    label: 'Fixkosten', title: 'Fixkosten & Abos',     icon: 'doc' },
  { id: 'daily',    label: 'Alltag',    title: 'Laufende Kosten',      icon: 'cart' },
  { id: 'fuel',     label: 'Tanken',    title: 'Tankkosten',           icon: 'fuel' },
  { id: 'hobby',    label: 'Freizeit',  title: 'Hobby & Freizeit',     icon: 'star' },
  { id: 'misc',     label: 'Sonstiges', title: 'Sonstiges & Einfälle', icon: 'bulb' },
  { id: 'savings',  label: 'Sparen',    title: 'Sparen & Vermögen',    icon: 'piggy' },
];

const root = $('#root');
const tile = (iconName, color, cls = '') => `<span class="tile ${cls}" style="--c:${color}">${icon(iconName)}</span>`;

/* ---------- 2. Login-Screen ---------- */
function renderAuth(errorMsg = '') {
  const reg = ui.authTab === 'register';
  root.innerHTML = `
    <main class="auth">
      <div class="auth-card">
        <div class="app-icon">€</div>
        <h1>Monatsbudget</h1>
        <p class="lead">Dein Gehalt. Dein Monat. Volle Kontrolle.</p>

        <div class="seg" role="tablist">
          <button data-action="auth-tab" data-tab="login" class="${reg ? '' : 'on'}">Anmelden</button>
          <button data-action="auth-tab" data-tab="register" class="${reg ? 'on' : ''}">Registrieren</button>
        </div>

        <form id="authForm" novalidate>
          <div class="group">
            <div class="frow"><input type="email" name="email" placeholder="E-Mail" autocomplete="email" inputmode="email" required /></div>
            <div class="frow"><input type="password" name="password" placeholder="Passwort${reg ? ' (mind. 6 Zeichen)' : ''}" autocomplete="${reg ? 'new-password' : 'current-password'}" required /></div>
            ${reg ? '<div class="frow"><input type="password" name="password2" placeholder="Passwort wiederholen" autocomplete="new-password" required /></div>' : ''}
          </div>
          <p class="err" id="authErr">${esc(errorMsg)}</p>
          <button class="btn" type="submit" id="authBtn">${reg ? 'Konto erstellen' : 'Anmelden'}</button>
        </form>

        <div class="divider">oder</div>
        <button class="btn secondary" data-action="guest">${icon('person')} Als Gast fortfahren</button>
        <button class="link demo-link" data-action="demo">${icon('spark')} Demo mit Beispieldaten ansehen</button>

        <p class="footnote">Als Gast startest du ohne Konto – deine Daten bleiben privat auf diesem Gerät.<br>${CLOUD_ENABLED
          ? 'Deine Daten werden verschlüsselt übertragen und sind nur für dich sichtbar.'
          : 'Lokaler Modus: Konten und Daten werden privat in diesem Browser gespeichert. Für geräteübergreifende Konten Supabase in <code>js/config.js</code> eintragen.'}</p>
      </div>
    </main>`;

  document.body.dataset.screen = 'auth';
  $('#authForm').addEventListener('submit', onAuthSubmit);
}

async function onAuthSubmit(ev) {
  ev.preventDefault();
  const f = ev.target.elements;
  const email = f.email.value.trim(), pw = f.password.value;
  const err = (m) => { $('#authErr').textContent = m; };
  if (!EMAIL_RE.test(email)) return err('Bitte gib eine gültige E-Mail-Adresse ein.');
  if (pw.length < 6) return err('Das Passwort muss mindestens 6 Zeichen lang sein.');
  if (ui.authTab === 'register' && pw !== f.password2.value) return err('Die Passwörter stimmen nicht überein.');

  const btn = $('#authBtn');
  btn.disabled = true; btn.style.opacity = .6;
  try {
    const backend = Session.authBackend;
    const user = ui.authTab === 'register' ? await backend.signUp(email, pw) : await backend.signIn(email, pw);
    if (user.needsConfirm) {
      ui.authTab = 'login';
      renderAuth();
      return toast('Fast geschafft! Bitte bestätige den Link in deinem Postfach.', 4000);
    }
    Session.start(user, backend.name);
    await enterApp();
    toast(ui.authTab === 'register' ? 'Willkommen! 👋' : 'Willkommen zurück');
  } catch (e) {
    err(e.message);
    btn.disabled = false; btn.style.opacity = 1;
  }
}

/* ---------- 3. App-Gerüst ---------- */
function mountApp() {
  document.body.dataset.screen = 'app';
  const navBtn = (n, cls) => `<button class="${cls}" data-action="nav" data-view="${n.id}">${icon(n.icon)}<span>${n.label}</span></button>`;
  root.innerHTML = `
    <div class="app">
      <aside class="sidebar" aria-label="Navigation">
        <div class="brand"><span class="app-icon">€</span>Monatsbudget</div>
        <button class="btn small side-add" data-action="add">${icon('plus')} Neuer Eintrag</button>
        ${NAV.map((n) => navBtn(n, 'side-item')).join('')}
        <div class="side-foot">
          <button class="side-item" data-action="settings" style="width:100%">${icon('person')}<span id="sideUser"></span></button>
        </div>
      </aside>
      <main class="main" id="main"></main>
      <nav class="tabbar" aria-label="Navigation">
        ${NAV.slice(0, 3).map((n) => navBtn(n, 'tab')).join('')}
        <button class="tab-plus" data-action="add" aria-label="Neuer Eintrag"><span>${icon('plus')}</span></button>
        ${NAV.slice(3).map((n) => navBtn(n, 'tab')).join('')}
      </nav>
    </div>`;
}

function render() {
  if (!state || !$('#main')) return;
  if (!ui.key) ui.key = currentKey();
  $$('[data-action="nav"]').forEach((b) => b.classList.toggle('active', b.dataset.view === ui.view));
  const who = { demo: 'Demo-Modus', guest: 'Gast' }[Session.mode] || Session.user.email;
  $('#sideUser').textContent = who;

  const nav = NAV.find((n) => n.id === ui.view) || NAV[0];
  const isCur = ui.key === currentKey();
  const s = stats(ui.key);
  const pill = isCur ? '<span class="pill">Aktuell</span>' : s.status === 'future' ? '<span class="pill gray">Geplant</span>' : '<span class="pill gray">Archiv</span>';

  const body = {
    overview: renderOverview, fixed: renderFixed, savings: renderSavings,
  }[ui.view] || (() => renderVarCat(ui.view));

  $('#main').innerHTML = `
    <header class="header">
      <h1 class="large-title">${nav.title}</h1>
      <div class="hdr-r">${syncPillHTML()}
      <button class="avatar" data-action="settings" aria-label="Konto & Einstellungen">${esc((who[0] || '?').toUpperCase())}</button></div>
    </header>
    <div class="cycle">
      <button class="chev" data-action="prev" aria-label="Vorheriger Monat">${icon('chevL')}</button>
      <button class="cycle-mid" data-action="archive" aria-label="Monatsarchiv">
        <b>${cycleLabel(ui.key)} ${pill}</b><small class="num">${rangeLabel(ui.key)}</small>
      </button>
      <button class="chev" data-action="next" aria-label="Nächster Monat">${icon('chevR')}</button>
    </div>
    ${Session.mode === 'demo' ? `<div class="demo-banner"><span>✨ <b>Demo-Modus</b> <span class="t2">– Beispieldaten, nur lokal</span></span><button class="link" data-action="logout">Eigenes Konto erstellen</button></div>` : ''}
    ${body(s)}`;
}

/** Listenzeile für Buchungen, Einnahmen und Abos */
function entryRow(e, kind, opts = {}) {
  const isInc = kind === 'income';
  const meta = isInc ? INCOME_META : CATS[e.cat];
  const sub = [];
  if (opts.showDate !== false) sub.push(relDay(e.date));
  if (e.sub) sub.push(esc(e.sub));
  if (e.cat === 'fuel' && e.liters) sub.push(`${num(e.liters, 1)} l · ${num(e.pricePerLiter || e.amount / e.liters, 3)} €/l`);
  if (e.note) sub.push(esc(e.note));
  return `
    <button class="row has-tile" data-action="edit" data-kind="${kind}" data-id="${e.id}">
      ${tile(meta.icon, meta.color)}
      <span class="main-col"><div class="title">${esc(e.title)}</div>${sub.length ? `<div class="sub">${sub.join(' · ')}</div>` : ''}</span>
      <span class="trail ${isInc ? 'pos' : ''}">${isInc ? '+' : '−'}${eur(e.amount)}</span>
    </button>`;
}

const emptyBox = (iconName, color, text) => `<div class="group"><div class="empty">${tile(iconName, color, 'lg')}${text}</div></div>`;

/* ---------- 4. Übersicht ---------- */
function renderOverview(s) {
  const t = todayISO();
  const isEmpty = !Object.keys(state.cycles).length && !state.contracts.length;
  const nextPay = addDaysISO(s.r.end, 1);

  const meta = s.status === 'current'
    ? `Noch ${s.daysLeft} ${s.daysLeft === 1 ? 'Tag' : 'Tage'} · Gehalt am ${fmtWDM(nextPay)}`
    : s.status === 'past' ? 'Zyklus abgeschlossen' : `Beginnt am ${fmtWDM(s.r.start)}`;

  // Gestapelter Balken: Fixkosten | Abos | variable Ausgaben | frei
  const parts = [
    { label: 'Fixkosten', v: s.fixPlanned, c: CATS.fix.color },
    { label: 'Abos', v: s.subsPlanned, c: CATS.subs.color },
    { label: 'Ausgaben', v: s.variable, c: CATS.daily.color },
    { label: 'Gespart', v: Math.max(0, s.saved), c: SAVE_META.color },
    { label: 'Frei', v: Math.max(0, s.free), c: 'var(--green)' },
  ];
  const base = Math.max(s.income, s.fixedTotal + s.variable + Math.max(0, s.saved)) || 1;

  const welcome = isEmpty ? `
    <div class="group" style="margin-bottom:16px"><div class="empty" style="padding:24px 18px">
      ${tile('spark', 'var(--blue)', 'lg')}
      <b style="color:var(--text);font-size:17px">Willkommen bei Monatsbudget!</b><br>
      Trage dein Gehalt ein – oder schau dir die App mit Beispieldaten an.
      <div class="btn-row"><button class="btn small secondary" data-action="sample" style="flex:1">Beispieldaten laden</button>
      <button class="btn small" data-action="edit-salary" style="flex:1">Gehalt eintragen</button></div>
      ${Session.mode === 'cloud' && LS.get(LS_KEYS.data('guest')) ? '<div class="mt"><button class="link" data-action="import-guest">Gast-Daten dieses Geräts in die Cloud übernehmen</button></div>' : ''}
      ${LS.get(LS_KEYS.legacy) ? '<div class="mt"><button class="link" data-action="legacy">Daten aus Version 1 übernehmen</button></div>' : ''}
    </div></div>` : '';

  // Erinnerungen (Kündigungsfristen)
  const rem = reminders();
  const remHTML = rem.length ? `
    <div class="section-h"><span>Erinnerungen</span></div>
    <div class="group tiles">${rem.map(({ ct, d }) => `
      <button class="row has-tile" data-action="edit-contract" data-id="${ct.id}">
        ${tile('bell', 'var(--orange)')}
        <span class="main-col"><div class="title">${esc(ct.name)} kündigen?</div>
        <div class="sub">Kündbar bis ${fmtDate(d.by)} · sonst Verlängerung bis ${fmtDate(shiftDateMonth(d.end, Math.max(1, Number(ct.renew) || 12)))}</div></span>
        <span class="trail warn">${d.days === 0 ? 'heute' : `${d.days} T.`}</span>
      </button>`).join('')}</div>` : '';

  // Einnahmen-Modul
  const incomes = [...s.c.incomes].sort((a, b) => b.date.localeCompare(a.date));
  const incomeHTML = `
    <div class="section-h"><span>Einnahmen</span><span class="num">${eur(s.income)}</span></div>
    <div class="group tiles">
      <button class="row has-tile" data-action="edit-salary">
        ${tile('wallet', INCOME_META.color)}
        <span class="main-col"><div class="title">Gehalt</div><div class="sub">Eingang ${fmtWDM(s.r.start)}</div></span>
        <span class="trail ${s.salary ? '' : 't3'}">${s.salary ? eur(s.salary) : 'eintragen'}</span>
        <span class="chevron">${icon('chevR')}</span>
      </button>
      ${incomes.map((e) => entryRow(e, 'income')).join('')}
      <button class="row action has-tile" data-action="add-income">
        <span class="tile" style="--c:transparent;color:var(--blue)">${icon('plusc')}</span><span>Einnahme hinzufügen</span>
      </button>
    </div>`;

  // Ausgaben je Kategorie (Soll/Ist)
  const catRow = (k) => {
    const m = CATS[k];
    let bar, trail, sub;
    if (k === 'fix' || k === 'subs') {
      const planned = k === 'fix' ? s.fixPlanned : s.subsPlanned;
      const paid = k === 'fix' ? s.fixPaid : s.subsPaid;
      bar = `<div class="bar"><span style="width:${planned ? clamp(paid / planned * 100, 0, 100) : 0}%;background:${m.color}"></span></div>`;
      trail = `${eur(planned)}<small>${eur(paid)} abgebucht</small>`;
    } else {
      const spent = s.byCat[k], lim = Number(s.c.limits[k]) || 0;
      bar = lim ? `<div class="bar"><span class="${limitClass(spent, lim)}" style="width:${clamp(spent / lim * 100, 0, 100)}%"></span></div>` : '';
      trail = `${eur(spent)}<small>${lim ? `von ${eur(lim)}` : 'kein Limit'}</small>`;
    }
    sub = bar;
    const target = k === 'subs' || k === 'fix' ? `data-view="fixed" data-sub="${k === 'subs' ? 'subs' : 'general'}"` : `data-view="${k}"`;
    return `<button class="row has-tile" data-action="nav" ${target}>
      ${tile(m.icon, m.color)}
      <span class="main-col"><div class="title">${k === 'fix' ? 'Fixkosten' : k === 'subs' ? 'Abos & Verträge' : m.long}</div>${sub}</span>
      <span class="trail">${trail}</span>
    </button>`;
  };

  // Anstehende Abbuchungen im Zyklus
  const upcoming = [
    ...s.c.expenses.filter((e) => e.cat === 'fix' && e.date > t).map((e) => ({ title: e.title, date: e.date, amount: e.amount, cat: 'fix', action: `data-action="edit" data-kind="expense" data-id="${e.id}"` })),
    ...s.subs.filter((x) => !x.paid).map((x) => ({ title: x.ct.name, date: x.date, amount: x.amount, cat: 'subs', action: `data-action="edit-contract" data-id="${x.ct.id}"` })),
  ].sort((a, b) => a.date.localeCompare(b.date));

  const upcomingHTML = upcoming.length ? `
    <div class="section-h"><span>Anstehende Abbuchungen</span><span class="num">${eur(sum(upcoming.map((u) => u.amount)))}</span></div>
    <div class="group tiles">${upcoming.slice(0, 5).map((u) => `
      <button class="row has-tile" ${u.action}>${tile(CATS[u.cat].icon, CATS[u.cat].color)}
        <span class="main-col"><div class="title">${esc(u.title)}</div><div class="sub">${relDay(u.date)}</div></span>
        <span class="trail">−${eur(u.amount)}</span></button>`).join('')}</div>` : '';

  // Letzte Buchungen
  const recent = [
    ...s.c.expenses.filter((e) => e.cat !== 'fix').map((e) => ({ e, kind: 'expense' })),
    ...s.c.incomes.map((e) => ({ e, kind: 'income' })),
  ].sort((a, b) => (b.e.date + (b.e.created || '')).localeCompare(a.e.date + (a.e.created || ''))).slice(0, 6);

  return `
    ${welcome}
    <section class="hero" aria-label="Frei verfügbar">
      <div class="lbl"><span>Frei verfügbar</span><span>${s.free < 0 ? '<span class="neg">überzogen</span>' : ''}</span></div>
      <div class="big ${s.free < 0 ? 'neg' : ''}">${eur(s.free)}</div>
      <div class="meta">${meta}</div>
      <div class="stackbar" role="img" aria-label="Aufteilung der Einnahmen">${parts.filter((p) => p.v > 0).map((p) => `<span style="width:${p.v / base * 100}%;background:${p.c}" title="${p.label}: ${eur(p.v)}"></span>`).join('')}</div>
      <div class="legend">${parts.map((p) => `<div><i style="background:${p.c}"></i><span>${p.label}</span><b>${eur(p.v)}</b></div>`).join('')}</div>
    </section>

    <div class="tiles2">
      <div class="stat"><div class="lbl">${icon('cal')} Tagesbudget</div>
        <div class="val ${s.perDay < 0 ? 'neg' : ''}">${s.daysLeft > 0 ? eur(s.perDay) : '–'}</div>
        <div class="hint">${s.daysLeft > 0 ? `für ${s.daysLeft} ${s.daysLeft === 1 ? 'Tag' : 'Tage'}` : 'Zyklus beendet'}</div></div>
      <div class="stat"><div class="lbl">${icon('out')} Ausgegeben</div>
        <div class="val">${eur(s.variable + s.fixPaid + s.subsPaid)}</div>
        <div class="hint">inkl. ${eur(s.fixPaid + s.subsPaid)} Fixkosten</div></div>
    </div>

    <div class="group tiles mt">
      <button class="row has-tile" data-action="nav" data-view="savings">
        ${tile(SAVE_META.icon, SAVE_META.color)}
        <span class="main-col"><div class="title">Gespart diesen Monat</div>
        <div class="sub">Sparquote ${pct(s.saveRate)} · Vermögen ${eur(totalWealth())}</div></span>
        <span class="trail" style="color:${SAVE_META.color};font-weight:600">${eur(s.saved)}</span>
        <span class="chevron">${icon('chevR')}</span>
      </button>
      <button class="row action has-tile" data-action="save-now">
        <span class="tile" style="--c:transparent;color:var(--blue)">${icon('plusc')}</span><span>Jetzt sparen</span>
      </button>
    </div>

    ${remHTML}
    ${incomeHTML}

    <div class="section-h"><span>Ausgaben nach Kategorie</span><span class="num">${eur(s.fixedTotal + s.variable)}</span></div>
    <div class="group tiles">${['fix', 'subs', ...VAR_CATS].map(catRow).join('')}</div>
    <p class="section-f">Fixkosten & Abos zählen vollständig als geplant – auch wenn sie noch nicht abgebucht sind.</p>

    ${upcomingHTML}

    <div class="section-h"><span>Letzte Buchungen</span></div>
    ${recent.length ? `<div class="group tiles">${recent.map((x) => entryRow(x.e, x.kind)).join('')}</div>`
      : emptyBox('cart', CATS.daily.color, 'Noch keine Buchungen.<br>Tippe auf <b>+</b>, um loszulegen.')}`;
}

/* ---------- 5. Fixkosten & Abos ---------- */
function renderFixed(s) {
  const seg = `<div class="seg">
    <button data-action="fixed-sub" data-sub="general" class="${ui.fixedSub === 'general' ? 'on' : ''}">Allgemeine Fixkosten</button>
    <button data-action="fixed-sub" data-sub="subs" class="${ui.fixedSub === 'subs' ? 'on' : ''}">Abos & Verträge</button>
  </div>`;
  return seg + (ui.fixedSub === 'subs' ? renderSubs(s) : renderGeneralFix(s));
}

function renderGeneralFix(s) {
  const t = todayISO();
  const items = s.c.expenses.filter((e) => e.cat === 'fix').sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
  return `
    <div class="group summary">
      <div class="t2" style="font-size:15px">Geplant in diesem Zyklus</div>
      <div class="big">${eur(s.fixPlanned)}</div>
      <div class="bar"><span style="width:${s.fixPlanned ? clamp(s.fixPaid / s.fixPlanned * 100, 0, 100) : 0}%;background:${CATS.fix.color}"></span></div>
      <div class="row-2"><span>${eur(s.fixPaid)} abgebucht</span><span>${eur(s.fixPlanned - s.fixPaid)} offen</span></div>
      <div class="btn-row">
        <button class="btn small secondary" data-action="copy-fix">${icon('copy')} Aus Vormonat</button>
        <button class="btn small" data-action="add" data-cat="fix">${icon('plus')} Hinzufügen</button>
      </div>
    </div>
    <div class="section-h"><span>Positionen</span><span>${items.length}</span></div>
    ${items.length ? `<div class="group tiles">${items.map((e) => `
      <button class="row has-tile" data-action="edit" data-kind="expense" data-id="${e.id}">
        ${tile(CATS.fix.icon, CATS.fix.color)}
        <span class="main-col"><div class="title">${esc(e.title)}</div>
        <div class="sub">${e.date <= t ? `✓ abgebucht am ${fmtDM(e.date)}` : `fällig ${relDay(e.date)}`}${e.note ? ' · ' + esc(e.note) : ''}</div></span>
        <span class="trail">−${eur(e.amount)}</span>
      </button>`).join('')}</div>`
      : emptyBox('doc', CATS.fix.color, 'Noch keine Fixkosten in diesem Monat.<br>Miete, Strom, Versicherungen, Kredite …<br>oder einfach <b>aus dem Vormonat übernehmen</b>.')}
    <p class="section-f">Allgemeine Fixkosten gelten pro Monat. Abos & Verträge werden dagegen automatisch jeden Monat berücksichtigt.</p>`;
}

function renderSubs(s) {
  const active = state.contracts.filter((c) => !c.paused && !(c.cancelled && c.end && c.end < todayISO()));
  const inactive = state.contracts.filter((c) => !active.includes(c));
  const monthly = sum(active.map((c) => c.amount));
  const inCycle = new Map(s.subs.map((x) => [x.ct.id, x]));

  const row = (ct) => {
    const x = inCycle.get(ct.id);
    const d = contractDeadline(ct);
    const info = [`monatlich am ${ct.day}.`];
    if (ct.paused) info.push('pausiert');
    else if (ct.cancelled) info.push(ct.end ? `gekündigt zum ${fmtDate(ct.end)}` : 'gekündigt');
    else if (x) info.push(x.paid ? `✓ abgebucht ${fmtDM(x.date)}` : `nächste ${relDay(x.date)}`);
    const warn = d && d.days <= 60;
    return `<button class="row has-tile" data-action="edit-contract" data-id="${ct.id}">
      ${tile(warn ? 'bell' : 'repeat', warn ? 'var(--orange)' : CATS.subs.color)}
      <span class="main-col"><div class="title">${esc(ct.name)}</div>
      <div class="sub">${info.join(' · ')}${d ? ` · <span class="${warn ? 'warn' : ''}">kündbar bis ${fmtDate(d.by)}</span>` : ''}</div></span>
      <span class="trail ${ct.paused || ct.cancelled ? 't3' : ''}">${eur(ct.amount)}</span>
    </button>`;
  };

  return `
    <div class="group summary">
      <div class="t2" style="font-size:15px">Abos & Verträge pro Monat</div>
      <div class="big">${eur(monthly)}</div>
      <div class="row-2"><span>${eur(monthly * 12)} pro Jahr</span><span>${active.length} aktiv</span></div>
      <div class="row-2"><span>Diesen Zyklus: ${eur(s.subsPaid)} abgebucht</span><span>${eur(s.subsPlanned - s.subsPaid)} offen</span></div>
      <div class="btn-row"><button class="btn small" data-action="add-contract">${icon('plus')} Abo / Vertrag hinzufügen</button></div>
    </div>
    <div class="section-h"><span>Aktiv</span><span>${active.length}</span></div>
    ${active.length ? `<div class="group tiles">${active.map(row).join('')}</div>`
      : emptyBox('repeat', CATS.subs.color, 'Noch keine Abos erfasst.<br>Streaming, Fitnessstudio, Handyvertrag, Cloud …')}
    ${inactive.length ? `<div class="section-h"><span>Pausiert & beendet</span></div><div class="group tiles">${inactive.map(row).join('')}</div>` : ''}
    <p class="section-f">Trage Vertragsende und Kündigungsfrist ein – die App erinnert dich 60 Tage vor Fristende.</p>`;
}

/* ---------- 6. Variable Kategorien (Alltag, Tanken, Freizeit, Sonstiges) ---------- */
function renderVarCat(cat) {
  const s = stats(ui.key);
  const m = CATS[cat];
  const items = s.c.expenses.filter((e) => e.cat === cat).sort((a, b) => b.date.localeCompare(a.date) || (b.created || '').localeCompare(a.created || ''));
  const spent = s.byCat[cat];
  const lim = Number(s.c.limits[cat]) || 0;
  const cls = limitClass(spent, lim);

  // Nach Tagen gruppieren (wie in Wallet)
  const days = [];
  items.forEach((e) => {
    const last = days[days.length - 1];
    if (last && last.date === e.date) last.items.push(e); else days.push({ date: e.date, items: [e] });
  });

  let fuelHTML = '';
  if (cat === 'fuel') {
    const f = fuelStats(ui.key);
    fuelHTML = `
      <div class="tiles2">
        <div class="stat"><div class="lbl">Getankt</div><div class="val">${num(f.liters, 1)} l</div><div class="hint">in diesem Zyklus</div></div>
        <div class="stat"><div class="lbl">Ø Literpreis</div><div class="val">${f.avgPrice ? num(f.avgPrice, 3) + ' €' : '–'}</div>
          <div class="hint">${f.consumption ? `Ø ${num(f.consumption, 1)} l/100 km` : 'Verbrauch: km-Stand angeben'}</div></div>
      </div>`;
  }

  const empty = {
    daily: 'Lebensmittel, Drogerie, Bäcker, Haushalt …',
    fuel: 'Betrag, Datum – optional Liter & Literpreis.',
    hobby: 'Sport, Kino, Restaurant, Ausflüge …',
    misc: 'Spontane Ausgaben & Einfälle – immer mit kurzer Notiz.',
  }[cat];

  return `
    <div class="group summary">
      <div class="t2" style="font-size:15px">Ausgegeben</div>
      <div class="big">${eur(spent)}</div>
      ${lim ? `<div class="bar"><span class="${cls}" style="width:${clamp(spent / lim * 100, 0, 100)}%"></span></div>
        <div class="row-2"><span class="${cls === 'over' ? 'neg' : cls === 'mid' ? 'warn' : ''}">${spent > lim ? `${eur(spent - lim)} über Limit` : `Noch ${eur(lim - spent)} frei`}</span><span>Limit ${eur(lim)}</span></div>`
        : '<div class="row-2"><span>Kein Monatslimit festgelegt</span></div>'}
      <div class="btn-row">
        <button class="btn small secondary" data-action="edit-limit" data-cat="${cat}">${lim ? 'Limit ändern' : 'Limit festlegen'}</button>
        <button class="btn small" data-action="add" data-cat="${cat}">${icon('plus')} Hinzufügen</button>
      </div>
    </div>
    ${fuelHTML}
    ${days.length ? days.map((d) => `
      <div class="section-h"><span>${relDay(d.date)}</span><span class="num">−${eur(sum(d.items.map((e) => e.amount)))}</span></div>
      <div class="group tiles">${d.items.map((e) => entryRow(e, 'expense', { showDate: false })).join('')}</div>`).join('')
      : `<div class="section-h"><span>Einträge</span></div>${emptyBox(m.icon, m.color, `Noch keine Einträge.<br>${empty}`)}`}`;
}

/* ---------- 6b. Sparen & Vermögen ---------- */
/** Donut-Diagramm (SVG) – Segmente { v, c } */
function donutSVG(segs, big, small) {
  const R = 40, C = 2 * Math.PI * R, tot = sum(segs.map((x) => x.v));
  const vis = segs.filter((x) => x.v > 0);
  const gap = vis.length > 1 ? 1.5 : 0;
  let off = 0;
  const arcs = tot > 0 ? vis.map((x) => {
    const len = (x.v / tot) * C;
    const el = `<circle r="${R}" cx="50" cy="50" fill="none" stroke="${x.c}" stroke-width="11" stroke-dasharray="${Math.max(len - gap, 0.01)} ${C}" stroke-dashoffset="${-off}" transform="rotate(-90 50 50)"/>`;
    off += len;
    return el;
  }).join('') : '';
  return `<svg class="donut" viewBox="0 0 100 100" role="img" aria-label="Verteilung des Vermögens">
    <circle r="${R}" cx="50" cy="50" fill="none" stroke="var(--fill)" stroke-width="11"/>${arcs}
    <text x="50" y="51" class="d-big">${esc(big)}</text><text x="50" y="62" class="d-small">${esc(small)}</text></svg>`;
}

function renderSavings(s) {
  const total = totalWealth();
  const shown = state.buckets.filter((b) => !b.archived || bucketBalance(b.id) !== 0);
  const pSum = percentSum();
  const rate = Number(s.c.savingsRate) || 0;
  const rateBooked = state.savings.some((x) => x.groupId === rateGroupId(ui.key));
  const groups = savingsGroups();

  const rateSub = !rate ? 'Keine feste Sparrate festgelegt'
    : rateBooked ? `✓ Am ${fmtWDM(s.r.start)} gebucht und aufgeteilt`
    : s.status === 'future' ? `Wird am ${fmtWDM(s.r.start)} automatisch gebucht`
    : pSum !== 100 ? 'Wartet auf gültige Aufteilung (100 %)' : 'Wird gebucht';

  const card = (b) => {
    const bal = bucketBalance(b.id), inC = bucketInCycle(b.id, ui.key);
    return `<button class="wcard" style="--c:${b.color}" data-action="withdraw" data-bucket="${b.id}" aria-label="${esc(b.name)}: ${eur(bal)}">
      <div class="top"><span>${esc(b.name)}</span><span class="pct">${b.archived ? 'archiviert' : `${num(b.percent, b.percent % 1 ? 1 : 0)} %`}</span></div>
      <div><div class="bal">${eur(bal)}</div>
      <div class="foot"><span>${inC >= 0 ? '+' : '−'}${eur(Math.abs(inC))} diesen Monat</span><span>${total > 0 ? pct(Math.max(0, bal) / total) : '0 %'}</span></div>
      <div class="share"><span style="width:${total > 0 ? clamp(bal / total * 100, 0, 100) : 0}%"></span></div></div>
    </button>`;
  };

  const groupRow = (g) => {
    const isW = g.kind === 'withdrawal';
    const title = g.kind === 'rate' ? `Sparrate ${cycleLabel(g.cycle)}` : isW ? `Entnahme · ${esc(bucketById(g.items[0].bucketId)?.name || 'Topf')}` : 'Gespart';
    const split = isW ? esc(g.note) : g.items.map((i) => `${esc(bucketById(i.bucketId)?.name || '?')} ${eur(i.amount)}`).join(' · ');
    return `<button class="row has-tile" data-action="savings-group" data-id="${esc(g.id)}">
      ${tile(isW ? 'out' : 'piggy', isW ? 'var(--orange)' : SAVE_META.color)}
      <span class="main-col"><div class="title">${title}${g.kind === 'extra' && g.note ? ` · ${esc(g.note)}` : ''}</div><div class="sub">${relDay(g.date)}${split ? ' · ' + split : ''}</div></span>
      <span class="trail ${isW ? 'warn' : ''}" style="${isW ? '' : `color:${SAVE_META.color}`}">${isW ? '−' : '+'}${eur(Math.abs(g.amount))}</span>
    </button>`;
  };

  return `
    <section class="hero">
      <div class="lbl"><span>Gesamtvermögen</span><span>alle Monate</span></div>
      <div class="big">${eur(total)}</div>
      <div class="meta">${cycleLabel(ui.key)}: ${eur(s.saved)} gespart · Sparquote ${pct(s.saveRate)}</div>
      <div class="wealth">
        ${donutSVG(shown.map((b) => ({ v: Math.max(0, bucketBalance(b.id)), c: b.color })), pct(s.saveRate), 'Sparquote')}
        <div class="legend one">${shown.map((b) => `<div><i style="background:${b.color}"></i><span>${esc(b.name)}</span><b>${eur(bucketBalance(b.id))}</b></div>`).join('')}</div>
      </div>
      <div class="btn-row">
        <button class="btn small" data-action="save-now">${icon('plus')} Jetzt sparen</button>
        <button class="btn small secondary" data-action="withdraw">${icon('out')} Entnehmen</button>
      </div>
    </section>

    ${pSum !== 100 ? `<div class="callout warn-box mt"><span>Deine Aufteilung ergibt <b>${num(pSum, pSum % 1 ? 1 : 0)} %</b> statt 100 %.</span><button class="link" data-action="edit-buckets">Anpassen</button></div>` : ''}

    <div class="section-h"><span>Monatliche Sparrate</span></div>
    <div class="group tiles">
      <button class="row has-tile" data-action="edit-rate">
        ${tile('piggy', SAVE_META.color)}
        <span class="main-col"><div class="title">${cycleLabel(ui.key)}</div><div class="sub">${rateSub}</div></span>
        <span class="trail">${rate ? eur(rate) : 'festlegen'}</span><span class="chevron">${icon('chevR')}</span>
      </button>
    </div>
    <p class="section-f">Die Sparrate wird direkt nach dem Gehaltseingang vom frei verfügbaren Budget abgezogen und automatisch auf deine Töpfe verteilt – sie zählt nicht als Konsumausgabe.</p>

    <div class="section-h"><span>Spartöpfe</span><button data-action="edit-buckets">Bearbeiten</button></div>
    <div class="wallet-grid">${shown.map(card).join('')}</div>
    <p class="section-f">Tippe auf einen Topf, um Geld zurück ins Monatsbudget zu buchen.</p>

    <div class="section-h"><span>Spar-Historie</span><span>${groups.length}</span></div>
    ${groups.length ? `<div class="group tiles">${groups.slice(0, 40).map(groupRow).join('')}</div>
      ${groups.length > 40 ? `<p class="section-f">… und ${groups.length - 40} ältere Buchungen (im CSV-Export enthalten).</p>` : ''}`
      : emptyBox('piggy', SAVE_META.color, 'Noch nichts gespart.<br>Lege eine Sparrate fest oder tippe auf <b>Jetzt sparen</b>.')}`;
}

/** Vorschau der Aufteilung für einen Betrag */
function splitPreviewHTML(v) {
  const parts = new Map(v > 0 ? splitAmount(v).map((x) => [x.bucket.id, x.amount]) : []);
  return activeBuckets().filter((b) => b.percent > 0).map((b) => `
    <div class="row has-tile">${tile('piggy', b.color)}
      <span class="main-col"><div class="title">${esc(b.name)}</div><div class="sub">${num(b.percent, b.percent % 1 ? 1 : 0)} %</div></span>
      <span class="trail">${eur(parts.get(b.id) || 0)}</span></div>`).join('');
}

function openSaveNowSheet() {
  if (percentSum() !== 100) { toast('Bitte zuerst die Aufteilung auf 100 % bringen'); return openBucketsSheet(); }
  openSheet({
    title: 'Jetzt sparen',
    saveLabel: 'Sparen',
    body: `<form>${amountBlock('', 'wird vom frei verfügbaren Budget abgezogen')}
      <div class="section-h"><span>Automatische Aufteilung</span></div>
      <div class="group tiles" id="splitPreview">${splitPreviewHTML(0)}</div>
      <div class="group mt">
        <div class="frow"><label for="svDate">Datum</label><input id="svDate" type="date" name="date" value="${defaultDateFor(ui.key)}" /></div>
        <div class="frow"><label for="svNote">Notiz</label><input id="svNote" name="note" maxlength="80" placeholder="optional" /></div>
      </div></form>`,
    onMount: (b) => {
      const inp = $('input[name="amount"]', b);
      inp.addEventListener('input', () => { $('#splitPreview', b).innerHTML = splitPreviewHTML(parseAmount(inp.value) || 0); });
      setTimeout(() => inp.focus({ preventScroll: true }), 320);
    },
    onSave: (b) => {
      const inp = $('input[name="amount"]', b);
      const v = round2(parseAmount(inp.value));
      const date = $('#svDate', b).value;
      if (!(v > 0)) return invalid(inp, 'Bitte einen Betrag eingeben');
      if (!date) return invalid($('#svDate', b), 'Bitte ein Datum wählen');
      const key = cycleKeyForDate(date);
      bookSavings(key, v, { kind: 'extra', date, note: $('#svNote', b).value.trim() });
      save(); render();
      toast(`${eur(v)} gespart${key !== ui.key ? ` (${cycleLabel(key)})` : ''}`);
      return true;
    },
  });
}

function openWithdrawSheet(bucketId) {
  const list = state.buckets.filter((b) => bucketBalance(b.id) > 0);
  if (!list.length) return toast('Noch kein Guthaben zum Entnehmen');
  const sel = list.some((b) => b.id === bucketId) ? bucketId : list[0].id;
  openSheet({
    title: 'Entnehmen',
    saveLabel: 'Entnehmen',
    body: `<form>${amountBlock('', 'fließt zurück ins frei verfügbare Budget')}
      <div class="group">
        <div class="frow"><label for="wdB">Aus Topf</label><select id="wdB">${list.map((b) => `<option value="${b.id}" ${b.id === sel ? 'selected' : ''}>${esc(b.name)} · ${eur(bucketBalance(b.id))}</option>`).join('')}</select></div>
        <div class="frow"><label for="wdDate">Datum</label><input id="wdDate" type="date" value="${defaultDateFor(ui.key)}" /></div>
        <div class="frow"><label for="wdNote">Grund</label><input id="wdNote" maxlength="80" placeholder="optional" /></div>
      </div>
      <p class="section-f">Eine Entnahme erhöht dein frei verfügbares Budget im gewählten Monat.</p></form>`,
    onMount: (b) => setTimeout(() => $('input[name="amount"]', b).focus({ preventScroll: true }), 320),
    onSave: (b) => {
      const inp = $('input[name="amount"]', b);
      const v = round2(parseAmount(inp.value));
      const bid = $('#wdB', b).value, date = $('#wdDate', b).value;
      if (!(v > 0)) return invalid(inp, 'Bitte einen Betrag eingeben');
      if (v > bucketBalance(bid)) return invalid(inp, `Höchstens ${eur(bucketBalance(bid))} verfügbar`);
      if (!date) return invalid($('#wdDate', b), 'Bitte ein Datum wählen');
      withdrawSavings(cycleKeyForDate(date), bid, v, date, $('#wdNote', b).value.trim());
      save(); render();
      toast(`${eur(v)} zurück ins Budget gebucht`);
      return true;
    },
  });
}

function openRateSheet() {
  const c = cycleView(ui.key);
  openSheet({
    title: 'Sparrate',
    body: `<form>${amountBlock(c.savingsRate || '', `pro Monat · ${cycleLabel(ui.key)}`)}
      <div class="group"><div class="frow"><span class="lbl">Für künftige Monate übernehmen</span><label class="switch"><input type="checkbox" name="asDefault" checked /><span></span></label></div></div>
      <p class="section-f">Wird am Tag des Gehaltseingangs gebucht, gemäß deiner Prozent-Aufteilung verteilt und vom frei verfügbaren Budget abgezogen. 0 = keine Sparrate.</p></form>`,
    onMount: (b) => setTimeout(() => $('input[name="amount"]', b).focus({ preventScroll: true }), 320),
    onSave: (b) => {
      const inp = $('input[name="amount"]', b);
      const v = inp.value.trim() ? round2(parseAmount(inp.value)) : 0;
      if (isNaN(v) || v < 0) return invalid(inp, 'Bitte einen gültigen Betrag eingeben');
      setSavingsRate(ui.key, v);
      if ($('input[name="asDefault"]', b).checked) state.settings.defaultSavingsRate = v;
      save(); render();
      toast(v ? `Sparrate ${eur(v)} gespeichert` : 'Sparrate entfernt');
      return true;
    },
  });
}

/** Spartöpfe bearbeiten – Live-Validierung auf 100 % */
function openBucketsSheet() {
  let draft = state.buckets.filter((b) => !b.archived).map((b) => ({ ...b }));
  const archived = state.buckets.filter((b) => b.archived).map((b) => ({ ...b }));

  openSheet({
    title: 'Spartöpfe',
    body: `<form id="bForm"><div class="group" id="bList"></div>
      <div class="group mt"><button type="button" class="row action" id="bAdd">${icon('plusc')} Spartopf hinzufügen</button></div>
      <div class="pct-sum" id="bSum" role="status"></div>
      <p class="section-f">Farbe antippen zum Wechseln. Neue Prozentwerte gelten für künftige Einzahlungen – bereits Gespartes bleibt in seinem Topf. Töpfe mit Guthaben werden beim Entfernen archiviert.</p></form>`,
    onMount: (b) => {
      const list = $('#bList', b);
      const updateSum = () => {
        const s = round2(sum(draft.map((x) => x.percent)));
        const el = $('#bSum', b);
        el.className = `pct-sum ${s === 100 ? 'ok' : 'bad'}`;
        el.innerHTML = s === 100 ? '✓ Summe: 100 % – passt'
          : `Summe: ${num(s, s % 1 ? 1 : 0)} % · ${s < 100 ? `noch ${num(100 - s, (100 - s) % 1 ? 1 : 0)} % verteilen` : `${num(s - 100, (s - 100) % 1 ? 1 : 0)} % zu viel`}`;
      };
      const draw = () => {
        list.innerHTML = draft.length ? draft.map((x, i) => `
          <div class="frow bucket-row" data-i="${i}">
            <button type="button" class="swatch" style="--c:${x.color}" data-color aria-label="Farbe ändern"></button>
            <input class="b-name" data-name value="${esc(x.name)}" placeholder="Name, z. B. ETF-Depot" maxlength="40" aria-label="Name" />
            <input class="b-pct" data-pct inputmode="decimal" value="${amountStr(x.percent)}" aria-label="Prozent" /><span class="t2">%</span>
            <button type="button" class="b-del" data-del aria-label="Entfernen">−</button>
          </div>`).join('') : '<div class="empty">Noch keine Spartöpfe.</div>';
        $$('.bucket-row', list).forEach((row) => {
          const i = Number(row.dataset.i);
          $('[data-name]', row).addEventListener('input', (ev) => { draft[i].name = ev.target.value; });
          $('[data-pct]', row).addEventListener('input', (ev) => { draft[i].percent = clamp(parseAmount(ev.target.value) || 0, 0, 100); updateSum(); });
          $('[data-color]', row).addEventListener('click', () => {
            draft[i].color = BUCKET_COLORS[(BUCKET_COLORS.indexOf(draft[i].color) + 1) % BUCKET_COLORS.length];
            $('[data-color]', row).style.setProperty('--c', draft[i].color);
          });
          $('[data-del]', row).addEventListener('click', () => {
            const [gone] = draft.splice(i, 1);
            if (bucketBalance(gone.id) !== 0) { archived.push({ ...gone, archived: true, percent: 0 }); toast(`„${gone.name}“ wird archiviert – Guthaben bleibt erhalten`); }
            draw(); updateSum();
          });
        });
      };
      $('#bAdd', b).addEventListener('click', () => {
        const used = new Set(draft.map((x) => x.color));
        draft.push({ id: uid(), name: '', percent: Math.max(0, round2(100 - sum(draft.map((x) => x.percent)))), color: BUCKET_COLORS.find((c) => !used.has(c)) || BUCKET_COLORS[0], archived: false });
        draw(); updateSum();
        const inputs = $$('[data-name]', list); inputs[inputs.length - 1]?.focus();
      });
      draw(); updateSum();
    },
    onSave: (b) => {
      const emptyIdx = draft.findIndex((x) => !x.name.trim());
      if (emptyIdx >= 0) return invalid($$('[data-name]', b)[emptyIdx], 'Bitte jedem Topf einen Namen geben');
      if (!draft.length) return invalid($('#bAdd', b), 'Mindestens ein Spartopf wird benötigt');
      const s = round2(sum(draft.map((x) => x.percent)));
      if (s !== 100) { toast(`Die Aufteilung muss 100 % ergeben (aktuell ${num(s, s % 1 ? 1 : 0)} %)`); return false; }
      state.buckets = [...draft.map((x) => ({ ...x, name: x.name.trim() })), ...archived];
      ensureRateBooked(currentKey());
      ensureRateBooked(ui.key);
      save(); render(); toast('Spartöpfe gespeichert');
      return true;
    },
  });
}

/** Details eines Spar-Transfers (inkl. Löschen) */
function openSavingsGroupSheet(gid) {
  const g = savingsGroups().find((x) => x.id === gid);
  if (!g) return;
  const isW = g.kind === 'withdrawal';
  const label = { rate: 'Monatliche Sparrate', extra: 'Spontan gespart', withdrawal: 'Entnahme' }[g.kind];
  openSheet({
    title: label,
    cancelLabel: 'Fertig',
    body: `<div class="amount-in"><div class="static-amt" style="color:${isW ? 'var(--orange)' : SAVE_META.color}">${isW ? '−' : '+'}${eur(Math.abs(g.amount))}</div>
      <small>${fmtWDM(g.date)} · ${cycleLabel(g.cycle)}</small></div>
      <div class="section-h"><span>${isW ? 'Aus Topf' : 'Aufgeteilt auf'}</span></div>
      <div class="group tiles">${g.items.map((i) => { const bk = bucketById(i.bucketId); return `
        <div class="row has-tile">${tile('piggy', bk?.color || SAVE_META.color)}<span class="main-col"><div class="title">${esc(bk?.name || 'Gelöschter Topf')}</div></span>
        <span class="trail">${i.amount < 0 ? '−' : '+'}${eur(Math.abs(i.amount))}</span></div>`; }).join('')}</div>
      ${g.note ? `<div class="section-h"><span>Notiz</span></div><div class="group"><div class="row">${esc(g.note)}</div></div>` : ''}
      <div class="group" style="margin-top:26px"><button type="button" class="row danger" data-del>${icon('trash')} Buchung löschen</button></div>`,
    onMount: (b) => {
      $('[data-del]', b).addEventListener('click', async () => {
        const msg = g.kind === 'rate'
          ? `Sparrate für ${cycleLabel(g.cycle)} löschen? Die Sparrate dieses Monats wird auf 0 gesetzt.`
          : 'Diese Spar-Buchung löschen? Das frei verfügbare Budget wird entsprechend angepasst.';
        if (!(await askConfirm(msg, 'Löschen', true))) return;
        const rest = state.savings.filter((x) => x.groupId !== gid);
        const negative = state.buckets.find((bk) => round2(sum(rest.filter((x) => x.bucketId === bk.id).map((x) => x.amount))) < 0);
        if (negative) return toast(`Nicht möglich: „${negative.name}“ würde ins Minus fallen`);
        state.savings = rest;
        if (g.kind === 'rate') mutCycle(g.cycle).savingsRate = 0;
        save(); closeSheet(); render(); toast('Buchung gelöscht');
      });
    },
  });
}

/** Ladeansicht (Skeleton) während die Cloud-Daten abgerufen werden */
function skeletonHTML() {
  return `<div aria-busy="true" aria-label="Daten werden geladen">
    <div class="header"><div class="skel" style="width:52%;height:36px"></div><div class="skel" style="width:36px;height:36px;border-radius:50%"></div></div>
    <div class="skel" style="width:44%;height:20px;margin:8px 0 20px"></div>
    <div class="skel" style="height:196px;border-radius:20px"></div>
    <div class="tiles2"><div class="skel" style="height:84px"></div><div class="skel" style="height:84px"></div></div>
    <div class="skel" style="height:13px;width:32%;margin:28px 16px 9px"></div>
    <div class="skel" style="height:150px"></div>
    <div class="skel" style="height:13px;width:40%;margin:28px 16px 9px"></div>
    <div class="skel" style="height:240px"></div>
  </div>`;
}

/* ---------- 7. Sheets ---------- */
const sheetEl = $('#sheet');
let sheetTimer = null, sheetSaveFn = null;

/**
 * Öffnet ein iOS-Modal. onSave(body) → false = offen lassen (Validierungsfehler)
 */
function openSheet({ title, body, onSave = null, saveLabel = 'Sichern', cancelLabel = 'Abbrechen', onMount }) {
  clearTimeout(sheetTimer);
  $('#sheetTitle').textContent = title;
  $('.sheet-nav .l', sheetEl).textContent = cancelLabel;
  const saveBtn = $('#sheetSave');
  saveBtn.textContent = saveLabel;
  saveBtn.style.visibility = onSave ? 'visible' : 'hidden';
  sheetSaveFn = onSave;
  const b = $('#sheetBody');
  b.innerHTML = body;
  b.scrollTop = 0;
  sheetEl.hidden = false;
  requestAnimationFrame(() => requestAnimationFrame(() => sheetEl.classList.add('open')));
  // Enter in Eingabefeldern = Sichern
  b.querySelectorAll('form').forEach((f) => f.addEventListener('submit', (ev) => { ev.preventDefault(); trySave(); }));
  if (onMount) onMount(b);
}
function trySave() {
  if (!sheetSaveFn) return;
  if (sheetSaveFn($('#sheetBody')) !== false) closeSheet();
}
$('#sheetSave').addEventListener('click', trySave);
function closeSheet() {
  sheetEl.classList.remove('open');
  sheetSaveFn = null;
  sheetTimer = setTimeout(() => { sheetEl.hidden = true; $('#sheetBody').innerHTML = ''; }, 300);
}

/** Feld als ungültig markieren */
function invalid(input, msg) {
  toast(msg);
  const row = input.closest('.frow, .amount-in') || input;
  row.classList.add('invalid');
  input.focus();
  setTimeout(() => row.classList.remove('invalid'), 1800);
  return false;
}

const amountBlock = (value, hint = '') => `
  <div class="amount-in"><input name="amount" inputmode="decimal" placeholder="0,00 €" autocomplete="off" value="${value ? amountStr(value) : ''}" aria-label="Betrag in Euro" />
  ${hint ? `<small>${hint}</small>` : ''}</div>`;

const chipsBlock = (list) => list.length ? `<div class="chips">${list.map((t) => `<button type="button" class="chip" data-chip="${esc(t)}">${esc(t)}</button>`).join('')}</div>` : '';

/** Vorschläge: zuletzt genutzte Titel + Standardliste */
function suggestionsFor(kind, cat) {
  const pool = kind === 'income' ? Object.values(state.cycles).flatMap((c) => c.incomes)
    : kind === 'contract' ? [] : Object.values(state.cycles).flatMap((c) => c.expenses).filter((e) => e.cat === cat);
  const recent = pool.sort((a, b) => (b.created || b.date).localeCompare(a.created || a.date)).map((x) => x.title);
  const base = SUGGEST[kind === 'income' ? 'income' : kind === 'contract' ? 'subs' : cat] || [];
  return [...new Set([...recent, ...base])].slice(0, 12);
}

function defaultDateFor(key) {
  const r = cycleRange(key), t = todayISO();
  return t >= r.start && t <= r.end ? t : r.start;
}

/**
 * Formular für Ausgaben, Einnahmen und Abos.
 * opts: { kind: 'expense'|'income'|'contract', cat, entry, key }
 */
function openEntrySheet(opts = {}) {
  let kind = opts.kind || 'expense';
  let cat = opts.cat || (CATS[ui.view] && CATS[ui.view].kind === 'var' ? ui.view : ui.view === 'fixed' ? 'fix' : 'daily');
  const e = opts.entry || null;
  const key = opts.key || ui.key;
  if (e && kind === 'expense') cat = e.cat;
  const isEdit = !!e;

  const inner = (amountVal) => {
    if (kind === 'contract') return contractForm(e, amountVal);
    const isExp = kind === 'expense';
    return `
      ${isExp ? `<div class="cat-pick">${EXPENSE_CATS.map((k) => `
        <button type="button" data-pick="${k}" class="${k === cat ? 'on' : ''}">${tile(CATS[k].icon, CATS[k].color)}${CATS[k].label}</button>`).join('')}</div>` : ''}
      ${amountBlock(amountVal)}
      ${chipsBlock(suggestionsFor(kind, cat))}
      <div class="group">
        <div class="frow"><label for="fTitle">Titel</label><input id="fTitle" name="title" maxlength="80" autocomplete="off" placeholder="${isExp ? { fix: 'z. B. Miete', daily: 'z. B. Rewe', fuel: 'z. B. Aral', hobby: 'z. B. Kino', misc: 'z. B. Geschenk' }[cat] : 'z. B. Nachhilfe'}" value="${e ? esc(e.title) : ''}" /></div>
        <div class="frow"><label for="fDate">Datum</label><input id="fDate" type="date" name="date" value="${e ? e.date : defaultDateFor(key)}" /></div>
        ${isExp && SUBCATS[cat].length ? `<div class="frow"><label for="fSub">Unterkategorie</label><select id="fSub" name="sub">
          <option value="">Keine</option>${SUBCATS[cat].map((x) => `<option ${e?.sub === x ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></div>` : ''}
      </div>
      ${isExp && cat === 'fuel' ? `
        <div class="section-h"><span>Optional</span></div>
        <div class="group">
          <div class="frow"><label>Liter</label><input name="liters" inputmode="decimal" placeholder="0,0" value="${e?.liters ? amountStr(e.liters) : ''}" /></div>
          <div class="frow"><label>Literpreis</label><input name="price" inputmode="decimal" placeholder="0,000 €" value="${e?.pricePerLiter ? String(e.pricePerLiter).replace('.', ',') : ''}" /></div>
          <div class="frow"><label>km-Stand</label><input name="km" inputmode="numeric" placeholder="für Verbrauch" value="${e?.km || ''}" /></div>
        </div>
        <p class="section-f">Liter × Literpreis füllt den Betrag automatisch aus.</p>` : ''}
      <div class="section-h"><span>Notiz${isExp && cat === 'misc' ? ' <span class="neg">· Pflichtfeld</span>' : ' · optional'}</span></div>
      <div class="group"><div class="frow stack"><textarea name="note" maxlength="500" placeholder="${isExp && cat === 'misc' ? 'Was war das genau?' : 'Genauere Beschreibung …'}">${e ? esc(e.note || '') : ''}</textarea></div></div>
      ${isEdit ? `<div class="group" style="margin-top:26px"><button type="button" class="row danger" data-del>${icon('trash')} Löschen</button></div>` : ''}`;
  };

  const titles = { expense: isEdit ? 'Ausgabe' : 'Neue Ausgabe', income: isEdit ? 'Einnahme' : 'Neue Einnahme', contract: isEdit ? 'Abo / Vertrag' : 'Neues Abo' };
  const body = `
    ${isEdit ? '' : `<div class="seg" id="kindSeg">
      <button type="button" data-kind="expense" class="${kind === 'expense' ? 'on' : ''}">Ausgabe</button>
      <button type="button" data-kind="income" class="${kind === 'income' ? 'on' : ''}">Einnahme</button>
      <button type="button" data-kind="contract" class="${kind === 'contract' ? 'on' : ''}">Abo</button></div>`}
    <form id="entryForm" novalidate><div id="entryInner">${inner(e?.amount)}</div><button type="submit" hidden></button></form>`;

  openSheet({
    title: titles[kind],
    body,
    saveLabel: isEdit ? 'Sichern' : 'Hinzufügen',
    onMount: (b) => {
      const wire = () => {
        const f = $('#entryForm', b).elements;
        $$('[data-pick]', b).forEach((x) => x.addEventListener('click', () => { cat = x.dataset.pick; rerender(); }));
        $$('[data-chip]', b).forEach((x) => x.addEventListener('click', () => { f[kind === 'contract' ? 'name' : 'title'].value = x.dataset.chip; }));
        if (f.liters) {
          const calc = () => { const l = parseAmount(f.liters.value), p = parseAmount(f.price.value); if (l > 0 && p > 0) f.amount.value = amountStr(l * p); };
          f.liters.addEventListener('input', calc); f.price.addEventListener('input', calc);
        }
        const del = $('[data-del]', b);
        if (del) del.addEventListener('click', async () => {
          const name = e.title || e.name;
          if (!(await askConfirm(`„${name}“ wirklich löschen?`, 'Löschen', true))) return;
          if (kind === 'contract') state.contracts = state.contracts.filter((c) => c.id !== e.id);
          else removeEntry(key, kind, e.id);
          save(); closeSheet(); render(); toast('Gelöscht');
        });
      };
      const rerender = () => {
        const cur = $('#entryForm', b).elements.amount.value;
        $('#entryInner', b).innerHTML = inner(cur ? parseAmount(cur) : '');
        $('#sheetTitle').textContent = titles[kind];
        wire();
      };
      $$('#kindSeg button', b).forEach((x) => x.addEventListener('click', () => {
        kind = x.dataset.kind;
        $$('#kindSeg button', b).forEach((y) => y.classList.toggle('on', y === x));
        rerender();
      }));
      wire();
      if (!isEdit) setTimeout(() => $('#entryForm', b).elements.amount.focus({ preventScroll: true }), 320);
    },
    onSave: (b) => (kind === 'contract' ? saveContract(b, e) : saveEntry(b, kind, cat, e, key)),
  });
}

function saveEntry(b, kind, cat, e, key) {
  const f = $('#entryForm', b).elements;
  const amount = round2(parseAmount(f.amount.value));
  const title = f.title.value.trim();
  const date = f.date.value;
  const note = f.note.value.trim();
  if (!(amount > 0)) return invalid(f.amount, 'Bitte einen Betrag eingeben');
  if (!title) return invalid(f.title, 'Bitte einen Titel eingeben');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return invalid(f.date, 'Bitte ein Datum wählen');
  if (kind === 'expense' && cat === 'misc' && !note) return invalid(f.note, 'Bei „Sonstiges“ ist eine Notiz Pflicht');

  const item = { id: e ? e.id : uid(), title, amount, date, note, created: e?.created || new Date().toISOString() };
  if (kind === 'expense') {
    item.cat = cat;
    if (f.sub && f.sub.value) item.sub = f.sub.value;
    if (cat === 'fuel') {
      const l = parseAmount(f.liters.value), p = parseAmount(f.price.value), km = parseInt(f.km.value, 10);
      if (l > 0) item.liters = round2(l);
      if (p > 0) item.pricePerLiter = Math.round(p * 1000) / 1000;
      if (km > 0) item.km = km;
    }
  }
  if (e) removeEntry(key, kind, e.id);
  const target = cycleKeyForDate(date);
  const c = mutCycle(target);
  (kind === 'income' ? c.incomes : c.expenses).push(item);
  save(); render();
  toast(target !== ui.key ? `Gespeichert in ${cycleLabel(target)}` : e ? 'Gespeichert' : `${kind === 'income' ? 'Einnahme' : 'Ausgabe'} hinzugefügt`);
  return true;
}

function removeEntry(key, kind, id) {
  const c = state.cycles[key];
  if (!c) return;
  const arr = kind === 'income' ? c.incomes : c.expenses;
  const i = arr.findIndex((x) => x.id === id);
  if (i >= 0) arr.splice(i, 1);
}
const findEntry = (key, kind, id) => (kind === 'income' ? cycleView(key).incomes : cycleView(key).expenses).find((x) => x.id === id);

function contractForm(ct, amountVal) {
  const opt = (v, cur, label) => `<option value="${v}" ${String(v) === String(cur) ? 'selected' : ''}>${label}</option>`;
  const sw = (name, checked) => `<label class="switch"><input type="checkbox" name="${name}" ${checked ? 'checked' : ''}/><span></span></label>`;
  return `
    ${amountBlock(amountVal ?? ct?.amount, 'pro Monat')}
    ${ct ? '' : chipsBlock(suggestionsFor('contract'))}
    <div class="group">
      <div class="frow"><label>Name</label><input name="name" maxlength="60" placeholder="z. B. Netflix" value="${esc(ct?.name || '')}" /></div>
      <div class="frow"><label>Abbuchung</label><select name="day">${Array.from({ length: 31 }, (_, i) => opt(i + 1, ct?.day || 1, `am ${i + 1}.`)).join('')}</select></div>
      <div class="frow"><label>Beginn</label><input type="date" name="start" value="${ct?.start || ''}" /></div>
    </div>
    <div class="section-h"><span>Laufzeit & Kündigung · optional</span></div>
    <div class="group">
      <div class="frow"><label>Vertragsende</label><input type="date" name="end" value="${ct?.end || ''}" /></div>
      <div class="frow"><label>Kündigungsfrist</label><select name="notice">${[0, 1, 2, 3, 6].map((n) => opt(n, ct?.notice ?? 1, n ? `${n} Monat${n > 1 ? 'e' : ''}` : 'keine')).join('')}</select></div>
      <div class="frow"><label>Verlängerung</label><select name="renew">${[1, 3, 6, 12, 24].map((n) => opt(n, ct?.renew ?? 12, `um ${n} Monat${n > 1 ? 'e' : ''}`)).join('')}</select></div>
      <div class="frow"><span class="lbl">Gekündigt</span>${sw('cancelled', ct?.cancelled)}</div>
      <div class="frow"><span class="lbl">Pausiert</span>${sw('paused', ct?.paused)}</div>
    </div>
    <p class="section-f">Mit Vertragsende & Frist erinnert dich die App rechtzeitig. „Gekündigt“ beendet die Abbuchungen nach dem Vertragsende.</p>
    <div class="section-h"><span>Notiz · optional</span></div>
    <div class="group"><div class="frow stack"><textarea name="note" maxlength="300" placeholder="z. B. Kundennummer, Kündigungsweg …">${esc(ct?.note || '')}</textarea></div></div>
    ${ct ? `<div class="group" style="margin-top:26px"><button type="button" class="row danger" data-del>${icon('trash')} Löschen</button></div>` : ''}`;
}

function saveContract(b, ct) {
  const f = $('#entryForm', b).elements;
  const amount = round2(parseAmount(f.amount.value));
  const name = f.name.value.trim();
  if (!(amount > 0)) return invalid(f.amount, 'Bitte einen Monatsbetrag eingeben');
  if (!name) return invalid(f.name, 'Bitte einen Namen eingeben');
  if (f.start.value && f.end.value && f.end.value < f.start.value) return invalid(f.end, 'Vertragsende liegt vor dem Beginn');
  const data = {
    name, amount, day: Number(f.day.value) || 1, start: f.start.value, end: f.end.value,
    notice: Number(f.notice.value) || 0, renew: Number(f.renew.value) || 12,
    cancelled: f.cancelled.checked, paused: f.paused.checked, note: f.note.value.trim(),
  };
  if (ct) Object.assign(ct, data);
  else state.contracts.push({ id: uid(), ...data });
  save();
  if (ui.view !== 'overview') { ui.view = 'fixed'; ui.fixedSub = 'subs'; }
  render();
  toast(ct ? 'Gespeichert' : 'Abo hinzugefügt');
  return true;
}

/** Gehalt des Zyklus */
function openSalarySheet() {
  const c = cycleView(ui.key);
  openSheet({
    title: 'Gehalt',
    body: `<form>${amountBlock(c.salary || state.settings.defaultSalary || '', `Eingang am ${fmtWDM(cycleRange(ui.key).start)}`)}
      <div class="group"><div class="frow"><span class="lbl">Für neue Monate übernehmen</span><label class="switch"><input type="checkbox" name="asDefault" checked /><span></span></label></div></div>
      <p class="section-f">Das Gehalt startet den Finanzmonat „${cycleLabel(ui.key)}“. Den Eingangstag kannst du in den Einstellungen anpassen.</p></form>`,
    onMount: (b) => setTimeout(() => $('input[name="amount"]', b).focus({ preventScroll: true }), 320),
    onSave: (b) => {
      const input = $('input[name="amount"]', b);
      const v = input.value.trim() ? round2(parseAmount(input.value)) : 0;
      if (isNaN(v) || v < 0) return invalid(input, 'Bitte einen gültigen Betrag eingeben');
      mutCycle(ui.key).salary = v;
      if ($('input[name="asDefault"]', b).checked) state.settings.defaultSalary = v;
      save(); render(); toast('Gehalt gespeichert');
      return true;
    },
  });
}

/** Monatslimit einer variablen Kategorie */
function openLimitSheet(cat) {
  const c = cycleView(ui.key);
  openSheet({
    title: `Limit · ${CATS[cat].label}`,
    body: `<form>${amountBlock(c.limits[cat] || '', 'geplantes Monatslimit')}
      <p class="section-f">Grün bis 75 %, Orange bis 100 %, Rot bei Überschreitung. Leer = kein Limit. Neue Monate übernehmen deine Limits automatisch.</p></form>`,
    onMount: (b) => setTimeout(() => $('input', b).focus({ preventScroll: true }), 320),
    onSave: (b) => {
      const input = $('input[name="amount"]', b);
      const v = input.value.trim() ? round2(parseAmount(input.value)) : 0;
      if (isNaN(v) || v < 0) return invalid(input, 'Bitte einen gültigen Betrag eingeben');
      mutCycle(ui.key).limits[cat] = v;
      save(); render(); toast('Limit gespeichert');
      return true;
    },
  });
}

/** Monatsarchiv */
function openArchive() {
  const cur = currentKey();
  const keys = [...new Set([...Object.keys(state.cycles), cur, shiftYM(cur, 1), shiftYM(cur, -1)])].sort().reverse();
  openSheet({
    title: 'Monate',
    cancelLabel: 'Fertig',
    body: `<div class="group">${keys.map((k) => {
      const s = stats(k);
      const tag = k === cur ? '<span class="pill">Aktuell</span>' : s.status === 'future' ? '<span class="pill gray">Geplant</span>' : '';
      return `<button class="row" data-action="select-cycle" data-key="${k}">
        <span class="main-col"><div class="title">${cycleLabel(k)} ${tag}</div><div class="sub num">${rangeLabel(k)}</div></span>
        <span class="trail ${s.free < 0 ? 'neg' : ''}">${state.cycles[k] ? eur(s.free) : '–'}<small>frei</small></span>
        ${k === ui.key ? `<span class="blue">✓</span>` : ''}
      </button>`;
    }).join('')}</div>
    <p class="section-f">„Frei“ = Einnahmen minus Fixkosten, Abos und Ausgaben des jeweiligen Monats.</p>`,
  });
}

/** Konto & Einstellungen */
function openSettings() {
  const st = state.settings;
  const prevYM = shiftYM(ui.key, -1);
  const modeText = { local: 'Lokales Konto · nur auf diesem Gerät', cloud: 'Cloud-Konto · auf allen Geräten', guest: 'Gastzugang · Daten bleiben auf diesem Gerät', demo: 'Demo-Modus · Daten werden beim Abmelden gelöscht' }[Session.mode];
  const opt = (v, cur, label) => `<option value="${v}" ${String(v) === String(cur) ? 'selected' : ''}>${label}</option>`;
  const actionRow = (action, iconName, label) => `<button type="button" class="row action has-tile" data-action="${action}"><span class="tile" style="--c:transparent;color:var(--blue)">${icon(iconName)}</span><span>${label}</span></button>`;

  openSheet({
    title: 'Einstellungen',
    body: `
      <div class="group"><div class="row has-tile">${tile('person', 'var(--text-3)', 'lg')}
        <span class="main-col"><div class="title">${esc({ demo: 'Demo-Nutzer', guest: 'Gast' }[Session.mode] || Session.user.email)}</div><div class="sub">${modeText}</div></span></div></div>

      <form id="setForm">
      <div class="section-h"><span>Gehaltseingang</span></div>
      <div class="group">
        <div class="frow"><label>Gehalt am</label><select name="workdaysBefore">${[1, 2, 3, 4, 5].map((n) => opt(n, st.workdaysBefore, `${n}. letzten Werktag`)).join('')}</select></div>
        <div class="frow"><label>Feiertage</label><select name="region">${Object.entries(REGIONS).map(([k, v]) => opt(k, st.region, v)).join('')}</select></div>
        <div class="frow"><span class="lbl">24.12. & 31.12. frei</span><label class="switch"><input type="checkbox" name="bankHolidays" ${st.bankHolidays ? 'checked' : ''}/><span></span></label></div>
      </div>
      <p class="section-f">Fällt der Termin aufs Wochenende oder einen Feiertag, wird er automatisch auf den vorherigen Werktag vorgezogen.</p>

      <div class="section-h"><span>Termine für ${cycleLabel(ui.key)}</span></div>
      <div class="group">
        <div class="frow"><label>Start (Gehalt)</label><input type="date" name="payStart" value="${payday(prevYM)}" /></div>
        <div class="frow"><label>Nächstes Gehalt</label><input type="date" name="payNext" value="${payday(ui.key)}" /></div>
        <button type="button" class="row action" id="resetPay">Automatisch berechnen</button>
      </div>
      <p class="section-f">Automatisch: ${fmtWDM(autoPayday(prevYM))} bzw. ${fmtWDM(autoPayday(ui.key))}. Der Monat endet einen Tag vor dem nächsten Gehalt.</p>
      </form>

      <div class="section-h"><span>Darstellung</span></div>
      <div class="seg" id="themeSeg">${[['auto', 'System'], ['light', 'Hell'], ['dark', 'Dunkel (OLED)']].map(([v, l]) => `<button type="button" data-theme="${v}" class="${st.theme === v ? 'on' : ''}">${l}</button>`).join('')}</div>

      <div class="section-h"><span>Daten</span></div>
      <div class="group tiles">
        ${CONFIG.noDownloads ? '' : actionRow('export-csv', 'down', 'CSV-Export (Excel)')}
        ${CONFIG.noDownloads ? '' : actionRow('export-json', 'down', 'Backup exportieren (JSON)')}
        ${actionRow('import-json', 'up', 'Backup importieren')}
        ${actionRow('sample', 'spark', 'Beispieldaten laden')}
        ${Session.mode === 'cloud' && LS.get(LS_KEYS.data('guest')) ? actionRow('import-guest', 'up', 'Gast-Daten dieses Geräts übernehmen') : ''}
        ${LS.get(LS_KEYS.legacy) && Session.mode !== 'demo' ? actionRow('legacy', 'copy', 'Daten aus Version 1 übernehmen') : ''}
      </div>

      <div class="group" style="margin-top:26px">
        <button type="button" class="row danger" data-action="reset">Alle Daten löschen</button>
        <button type="button" class="row danger" data-action="logout">Abmelden</button>
      </div>`,
    onMount: (b) => {
      $$('#themeSeg button', b).forEach((x) => x.addEventListener('click', () => {
        state.settings.theme = x.dataset.theme;
        applyTheme(state.settings.theme); save();
        $$('#themeSeg button', b).forEach((y) => y.classList.toggle('on', y === x));
      }));
      $('#resetPay', b).addEventListener('click', () => {
        delete state.paydayOverrides[prevYM];
        delete state.paydayOverrides[ui.key];
        const f = $('#setForm', b).elements;
        f.payStart.value = autoPayday(prevYM);
        f.payNext.value = autoPayday(ui.key);
        save(); render(); toast('Automatische Termine aktiv');
      });
    },
    onSave: (b) => {
      const f = $('#setForm', b).elements;
      st.workdaysBefore = Number(f.workdaysBefore.value) || 3;
      st.region = f.region.value;
      st.bankHolidays = f.bankHolidays.checked;
      const ps = f.payStart.value, pn = f.payNext.value;
      if (ps && pn) {
        if (ps >= pn) return invalid(f.payNext, 'Das nächste Gehalt muss nach dem Start liegen');
        if (daysBetween(ps, pn) > 62) return invalid(f.payNext, 'Ein Monat darf höchstens ca. 2 Monate lang sein');
        const setOv = (ym, v) => { if (v === autoPayday(ym)) delete state.paydayOverrides[ym]; else state.paydayOverrides[ym] = v; };
        setOv(prevYM, ps);
        setOv(ui.key, pn);
      }
      save(); render(); toast('Einstellungen gespeichert');
      return true;
    },
  });
}

/* ---------- 8. Theme, Dialog & Toast ---------- */
/**
 * iOS-Alert als Ersatz für confirm() (funktioniert auch in eingebetteten
 * Umgebungen, die native Dialoge blockieren). Liefert Promise<boolean>.
 */
function askConfirm(message, okLabel = 'OK', destructive = false) {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'alert';
    el.innerHTML = `<div class="alert-box" role="alertdialog" aria-modal="true">
      <p>${esc(message)}</p>
      <div class="alert-btns"><button type="button" data-r="0">Abbrechen</button>
      <button type="button" data-r="1" class="${destructive ? 'neg' : ''}">${esc(okLabel)}</button></div></div>`;
    const done = (r) => { el.remove(); document.removeEventListener('keydown', onKey, true); resolve(r); };
    const onKey = (ev) => { if (ev.key === 'Escape') { ev.stopPropagation(); done(false); } };
    el.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const b = ev.target.closest('[data-r]');
      if (b) done(b.dataset.r === '1'); else if (ev.target === el) done(false);
    });
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('open'));
    $('[data-r="1"]', el).focus();
  });
}

function applyTheme(t = 'auto') {
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
  LS.set(LS_KEYS.theme, t);
  // Browser-/Statusleistenfarbe: bei "System" je Meta-Tag (media) hell/dunkel, sonst fest
  $$('meta[name="theme-color"]').forEach((m) => {
    const darkMeta = (m.getAttribute('media') || '').includes('dark');
    const dark = t === 'auto' ? darkMeta : t === 'dark';
    m.setAttribute('content', dark ? '#000000' : '#F5F5F7');
  });
}

let toastTimer = null;
function toast(msg, ms = 2200) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}
