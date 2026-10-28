begin;
create table if not exists public.publication_text_rules (
 id uuid primary key default gen_random_uuid(),term text not null check(length(term) between 3 and 80),
 term_key text not null unique,active boolean not null default true,updated_at timestamptz not null default now()
);
alter table public.publication_text_rules enable row level security;
revoke all on public.publication_text_rules from public,anon,authenticated;

create or replace function public.publication_text_fold(p_text text) returns text
language sql immutable set search_path='' as $$
 select regexp_replace(translate(translate(lower(normalize(coalesce(p_text,''),NFKC)),
 'áéíóúüñàèìòùâêîôûãõäëïöåçаесорхуіјѕοα','aeiouunaeiouaeiouaoaeioacaecopxyijsoa'),
 U&'\200B\200C\200D\200E\200F\202A\202B\202C\202D\202E\2060\2061\2062\2063\2064\2065\2066\2067\2068\2069\206A\206B\206C\206D\206E\206F\FEFF\FE0F\20E3',''),U&'[\0300-\036F]','','g');
$$;
create or replace function public.publication_match_key(p_text text) returns text
language plpgsql immutable set search_path='' as $$
declare t text:=public.publication_text_fold(p_text);piece text;
begin
 for piece in select m[1] from regexp_matches(t,'(\m(?:[a-z0-9][. _-]+){2,}[a-z0-9]\M)','g') m loop
  t:=replace(t,piece,regexp_replace(piece,'[. _-]','','g'));
 end loop;
 t:=translate(t,'431057!@$','aeiostias');
 return btrim(regexp_replace(t,'[^a-z0-9]+',' ','g'));
end $$;
create or replace function public.publication_text_problem(p_text text) returns text
language plpgsql stable security definer set search_path='' as $$
declare t text;address text;numeric_text text;candidate text;digits text;piece text;matching text;
 number_words text[]:=array['cero','uno','dos','tres','cuatro','cinco','seis','siete','ocho','nueve'];i integer;position integer;
 contact_error text:='No publiques datos de contacto, correos ni redes sociales. Corrige el título o la descripción y usa el chat interno de MiBatute.';
begin
 if length(coalesce(p_text,''))>4000 then return 'Usa un texto de máximo 4.000 caracteres.';end if;
 t:=public.publication_text_fold(p_text);
 for piece in select m[1] from regexp_matches(t,'(\m(?:[a-z][. _-]+){2,}[a-z]\M)','g') m loop
  t:=replace(t,piece,regexp_replace(piece,'[. _-]','','g'));
 end loop;
 address:=regexp_replace(regexp_replace(translate(t,'()[]','    '),'\m(arroba|at)\M','@','g'),'\m(punto|dot)\M','.','g');
 address:=regexp_replace(address,'\s*([@.])\s*','\1','g');
 if address~'[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,24}\M'
  or address~'\m(https?://|www\.)[^[:space:]]+'
  or address~'\m[a-z0-9-]+(\.[a-z0-9-]+)*\.(com|co|net|org|io|me|link|app|xyz|site|online|es|info|ly)(\M|/)'
  or t~'(^|[[:space:](])@[a-z0-9_][a-z0-9_.]{1,29}\M'
  or t~'\m(whatsapp|whats app|wasap|wsp|wpp|instagram|facebook|tiktok|telegram|twitter|discord|linkedin|ig|fb)\s*[:@/]\s*[a-z0-9]'
  or t~'\m(mi|buscame en|sigueme en|contactame por|escribeme por)\s+(whatsapp|instagram|facebook|tiktok|telegram|twitter|ig|fb)\M' then return contact_error;end if;
 numeric_text:=t;
 for i in 1..10 loop numeric_text:=regexp_replace(numeric_text,'\m'||number_words[i]||'\M',(i-1)::text,'g');end loop;
 for candidate in select m[1] from regexp_matches(numeric_text,'((?<![a-z0-9])\+?[0-9]([[:space:]().-]*[0-9]){6,14}(?![a-z0-9]))','g') m loop
  digits:=regexp_replace(candidate,'[^0-9]','','g');position:=strpos(numeric_text,candidate);
  if digits~'^(57)?3[0-9]{9}$' or (left(candidate,1)='+' and length(digits)>=8)
   or substring(numeric_text from greatest(1,position-45) for least(45,position-1))~'\m(tel|telefono|cel|celular|llamame|llamar|whatsapp|wsp|contacto)\M' then return contact_error;end if;
 end loop;
 matching:=' '||public.publication_match_key(p_text)||' ';
 if exists(select 1 from public.publication_text_rules r where r.active and
  strpos(matching,' '||r.term_key||' ')>0) then
  return 'El texto contiene una palabra o frase no permitida. Corrígelo antes de publicar; si crees que es un error, contacta al equipo desde tu buzón.';
 end if;
 return null;
