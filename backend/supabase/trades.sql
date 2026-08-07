-- Trade journal / performance tracking.
-- Run this once in the Supabase SQL editor.

create table if not exists public.trades (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  created_at    timestamptz not null default now(),
  opened_at     timestamptz not null default now(),
  closed_at     timestamptz,

  symbol        text not null,
  asset_type    text,
  direction     text not null default 'long' check (direction in ('long','short')),

  entry_price   numeric not null check (entry_price > 0),
  stop_loss     numeric check (stop_loss > 0),
  take_profit   numeric check (take_profit > 0),
  exit_price    numeric check (exit_price > 0),

  -- Notional value of the position, in the user's currency.
  position_size numeric not null default 0 check (position_size >= 0),

  status        text not null default 'open' check (status in ('open','closed')),
  notes         text,
  analysis_id   bigint
);

create index if not exists trades_user_opened_idx
  on public.trades (user_id, opened_at desc);

alter table public.trades enable row level security;

drop policy if exists "trades_select_own" on public.trades;
create policy "trades_select_own" on public.trades
  for select using (auth.uid() = user_id);

drop policy if exists "trades_insert_own" on public.trades;
create policy "trades_insert_own" on public.trades
  for insert with check (auth.uid() = user_id);

drop policy if exists "trades_update_own" on public.trades;
create policy "trades_update_own" on public.trades
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "trades_delete_own" on public.trades;
create policy "trades_delete_own" on public.trades
  for delete using (auth.uid() = user_id);
