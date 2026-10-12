-- Profile settings (beta feedback): the person's age and the plan they chose. Both optional / defaulted, so applying this
-- changes nothing for existing accounts. The app keeps working without it (the settings say it is not set up yet).
alter table public.accounts add column if not exists age smallint check (age is null or (age between 3 and 120));
alter table public.accounts add column if not exists plan text not null default 'free' check (plan in ('free', 'paid'));