end $$;

create or replace function public.publication_text_rules() returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(term order by term_key),'[]'::jsonb) from (select term,term_key from public.publication_text_rules where active order by term_key limit 200) r;
$$;
revoke all on function public.publication_text_rules() from public;
grant execute on function public.publication_text_rules() to anon,authenticated;

create or replace function public.staff_publication_rules() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 perform public.staff_require('team');
 return (select coalesce(jsonb_agg(to_jsonb(r) order by r.term_key),'[]'::jsonb) from public.publication_text_rules r);
end $$;
create or replace function public.staff_save_publication_rule(p_id uuid,p_term text,p_active boolean,p_version timestamptz default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare clean text:=btrim(p_term);key text;previous public.publication_text_rules%rowtype;result public.publication_text_rules%rowtype;
begin
 perform public.staff_require('team');
 if clean is null or length(clean) not between 3 and 80 or p_active is null then
  raise exception 'Escribe una palabra o frase de 3 a 80 caracteres, sin números ni expresiones regulares (máximo 8 palabras).';end if;
 key:=public.publication_match_key(clean);
 if length(key) not between 3 and 80 or public.publication_text_fold(clean)!~'^[a-z]+( +[a-z]+){0,7}$' then
  raise exception 'Escribe una palabra o frase de 3 a 80 caracteres, sin números ni expresiones regulares (máximo 8 palabras).';end if;
 perform pg_advisory_xact_lock(20261028,1);
 if p_id is null then
  if (select count(*) from public.publication_text_rules)>=200 then raise exception 'Se permiten hasta 200 reglas. Edita una regla existente.';end if;
  insert into public.publication_text_rules(term,term_key,active) values(clean,key,p_active) returning * into result;
 else
  select * into previous from public.publication_text_rules where id=p_id for update;
  if not found or previous.updated_at is distinct from p_version then raise exception 'La regla cambió. Actualiza antes de guardar.';end if;
  update public.publication_text_rules set term=clean,term_key=key,active=p_active,updated_at=clock_timestamp() where id=p_id returning * into result;
 end if;
 insert into public.staff_audit(actor_id,action,reason,changes) values(auth.uid(),'settings.publication_rule','Actualizar filtro de publicaciones',jsonb_build_object('before',to_jsonb(previous),'after',to_jsonb(result)));
 return to_jsonb(result);
exception when unique_violation then raise exception 'Esta palabra o frase ya existe en el filtro.';
end $$;
revoke all on function public.staff_publication_rules(),public.staff_save_publication_rule(uuid,text,boolean,timestamptz) from public,anon;
grant execute on function public.staff_publication_rules(),public.staff_save_publication_rule(uuid,text,boolean,timestamptz) to authenticated;

create or replace function public.guard_publication_text() returns trigger
language plpgsql security definer set search_path='' as $$
declare field text;problem text;value text;before_value jsonb:=case when tg_op='UPDATE' then to_jsonb(old) else '{}'::jsonb end;
begin
 foreach field in array array['title','titulo','description','descripcion'] loop
  value:=to_jsonb(new)->>field;
  if value is null or (tg_op='UPDATE' and value is not distinct from before_value->>field) then continue;end if;
  if field in ('title','titulo') and length(value)>160 then raise exception 'El título debe tener máximo 160 caracteres.' using errcode='23514';end if;
  problem:=public.publication_text_problem(value);
  if problem is not null then raise exception '%',problem using errcode='23514';end if;
 end loop;
 return new;
end $$;
revoke all on function public.guard_publication_text(),public.publication_text_fold(text),public.publication_match_key(text),public.publication_text_problem(text) from public,anon,authenticated;
drop trigger if exists guard_publication_text on public.articulos;
create trigger guard_publication_text before insert or update on public.articulos for each row
 execute function public.guard_publication_text();
notify pgrst,'reload schema';
commit;
