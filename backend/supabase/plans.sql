-- Subscription plans. Run in the Supabase SQL editor; safe to re-run.
--
-- Ids matter here:
--   1-3  monthly plans, shown on the pricing section in this order
--   4-6  their annual counterparts (30% off, matching the toggle's promise)
--   7    the trial tier new signups land on. The landing page filters id 7 out
--        deliberately, which is what keeps it off the pricing table.

insert into public.plans (id, name, price, is_monthly, daily_limit, daily_chat_limit, features) values

-- Monthly
(1, 'חבילה בסיסית', 95, true, 3, 0, array[
  '3 ניתוחים ביום',
  'כלים לניהול סיכונים',
  'תמיכה במכשירים שונים',
  'השקת מטבע קריפטו משלך ₿',
  'תמיכה במייל'
]),
(2, 'חבילת מקצוען', 145, true, 6, 0, array[
  '6 ניתוחים ביום',
  'כלים לניהול סיכונים',
  'תמיכה במכשירים שונים',
  'כל סוגי הנכסים',
  'השקת מטבע קריפטו משלך ₿',
  'תמיכה VIP 24/7'
]),
(3, 'חבילת מאסטר', 245, true, 25, 100, array[
  '25 ניתוחים ביום',
  'כלים לניהול סיכונים',
  'תמיכה במכשירים שונים',
  'כל סוגי הנכסים',
  'השקת מטבע קריפטו משלך ₿',
  'תמיכה VIP 24/7',
  'תשאל את האשף 🧙 - צ''אט AI'
]),

-- Annual: 12 months less 30%, stored as the full yearly charge because the
-- pricing card divides by 12 itself to show a monthly figure.
(4, 'חבילה בסיסית - שנתי', 798, false, 3, 0, array[
  '3 ניתוחים ביום',
  'חיסכון של 30% מול חיוב חודשי',
  'כלים לניהול סיכונים',
  'תמיכה במכשירים שונים',
  'השקת מטבע קריפטו משלך ₿',
  'תמיכה במייל'
]),
(5, 'חבילת מקצוען - שנתי', 1218, false, 6, 0, array[
  '6 ניתוחים ביום',
  'חיסכון של 30% מול חיוב חודשי',
  'כלים לניהול סיכונים',
  'תמיכה במכשירים שונים',
  'כל סוגי הנכסים',
  'השקת מטבע קריפטו משלך ₿',
  'תמיכה VIP 24/7'
]),
(6, 'חבילת מאסטר - שנתי', 2058, false, 25, 100, array[
  '25 ניתוחים ביום',
  'חיסכון של 30% מול חיוב חודשי',
  'כלים לניהול סיכונים',
  'תמיכה במכשירים שונים',
  'כל סוגי הנכסים',
  'השקת מטבע קריפטו משלך ₿',
  'תמיכה VIP 24/7',
  'תשאל את האשף 🧙 - צ''אט AI'
]),

-- Trial tier. Hidden from pricing; every new signup starts here.
(7, 'תקופת ניסיון', 0, true, 3, 0, array[
  '3 ניתוחים ביום',
  'גישה למחשבון ולאזור הלימוד'
])

on conflict (id) do update set
  name             = excluded.name,
  price            = excluded.price,
  is_monthly       = excluded.is_monthly,
  daily_limit      = excluded.daily_limit,
  daily_chat_limit = excluded.daily_chat_limit,
  features         = excluded.features;

select setval(pg_get_serial_sequence('public.plans','id'), greatest((select max(id) from public.plans), 1));

-- New signups must land on the trial tier, not on plan 1 - which is now a paid
-- plan and would otherwise be handed out for free.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_profiles (user_id, name, avatar_url, plan_id)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'avatar_url',
    7
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Existing accounts were created against the old free tier at id 1, which is a
-- paid plan now. Move them onto the trial tier instead.
update public.user_profiles set plan_id = 7 where plan_id = 1;

select id, name, price, is_monthly, daily_limit, daily_chat_limit
from public.plans order by id;
