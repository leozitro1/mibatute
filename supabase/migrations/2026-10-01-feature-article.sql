-- Debit and highlighting commit together; retries cannot charge twice.
create or replace function public.feature_article(p_articulo_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_article public.articulos%rowtype;
  v_balance integer;
begin
  if v_uid is null then
    raise exception 'Debes iniciar sesion.' using errcode = '42501';
  end if;
  select * into v_article from public.articulos where id = p_articulo_id for update;
  if not found or v_article.owner_id is distinct from v_uid then
    raise exception 'Solo puedes destacar tus publicaciones.' using errcode = '42501';
  end if;
  if exists (select 1 from public.usuarios where id = v_uid and (is_blocked or bloqueado)) then
    raise exception 'Tu cuenta esta bloqueada.' using errcode = '42501';
  end if;
  select saldo into v_balance from public.cupos where usuario_id = v_uid for update;
  if v_article.is_featured then
    return jsonb_build_object('article', to_jsonb(v_article), 'balance', coalesce(v_balance, 0));
  end if;
  if coalesce(v_balance, 0) < 1 then
    raise exception 'No tienes creditos suficientes para destacar.';
  end if;
  update public.cupos set saldo = saldo - 1, updated_at = now()
    where usuario_id = v_uid returning saldo into v_balance;
  insert into public.cupos_historial (usuario_id, cantidad, concepto, referencia_id)
    values (v_uid, -1, 'destacado', p_articulo_id);
  update public.articulos set is_featured = true, updated_at = now()
    where id = p_articulo_id returning * into v_article;
  return jsonb_build_object('article', to_jsonb(v_article), 'balance', v_balance);
end;
$$;

revoke all on function public.feature_article(uuid) from public, anon;
grant execute on function public.feature_article(uuid) to authenticated;
notify pgrst, 'reload schema';
