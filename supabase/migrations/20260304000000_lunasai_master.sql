
-- ==============================================================================
-- LUNAS AI - MASTER DATABASE MIGRATION (V1.1 + V1.1a)
-- Date: 2026-03-04 WIB
-- ==============================================================================

begin;

create extension if not exists pgcrypto;

-- 1) Core tables
create table if not exists public.products (
    product_id uuid primary key default gen_random_uuid(),
    creator_id uuid not null,
    prompt_text text not null check (char_length(prompt_text) between 1 and 500),
    storefront_slug text unique,
    status text check (status in ('draft','generating','links_ready','published','pending_review','error')) default 'draft',
    llm_model text,
    generation_error_code text,
    generation_error_message text,
    storefront_payload jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table public.products
add column if not exists storefront_payload jsonb;

create table if not exists public.tiers (
    tier_id uuid primary key default gen_random_uuid(),
    product_id uuid not null references public.products(product_id) on delete cascade,
    name text not null,
    price integer not null check (price >= 0),
    description text not null,
    mayar_payment_id text,
    mayar_link text check (mayar_link like 'https://%'),
    created_at timestamptz not null default now()
);

create table if not exists public.assets (
    asset_id uuid primary key default gen_random_uuid(),
    product_id uuid not null references public.products(product_id) on delete cascade,
    bucket text not null,
    path text not null,
    content_type text,
    size_bytes bigint check (size_bytes >= 0),
    sha256 text,
    is_private boolean default true,
    created_at timestamptz not null default now()
);

create table if not exists public.jobs (
    job_id uuid primary key default gen_random_uuid(),
    product_id uuid not null references public.products(product_id) on delete cascade,
    status text check (status in ('queued','running','succeeded','failed')) not null default 'queued',
    started_at timestamptz,
    finished_at timestamptz,
    attempt int not null default 0 check (attempt >= 0),
    error_code text,
    created_at timestamptz not null default now()
);

create table if not exists public.purchases (
    purchase_id uuid primary key default gen_random_uuid(),
    product_id uuid not null references public.products(product_id),
    tier_id uuid not null references public.tiers(tier_id),
    buyer_email text not null,
    status text check (status in ('initiated','paid','failed','refunded')) default 'initiated',
    provider text default 'mayar',
    provider_payment_id text unique,
    paid_at timestamptz,
    retention_delete_after timestamptz default now() + interval '365 days',
    created_at timestamptz not null default now()
);

create table if not exists public.delivery_tokens (
    token_id uuid primary key default gen_random_uuid(),
    purchase_id uuid not null unique references public.purchases(purchase_id),
    delivery_token_hash text unique not null,
    expires_at timestamptz not null,
    download_count int default 0 check (download_count >= 0),
    download_limit int default 3 check (download_limit between 1 and 10),
    last_download_at timestamptz,
    revoked_at timestamptz,
    created_at timestamptz not null default now()
);

create table if not exists public.webhook_events (
    event_id text primary key,
    provider text default 'mayar',
    received_at timestamptz not null default now(),
    payload jsonb not null,
    processed_at timestamptz,
    process_status text check (process_status in ('ok','duplicate','error')),
    error_code text,
    retention_delete_after timestamptz default now() + interval '90 days'
);

create table if not exists public.audit_log (
    audit_id uuid primary key default gen_random_uuid(),
    actor_id uuid,
    action text not null,
    target_type text not null,
    target_id text not null,
    metadata jsonb,
    created_at timestamptz not null default now()
);

-- 2) V1.1a checkout sessions (Option A Pattern A)
create table if not exists public.checkout_sessions (
    checkout_session_id uuid primary key default gen_random_uuid(),
    tier_id uuid not null references public.tiers(tier_id) on delete cascade,
    product_id uuid not null references public.products(product_id) on delete cascade,
    mayar_transaction_id text unique,
    status text not null default 'created' check (status in ('created','paid','expired')),
    delivery_token_plain text,
    created_at timestamptz not null default now(),
    expires_at timestamptz not null default (now() + interval '2 hours')
);

-- 3) Indexes
create index if not exists idx_tiers_product_id on public.tiers(product_id);
create index if not exists idx_assets_product_id on public.assets(product_id);
create index if not exists idx_jobs_product_id on public.jobs(product_id);
create index if not exists idx_purchases_product_id on public.purchases(product_id);
create index if not exists idx_purchases_tier_id on public.purchases(tier_id);
create index if not exists idx_delivery_tokens_expires_at on public.delivery_tokens(expires_at);
create index if not exists idx_webhook_events_received_at on public.webhook_events(received_at);
create index if not exists idx_checkout_sessions_expires_at on public.checkout_sessions(expires_at);

create unique index if not exists uq_tiers_mayar_payment_id
on public.tiers(mayar_payment_id)
where mayar_payment_id is not null;

