/* =========================================================================
   config.js – HIER die Supabase-Zugangsdaten eintragen
   -------------------------------------------------------------------------
   Zu finden im Supabase-Dashboard unter:
     Project Settings → API (bzw. "Connect")
       • Project URL            → SUPABASE_URL
       • anon / publishable key → SUPABASE_ANON_KEY

   Leer lassen = lokaler Modus (Konten & Daten nur in diesem Browser).
   Ausgefüllt  = Cloud-Modus: Registrierung/Login über Supabase, alle Daten
                 synchron auf iPhone, iPad und PC.

   Der anon-Key ist für den Browser gedacht und darf öffentlich sein –
   die Datentrennung erzwingen die Row-Level-Security-Regeln (supabase.sql).
   NIEMALS den "service_role"-Key hier eintragen!
   ========================================================================= */
const SUPABASE_URL = 'https://egxuvuuxshhtqshbqqro.supabase.co';   // Projekt "budget" (Frankfurt)
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVneHV2dXV4c2hodHFzaGJxcXJvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTU2MDgwOTUsImV4cCI6MjExMTE4NDA5NX0.E58Cw0W6jylifKsmqzHvVjtbA4Khxl3ZKUW5dclDbV0';

window.BUDGET_CONFIG = {
  supabaseUrl: SUPABASE_URL,
  supabaseAnonKey: SUPABASE_ANON_KEY,
  noDownloads: false,   // true = Export-Buttons ausblenden (Umgebungen, die Downloads blockieren)
  embedded: false,      // true = kein Installationshinweis (z. B. eingebettete Vorschau)
};
