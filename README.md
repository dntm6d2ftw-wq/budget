# Budget – Monatsbudget nach Gehaltszyklus 💶

Progressive Web App im Apple-Clean-Look mit **Supabase-Cloud-Sync** (iPhone, iPad, PC), **Spar- & Vermögensmodul** mit prozentualer Aufteilung, Fixkosten & Abos, Alltag, Tanken, Freizeit, Sonstiges. Installierbar auf dem Home-Bildschirm, offline nutzbar. Reines HTML/CSS/JS – **kein Build-Schritt**.

## 🚀 In 4 Schritten online – für alle Geräte

**1. Supabase-Projekt anlegen (kostenlos)**
Auf <https://supabase.com> registrieren → **New project** → Name (z. B. `budget`), Datenbank-Passwort vergeben, Region **Frankfurt (eu-central-1)** → *Create*. Ca. 2 Minuten warten.

**2. SQL-Skript ausführen**
Im Projekt links **SQL Editor** → *New query* → den kompletten Inhalt von [`supabase.sql`](supabase.sql) einfügen → **Run**. Es entstehen 7 Tabellen mit Row Level Security (jeder sieht nur seine eigenen Daten).

**3. Schlüssel eintragen & Login einstellen**
- **Project Settings → API** (oder Button **Connect**): *Project URL* und den *anon / publishable key* kopieren und in [`js/config.js`](js/config.js) bei `SUPABASE_URL` und `SUPABASE_ANON_KEY` eintragen. (Niemals den `service_role`-Key verwenden!)
- **Authentication → URL Configuration → Site URL**: deinen späteren GitHub-Pages-Link eintragen (`https://DEIN-NAME.github.io/budget/`).
- Optional, für Login ohne Bestätigungsmail: **Authentication → Sign In / Providers → Email → „Confirm email“ ausschalten**.

**4. Über GitHub Pages veröffentlichen**
github.com → **New repository** (`budget`, *Public*) → **uploading an existing file** → den **Inhalt** des Projektordners hineinziehen (inkl. `css`, `js`, `tools`) → *Commit*. Dann **Settings → Pages → Deploy from a branch → main / (root) → Save**.
Nach 1–2 Minuten: **`https://DEIN-NAME.github.io/budget/`** – auf jedem Gerät öffnen, anmelden, fertig. Auf dem iPhone: Teilen → „Zum Home-Bildschirm“.

> Updates: geänderte Dateien hochladen und in `sw.js` die `VERSION` erhöhen – installierte Apps aktualisieren sich beim nächsten Öffnen selbst.

## ☁️ So funktioniert die Synchronisation

- **Supabase Auth** (E-Mail + Passwort), Sitzung bleibt auf dem Gerät gespeichert.
- Daten liegen strukturiert in `user_settings`, `cycles`, `incomes`, `expenses`, `subscriptions`, `savings_buckets`, `savings_entries` – jede Zeile mit `user_id`, RLS-Regel `auth.uid() = user_id`.
- Änderungen werden lokal sofort gespeichert und ~0,7 s später gebündelt hochgeladen – **nur geänderte Zeilen**. Statusanzeige oben rechts: *Speichert … / Synchronisiert / Offline · wird nachgeholt*.
- Beim Öffnen der App bzw. Zurückkehren (und alle 2 Min.) werden Änderungen anderer Geräte geholt. Offline-Änderungen werden später nachgereicht.
- **Gast** und **Demo** bleiben bewusst lokal. Gast-Daten lassen sich nach dem Login unter ⚙️ in die Cloud übernehmen.

## 🐷 Sparen & Vermögen

- **Sparrate**: fester Betrag pro Monat, wird am Gehaltstag automatisch gebucht und **sofort vom „Frei verfügbar“ abgezogen** – getrennt von den Konsumausgaben („Gespart diesen Monat“).
- **Jetzt sparen**: spontane Beträge jederzeit.
- **Auto-Split**: Spartöpfe mit Prozentanteil (Standard: ETF-Depot 60 %, Tagesgeld 30 %, Urlaub & Rücklagen 10 %). Live-Prüfung auf **100 %**; Aufteilung auf den Cent genau. Neue Prozente gelten für künftige Einzahlungen.
- **Wallet-Karten** je Topf (Guthaben, Zuwachs diesen Monat, Anteil), Donut-Diagramm, Gesamtvermögen & Sparquote.
- **Historie & Entnahme**: alle Transfers chronologisch; Geld aus einem Topf zurück ins Monatsbudget buchen.

## 🧠 Budget-Logik

- Gehalt am **3.-letzten Werktag** des Monats (Wochenenden/Feiertage vorgezogen, Bundesland wählbar, pro Monat anpassbar).
- **Frei verfügbar** = Gehalt + Zusatzeinnahmen − Fixkosten − Abos − variable Ausgaben − Gespartes.
- **Tagesbudget** = Frei verfügbar ÷ Tage bis zum nächsten Gehalt.

## 📁 Struktur

```
index.html · manifest.json · sw.js · icon*.png/svg · supabase.sql · .nojekyll
css/app.css            Design (Hell + OLED-Dunkel, Safe Areas, Wallet-Karten, Skeleton)
js/config.js           ← SUPABASE_URL & SUPABASE_ANON_KEY
js/utils.js            Datum, Formatierung, Feiertage, Icons
js/storage.js          Konten (lokal / Supabase Auth), Sitzung
js/sync.js             Cloud-Sync: Tabellen-Mapping, Diff-Upload, Abgleich, Status
js/budget.js           Gehaltszyklus, Abos, Kennzahlen, Sparen, Beispieldaten
js/ui.js               Oberfläche, Formulare, Einstellungen
js/pwa.js              Service Worker & Installationshinweis
js/main.js             Start & Steuerung
tools/render-icons.ps1 PNG-Icons neu erzeugen
```

## 🛠 Lokal testen

```powershell
powershell -ExecutionPolicy Bypass -File .\start-server.ps1
```
→ <http://localhost:8080>
