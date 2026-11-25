'use strict';
/* =========================================================================
   storage.js – Authentifizierung & Datenhaltung
   -------------------------------------------------------------------------
   Zwei austauschbare Backends mit identischer Schnittstelle:

     LocalBackend  – Konten (E-Mail + PBKDF2-Passworthash) und Daten pro
                     User-ID im localStorage. Läuft ohne jede Einrichtung.
     CloudBackend  – Supabase Auth + Tabelle "budgets" (1 JSON-Dokument pro
                     Nutzer, abgesichert per Row Level Security).

   Der Demo-Modus nutzt immer LocalBackend mit der festen ID "demo".
   Jeder Nutzer bekommt sein eigenes Dokument → strikte Datentrennung.
   ========================================================================= */

const CONFIG = window.BUDGET_CONFIG || {};
const CLOUD_ENABLED = !!(CONFIG.supabaseUrl && CONFIG.supabaseAnonKey);
const SUPABASE_CDN = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js';

const LS_KEYS = {
  users: 'mb2.users',                  // lokale Konten
  session: 'mb2.session',              // aktuelle Sitzung {id, email, mode}
  theme: 'mb2.theme',                  // Theme vor dem Login
  data: (id) => `mb2.data.${id}`,      // Budgetdaten pro Nutzer
  legacy: 'monatsbudget.v1',           // Daten aus Version 1
};

/** localStorage-Zugriff, der nie wirft (Privatmodus, Speicher voll …) */
const LS = {
  get(k, fallback = null) { try { const v = localStorage.getItem(k); return v == null ? fallback : JSON.parse(v); } catch (e) { return fallback; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
  del(k) { try { localStorage.removeItem(k); } catch (e) { /* egal */ } },
};

const normEmail = (e) => String(e || '').trim().toLowerCase();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/* ---------- Passwort-Hash (PBKDF2, 120 000 Runden, SHA-256) ---------- */
const toHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
async function hashPassword(password, saltHex) {
  if (window.crypto?.subtle) {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
    const salt = new Uint8Array(saltHex.match(/../g).map((h) => parseInt(h, 16)));
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 120000, hash: 'SHA-256' }, key, 256);
    return 'pbkdf2$' + toHex(bits);
  }
  // Fallback für unsichere Kontexte (kein WebCrypto): einfacher, nicht-kryptografischer Hash
  let h = 2166136261;
  for (const ch of saltHex + password) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return 'fnv$' + (h >>> 0).toString(16);
}
const randomSalt = () => toHex(crypto.getRandomValues(new Uint8Array(16)));

/* ---------- Lokales Backend ---------- */
const LocalBackend = {
  name: 'local',

  async signUp(email, password) {
    email = normEmail(email);
    const users = LS.get(LS_KEYS.users, {});
    if (users[email]) throw new Error('Für diese E-Mail gibt es bereits ein Konto. Bitte melde dich an.');
    const salt = randomSalt();
    const user = { id: 'u_' + uid(), email, salt, hash: await hashPassword(password, salt), created: new Date().toISOString() };
    users[email] = user;
    if (!LS.set(LS_KEYS.users, users)) throw new Error('Speichern im Browser nicht möglich (Privatmodus?).');
    return { id: user.id, email };
  },

  async signIn(email, password) {
    email = normEmail(email);
    const user = LS.get(LS_KEYS.users, {})[email];
    if (!user || (await hashPassword(password, user.salt)) !== user.hash) throw new Error('E-Mail oder Passwort ist falsch.');
    return { id: user.id, email };
  },

  async signOut() { /* nichts zu tun */ },

  async load(userId) { return LS.get(LS_KEYS.data(userId)); },

  async save(userId, data) {
    if (!LS.set(LS_KEYS.data(userId), data)) throw new Error('Lokaler Speicher voll oder gesperrt.');
  },

  async deleteAccount(userId, email) {
    LS.del(LS_KEYS.data(userId));
    const users = LS.get(LS_KEYS.users, {});
    delete users[normEmail(email)];
    LS.set(LS_KEYS.users, users);
  },
};

