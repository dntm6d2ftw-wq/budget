-- =========================================================================
-- Budget App – Supabase Setup (Version 3)
-- -------------------------------------------------------------------------
-- Einfach komplett in den Supabase "SQL Editor" einfügen und auf "Run".
-- Das Skript ist wiederholbar (idempotent): erneutes Ausführen schadet nicht.
--
-- Struktur: Jede Zeile gehört genau einem Nutzer (user_id). Row Level
-- Security erlaubt ausschließlich Zugriffe mit auth.uid() = user_id.
-- IDs werden von der App erzeugt (Text) → Offline-Bearbeitung möglich,
-- Primärschlüssel ist jeweils (user_id, id).
--
-- Hinweis: Die alte Tabelle "budgets" (Version 2, ein JSON pro Nutzer)
-- wird nicht mehr benötigt. Sie kann nach der Umstellung gelöscht werden:
--   drop table if exists public.budgets;
-- =========================================================================

-- ---------- Hilfsfunktion: updated_at automatisch setzen ----------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------- Einstellungen (1 Zeile pro Nutzer) ----------
create table if not exists public.user_settings (
  user_id          uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  settings         jsonb not null default '{}'::jsonb,   -- Theme, Werktage, Bundesland, Standardgehalt, Standard-Sparrate
  payday_overrides jsonb not null default '{}'::jsonb,   -- {"2026-10": "2026-10-27"} manuell verschobene Gehaltstage
  updated_at       timestamptz not null default now()
);

-- ---------- Gehaltszyklen ----------
create table if not exists public.cycles (
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id           text not null check (id ~ '^\d{4}-\d{2}$'),   -- Budgetmonat, z. B. "2026-11"
  start_date   date not null,                                -- Gehaltseingang (3. letzter Werktag des Vormonats)
  end_date     date not null,                                -- Tag vor dem nächsten Gehalt
  salary       numeric(12,2) not null default 0 check (salary >= 0),
  savings_rate numeric(12,2) not null default 0 check (savings_rate >= 0),
  limits       jsonb not null default '{}'::jsonb,           -- {"daily":400,"fuel":180,...}
  updated_at   timestamptz not null default now(),
  primary key (user_id, id),
  check (end_date >= start_date)
);

-- ---------- Zusatzeinnahmen ----------
create table if not exists public.incomes (
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id         text not null,
  cycle_key  text not null,
  title      text not null check (char_length(title) between 1 and 80),
  amount     numeric(12,2) not null check (amount > 0),
  date       date not null,
  note       text not null default '',
  created_at timestamptz default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

-- ---------- Ausgaben ----------
create table if not exists public.expenses (
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id              text not null,
  cycle_key       text not null,
  category        text not null check (category in ('fix', 'daily', 'fuel', 'hobby', 'misc')),
  sub_category    text,
  title           text not null check (char_length(title) between 1 and 80),
  amount          numeric(12,2) not null check (amount > 0),
  date            date not null,
  note            text not null default '',
  liters          numeric(8,2),
  price_per_liter numeric(6,3),
  km              integer,
  created_at      timestamptz default now(),
  updated_at      timestamptz not null default now(),
  primary key (user_id, id),
  -- "Sonstiges" verlangt immer eine Notiz
  constraint misc_requires_note check (category <> 'misc' or char_length(btrim(note)) > 0)
);

-- ---------- Abos & Verträge ----------
create table if not exists public.subscriptions (
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id            text not null,
  name          text not null check (char_length(name) between 1 and 60),
  amount        numeric(12,2) not null check (amount > 0),
  billing_day   smallint not null check (billing_day between 1 and 31),
  start_date    date,
  end_date      date,                                         -- Vertragsende (verlängert sich automatisch)
  notice_months smallint not null default 0 check (notice_months >= 0),   -- Kündigungsfrist
  renew_months  smallint not null default 12 check (renew_months >= 1),   -- Verlängerung
  cancelled     boolean not null default false,
  paused        boolean not null default false,
  note          text not null default '',
  updated_at    timestamptz not null default now(),
  primary key (user_id, id)
);

-- ---------- Spartöpfe ----------
create table if not exists public.savings_buckets (
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id         text not null,
  name       text not null check (char_length(name) between 1 and 40),
  percent    numeric(5,2) not null default 0 check (percent between 0 and 100),
  color      text not null default '#5856D6',
  sort_order integer not null default 0,
  archived   boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

-- ---------- Spar-Buchungen (Einzahlung > 0, Entnahme < 0) ----------
create table if not exists public.savings_entries (
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id         text not null,
  cycle_key  text not null,
  bucket_id  text not null,
  amount     numeric(12,2) not null check (amount <> 0),
  kind       text not null check (kind in ('rate', 'extra', 'withdrawal')),
  date       date not null,
  note       text not null default '',
  group_id   text not null,                                   -- fasst einen aufgeteilten Spar-Transfer zusammen
  created_at timestamptz default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id),
  foreign key (user_id, bucket_id) references public.savings_buckets (user_id, id) on delete cascade
);

-- ---------- Indizes ----------
create index if not exists incomes_cycle_idx         on public.incomes (user_id, cycle_key);
create index if not exists expenses_cycle_idx        on public.expenses (user_id, cycle_key);
create index if not exists savings_entries_cycle_idx on public.savings_entries (user_id, cycle_key);
create index if not exists savings_entries_bucket_idx on public.savings_entries (user_id, bucket_id);

-- ---------- Row Level Security, Rechte & Trigger für alle Tabellen ----------
do $$
declare
  t text;
begin
  foreach t in array array['user_settings', 'cycles', 'incomes', 'expenses', 'subscriptions', 'savings_buckets', 'savings_entries']
  loop
    execute format('alter table public.%I enable row level security', t);

    execute format('drop policy if exists %I on public.%I', t || '_select_own', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert_own', t);
    execute format('drop policy if exists %I on public.%I', t || '_update_own', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete_own', t);

    execute format('create policy %I on public.%I for select to authenticated using ((select auth.uid()) = user_id)', t || '_select_own', t);
    execute format('create policy %I on public.%I for insert to authenticated with check ((select auth.uid()) = user_id)', t || '_insert_own', t);
    execute format('create policy %I on public.%I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t || '_update_own', t);
    execute format('create policy %I on public.%I for delete to authenticated using ((select auth.uid()) = user_id)', t || '_delete_own', t);

    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);

    execute format('drop trigger if exists %I on public.%I', t || '_updated_at', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', t || '_updated_at', t);
  end loop;
end;
$$;
