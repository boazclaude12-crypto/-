-- Let people sign up and be signed in immediately.
--
-- Supabase requires address confirmation by default. On a project with no
-- custom SMTP that means every new user waits on a mail that is rate-limited to
-- a handful per hour and frequently filed as spam — so in practice nobody gets
-- in. This marks new accounts confirmed at insert time, which is what the
-- dashboard toggle does, without depending on where that toggle currently lives.
--
-- Trade-off: addresses are no longer proven. That is acceptable while payment
-- is what establishes a real customer. To require real verification later,
-- configure custom SMTP, then drop this trigger — the signup flow handles both
-- cases already and needs no code change.

create or replace function public.auto_confirm_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email_confirmed_at is null then
    new.email_confirmed_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists auto_confirm_email_trigger on auth.users;
create trigger auto_confirm_email_trigger
  before insert on auth.users
  for each row execute function public.auto_confirm_email();

-- Anyone who signed up before this and is still waiting on a mail that never
-- arrived.
update auth.users
set email_confirmed_at = now()
where email_confirmed_at is null;

select email, email_confirmed_at from auth.users order by created_at desc limit 10;