-- 4) Triggers
create or replace function public.normalize_buyer_email()
returns trigger
language plpgsql
as $$
begin
  if new.buyer_email is not null then
    new.buyer_email := lower(trim(new.buyer_email));
  end if;
  return new;
end;
$$;

drop trigger if exists purchases_normalize_buyer_email on public.purchases;
create trigger purchases_normalize_buyer_email
before insert or update on public.purchases
for each row execute function public.normalize_buyer_email();

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists products_touch_updated_at on public.products;
create trigger products_touch_updated_at
before update on public.products
for each row execute function public.touch_updated_at();

-- 5) RLS enable + force
alter table public.products enable row level security;
alter table public.tiers enable row level security;
alter table public.assets enable row level security;
alter table public.jobs enable row level security;
alter table public.purchases enable row level security;
alter table public.delivery_tokens enable row level security;
alter table public.webhook_events enable row level security;
alter table public.audit_log enable row level security;
alter table public.checkout_sessions enable row level security;

alter table public.products force row level security;
alter table public.tiers force row level security;
alter table public.assets force row level security;
alter table public.jobs force row level security;
alter table public.purchases force row level security;
alter table public.delivery_tokens force row level security;
alter table public.webhook_events force row level security;
alter table public.audit_log force row level security;
alter table public.checkout_sessions force row level security;

-- 6) Helper functions
create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false);
$$;

create or replace function public.is_product_owner(p_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from public.products p
    where p.product_id = p_id and p.creator_id = auth.uid()
  );
$$;

-- 7) Policies
-- Products
drop policy if exists products_select_own on public.products;
create policy products_select_own
on public.products for select to authenticated
using (creator_id = auth.uid() or public.is_admin());

drop policy if exists products_insert_own on public.products;
create policy products_insert_own
on public.products for insert to authenticated
with check (creator_id = auth.uid() or public.is_admin());

drop policy if exists products_update_own on public.products;
create policy products_update_own
on public.products for update to authenticated
using (creator_id = auth.uid() or public.is_admin())
with check (creator_id = auth.uid() or public.is_admin());

drop policy if exists products_select_published_anon on public.products;
create policy products_select_published_anon
on public.products for select to anon
using (status = 'published');

-- Tiers
drop policy if exists tiers_select_owner on public.tiers;
create policy tiers_select_owner
on public.tiers for select to authenticated
using (public.is_product_owner(product_id) or public.is_admin());

drop policy if exists tiers_insert_owner on public.tiers;
create policy tiers_insert_owner
on public.tiers for insert to authenticated
with check (public.is_product_owner(product_id) or public.is_admin());

drop policy if exists tiers_update_owner on public.tiers;
create policy tiers_update_owner
on public.tiers for update to authenticated
using (public.is_product_owner(product_id) or public.is_admin())
with check (public.is_product_owner(product_id) or public.is_admin());

drop policy if exists tiers_select_published_anon on public.tiers;
create policy tiers_select_published_anon
on public.tiers for select to anon
using (
  exists (
    select 1
    from public.products p
    where p.product_id = public.tiers.product_id
      and p.status = 'published'
  )
);

-- Assets
drop policy if exists assets_select_owner on public.assets;
create policy assets_select_owner
on public.assets for select to authenticated
using (public.is_product_owner(product_id) or public.is_admin());

drop policy if exists assets_insert_owner on public.assets;
create policy assets_insert_owner
on public.assets for insert to authenticated
with check (public.is_product_owner(product_id) or public.is_admin());

-- Jobs (read-only for creator; writes via backend)
drop policy if exists jobs_select_owner on public.jobs;
create policy jobs_select_owner
on public.jobs for select to authenticated
using (public.is_product_owner(product_id) or public.is_admin());

-- Purchases (read-only for creator; writes via backend)
drop policy if exists purchases_select_owner on public.purchases;
create policy purchases_select_owner
on public.purchases for select to authenticated
using (public.is_product_owner(product_id) or public.is_admin());

-- Operational tables: admin read
drop policy if exists webhook_events_select_admin on public.webhook_events;
create policy webhook_events_select_admin
on public.webhook_events for select to authenticated
using (public.is_admin());

drop policy if exists delivery_tokens_select_admin on public.delivery_tokens;
create policy delivery_tokens_select_admin
on public.delivery_tokens for select to authenticated
using (public.is_admin());

drop policy if exists audit_select_admin on public.audit_log;
create policy audit_select_admin
on public.audit_log for select to authenticated
using (public.is_admin());

-- Checkout sessions: service + admin read; backend-only writes
drop policy if exists checkout_sessions_select_admin on public.checkout_sessions;
create policy checkout_sessions_select_admin
on public.checkout_sessions for select to authenticated
using (public.is_admin());

drop policy if exists checkout_sessions_all_service_role on public.checkout_sessions;
create policy checkout_sessions_all_service_role
on public.checkout_sessions for all to service_role
using (true) with check (true);