/* ---------- Cloud-Backend (Supabase) ---------- */
let sb = null;
function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src; s.async = true; s.onload = resolve; s.onerror = () => reject(new Error('Supabase-Bibliothek konnte nicht geladen werden.'));
    document.head.appendChild(s);
  });
}
async function getSupabase() {
  if (sb) return sb;
  if (!window.supabase) await loadScript(SUPABASE_CDN);
  // persistSession: Anmeldung bleibt auf dem Gerät erhalten; Token werden automatisch erneuert
  sb = window.supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: 'mb2.supabase.auth' },
  });
  // Abgemeldet auf anderem Weg (Token abgelaufen/widerrufen) → zurück zum Login
  sb.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT' && Session.mode === 'cloud' && typeof logout === 'function') logout();
  });
  return sb;
}
/** Supabase-Fehlermeldungen ins Deutsche übersetzen */
function deError(msg = '') {
  const m = msg.toLowerCase();
  if (m.includes('invalid login')) return 'E-Mail oder Passwort ist falsch.';
  if (m.includes('already registered')) return 'Für diese E-Mail gibt es bereits ein Konto.';
  if (m.includes('email not confirmed')) return 'Bitte bestätige zuerst deine E-Mail-Adresse (Link im Postfach).';
  if (m.includes('password should be')) return 'Das Passwort ist zu kurz (mind. 6 Zeichen).';
  if (m.includes('rate limit')) return 'Zu viele Versuche – bitte kurz warten.';
  return msg || 'Unbekannter Fehler.';
}

const CloudBackend = {
  name: 'cloud',

  async signUp(email, password) {
    const c = await getSupabase();
    const { data, error } = await c.auth.signUp({ email: normEmail(email), password });
    if (error) throw new Error(deError(error.message));
    if (!data.session) return { needsConfirm: true };
    return { id: data.user.id, email: data.user.email };
  },

  async signIn(email, password) {
    const c = await getSupabase();
    const { data, error } = await c.auth.signInWithPassword({ email: normEmail(email), password });
    if (error) throw new Error(deError(error.message));
    return { id: data.user.id, email: data.user.email };
  },

  async signOut() { const c = await getSupabase(); await c.auth.signOut(); },

  async restore() {
    const c = await getSupabase();
    const { data } = await c.auth.getSession();
    const u = data.session?.user;
    return u ? { id: u.id, email: u.email } : null;
  },

  // Laden & Speichern der Daten übernimmt die Sync-Engine (js/sync.js)
};

/* ---------- Sitzung: verbindet Nutzer, Backend und Speichern ---------- */
const Session = {
  user: null,          // { id, email }
  mode: null,          // 'local' | 'cloud' | 'demo'

  get backend() { return this.mode === 'cloud' ? CloudBackend : LocalBackend; },
  get authBackend() { return CLOUD_ENABLED ? CloudBackend : LocalBackend; },

  start(user, mode) {
    this.user = user; this.mode = mode;
    LS.set(LS_KEYS.session, { id: user.id, email: user.email, mode });
  },

  /** Beim App-Start: bestehende Sitzung wiederherstellen */
  async restore() {
    const s = LS.get(LS_KEYS.session);
    if (!s) return false;
    if (s.mode === 'cloud') {
      if (!CLOUD_ENABLED) return false;
      try {
        const u = await CloudBackend.restore();
        if (!u) return false;
        this.start(u, 'cloud');
        return true;
      } catch (e) { return false; }
    }
    if (s.mode === 'local' && CLOUD_ENABLED) return false; // Konfiguration wurde umgestellt
    this.user = { id: s.id, email: s.email }; this.mode = s.mode;
    return true;
  },

  async end() {
    if (this.mode === 'cloud') {
      try { await Sync.flush(); } catch (e) { /* egal */ }     // ausstehende Änderungen noch hochladen
      const m = this.mode; this.mode = null;                   // verhindert erneutes logout() durch onAuthStateChange
      try { await CloudBackend.signOut(); } catch (e) { /* egal */ }
      LS.del(LS_KEYS.data(this.user.id)); LS.del(`mb2.snap.${this.user.id}`);   // Cloud-Daten nicht auf dem Gerät lassen
      this.mode = m;
    }
    if (this.mode === 'demo') LS.del(LS_KEYS.data('demo'));
    LS.del(LS_KEYS.session);
    this.user = null; this.mode = null;
  },

  /**
   * Daten laden. Cloud: Server ist führend, lokale Kopie dient als
   * Offline-Fallback (Cache pro User-ID).
   */
  async loadData() {
    if (this.mode !== 'cloud') return LS.get(LS_KEYS.data(this.user.id));
    return Sync.load();
  },

  /** Speichern: lokal sofort (Offline-Cache), Cloud gebündelt über die Sync-Engine */
  saveData(data) {
    if (!this.user) return;
    const ok = LS.set(LS_KEYS.data(this.user.id), data);
    if (!ok && this.mode !== 'cloud') toast('Speichern fehlgeschlagen – bitte Backup exportieren!');
    if (this.mode === 'cloud') { Sync.setStatus('saving'); Sync.schedule(); }
  },
};
