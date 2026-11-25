'use strict';
/* =========================================================================
   pwa.js – Service Worker (Offline & Auto-Update) und Installationshinweis
   ========================================================================= */

const PWA = {
  deferredPrompt: null,                 // Android/Chrome: gemerktes Installations-Event
  dismissedKey: 'mb2.installDismissed',
  isStandalone: () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true,
  isIOS: () => /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1),
  isMobile: () => PWA.isIOS() || /Android|Mobi/i.test(navigator.userAgent),
};

/** Service Worker registrieren und bei neuen Versionen automatisch aktualisieren */
function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || !location.protocol.startsWith('http')) return;

  const hadController = !!navigator.serviceWorker.controller;
  let handled = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || handled) return;   // Erstinstallation → kein Neuladen nötig
    handled = true;
    // Nicht mitten in einer Eingabe neu laden
    if (!$('#sheet').hidden) { toast('Update bereit – wird beim nächsten Öffnen aktiv'); return; }
    location.reload();
  });

  navigator.serviceWorker.register('./sw.js').then((reg) => {
    // Beim Zurückkehren in die App nach Updates suchen (z. B. neuer GitHub-Commit)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') reg.update().catch(() => {});
    });
  }).catch(() => { /* z. B. privater Modus – App läuft trotzdem */ });
}

/* Android/Chrome liefert ein eigenes Installations-Event */
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  PWA.deferredPrompt = e;
  showInstallHint();
});
window.addEventListener('appinstalled', () => {
  LS.set(PWA.dismissedKey, true);
  $('#install').hidden = true;
  toast('Budget wurde installiert');
});

/** Dezentes Banner „Als App speichern“ – nur mobil, nicht installiert, nicht weggeklickt */
function showInstallHint() {
  if (CONFIG.embedded || PWA.isStandalone() || !PWA.isMobile() || LS.get(PWA.dismissedKey)) return;
  const el = $('#install');
  const ios = PWA.isIOS();
  const canPrompt = !ios && PWA.deferredPrompt;
  const how = ios
    ? `Tippe auf ${icon('share')} <b style="display:inline;font-size:inherit">Teilen</b> → „Zum Home-Bildschirm“`
    : canPrompt ? 'Installiere Budget auf deinem Home-Bildschirm.' : 'Menü ⋮ → „App installieren“ bzw. „Zum Startbildschirm hinzufügen“';
  el.innerHTML = `
    <img src="./icon-180.png" alt="" width="46" height="46" />
    <div class="txt"><b>Als App speichern</b>${how}</div>
    ${canPrompt ? '<button class="btn small" type="button" data-install>Installieren</button>' : ''}
    <button class="x" type="button" data-install-close aria-label="Hinweis schließen">✕</button>`;
  el.hidden = false;

  $('[data-install-close]', el).addEventListener('click', () => { LS.set(PWA.dismissedKey, true); el.hidden = true; });
  const btn = $('[data-install]', el);
  if (btn) btn.addEventListener('click', async () => {
    const p = PWA.deferredPrompt;
    PWA.deferredPrompt = null;
    el.hidden = true;
    p.prompt();
    const { outcome } = await p.userChoice;
    if (outcome === 'accepted') LS.set(PWA.dismissedKey, true);
  });
}