-- 8) RPC: delivery token consumption
create or replace function public.consume_delivery_token(
    p_token_plain text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_token_hash text;
    v_token_row public.delivery_tokens%rowtype;
begin
    if p_token_plain is null or length(trim(p_token_plain)) = 0 then
        return jsonb_build_object('status','error','error_code','invalid_token');
    end if;

    v_token_hash := encode(digest(trim(p_token_plain), 'sha256'), 'hex');

    select *
      into v_token_row
    from public.delivery_tokens
    where delivery_token_hash = v_token_hash
    for update;

    if not found then
        return jsonb_build_object('status','error','error_code','invalid_token');
    end if;

    if v_token_row.revoked_at is not null then
        return jsonb_build_object('status','error','error_code','token_revoked');
    end if;

    if v_token_row.expires_at <= now() then
        return jsonb_build_object('status','error','error_code','token_expired');
    end if;

    if v_token_row.download_count >= v_token_row.download_limit then
        return jsonb_build_object('status','error','error_code','download_limit_reached');
    end if;

    update public.delivery_tokens
      set download_count = download_count + 1,
          last_download_at = now()
    where token_id = v_token_row.token_id;

    return jsonb_build_object(
        'status','ok',
        'purchase_id',v_token_row.purchase_id
    );
end;
$$;

revoke all on function public.consume_delivery_token(text) from public;
grant execute on function public.consume_delivery_token(text) to service_role;

-- 9) RPC: atomic webhook processor
create or replace function public.process_mayar_webhook(
    p_event_id text,
    p_payment_link_id text,
    p_customer_email text,
    p_amount integer,
    p_occurred_at timestamptz,
    p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_tier_id uuid;
    v_product_id uuid;
    v_purchase_id uuid;
    v_email text;
    v_expected_price integer;
    v_token_plain text;
    v_token_hash text;
    v_expires_at timestamptz := now() + interval '24 hours';
    v_rowcount integer := 0;
begin
    if p_event_id is null or length(trim(p_event_id)) = 0 then
        return jsonb_build_object('status','error','error_code','invalid_input');
    end if;

    insert into public.webhook_events (event_id, provider, received_at, payload, process_status)
    values (p_event_id, 'mayar', now(), p_payload, 'ok')
    on conflict (event_id) do nothing;

    get diagnostics v_rowcount = row_count;
    if v_rowcount = 0 then
        return jsonb_build_object('status','duplicate','event_id',p_event_id);
    end if;

    select t.tier_id, t.product_id, t.price
      into v_tier_id, v_product_id, v_expected_price
    from public.tiers t
    where t.mayar_payment_id = p_payment_link_id
    limit 1;

    if v_tier_id is null then
        update public.webhook_events
          set process_status='error', processed_at=now(), error_code='unknown_payment_link'
        where event_id = p_event_id;

        return jsonb_build_object('status','error','error_code','unknown_payment_link');
    end if;

    if p_amount is not null and v_expected_price is not null and p_amount <> v_expected_price then
        update public.webhook_events
          set process_status='error', processed_at=now(), error_code='amount_mismatch'
        where event_id = p_event_id;

        return jsonb_build_object('status','error','error_code','amount_mismatch');
    end if;

    v_email := lower(trim(coalesce(p_customer_email,'')));

    insert into public.purchases (purchase_id, product_id, tier_id, buyer_email, status, provider, provider_payment_id, paid_at)
    values (gen_random_uuid(), v_product_id, v_tier_id, v_email, 'paid', 'mayar', p_event_id, now())
    on conflict (provider_payment_id) do update
      set status = excluded.status,
          paid_at = excluded.paid_at,
          buyer_email = excluded.buyer_email,
          product_id = excluded.product_id,
          tier_id = excluded.tier_id
    returning purchase_id into v_purchase_id;

    v_token_plain := gen_random_uuid()::text;
    v_token_hash := encode(digest(v_token_plain, 'sha256'), 'hex');

    insert into public.delivery_tokens (token_id, purchase_id, delivery_token_hash, expires_at)
    values (gen_random_uuid(), v_purchase_id, v_token_hash, v_expires_at);

    update public.webhook_events
      set processed_at=now(), process_status='ok'
    where event_id = p_event_id;

    return jsonb_build_object(
        'status','ok',
        'event_id',p_event_id,
        'purchase_id',v_purchase_id,
        'product_id',v_product_id,
        'tier_id',v_tier_id,
        'delivery_token',v_token_plain,
        'expires_at',v_expires_at
    );
end;
$$;

revoke all on function public.process_mayar_webhook(text, text, text, integer, timestamptz, jsonb) from public;
grant execute on function public.process_mayar_webhook(text, text, text, integer, timestamptz, jsonb) to service_role;

commit;
