begin;

create extension if not exists pgcrypto;

-- Align products with the backend storefront persistence contract.
alter table public.products
add column if not exists storefront_payload jsonb not null default '{}'::jsonb;

-- Align delivery token consumption with the backend RPC signature:
-- supabase.rpc("consume_delivery_token", {"p_token_plain": delivery_token})
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
        return jsonb_build_object('status', 'error', 'error_code', 'invalid_token');
    end if;

    v_token_hash := encode(digest(trim(p_token_plain), 'sha256'), 'hex');

    select *
      into v_token_row
    from public.delivery_tokens
    where delivery_token_hash = v_token_hash
    for update;

    if not found then
        return jsonb_build_object('status', 'error', 'error_code', 'invalid_token');
    end if;

    if v_token_row.revoked_at is not null then
        return jsonb_build_object('status', 'error', 'error_code', 'token_revoked');
    end if;

    if v_token_row.expires_at <= now() then
        return jsonb_build_object('status', 'error', 'error_code', 'token_expired');
    end if;

    if v_token_row.download_count >= v_token_row.download_limit then
        return jsonb_build_object('status', 'error', 'error_code', 'download_limit_reached');
    end if;

    update public.delivery_tokens
       set download_count = download_count + 1,
           last_download_at = now()
     where token_id = v_token_row.token_id;

    return jsonb_build_object(
        'status', 'ok',
        'purchase_id', v_token_row.purchase_id
    );
end;
$$;

revoke all on function public.consume_delivery_token(text) from public;
grant execute on function public.consume_delivery_token(text) to service_role;

commit;
