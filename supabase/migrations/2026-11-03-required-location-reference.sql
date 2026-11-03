begin;

create or replace function public.guard_publication_text() returns trigger
language plpgsql security definer set search_path='' as $$
declare field text;problem text;value text;before_value jsonb:=case when tg_op='UPDATE' then to_jsonb(old) else '{}'::jsonb end;
begin
 new.location_reference:=trim(regexp_replace(coalesce(new.location_reference,''),'[[:space:]]+',' ','g'));
 -- Old blank references do not block reservation, moderation or delivery updates.
 -- Require a reference for new ads and when their editable content changes.
 if new.location_reference='' and (tg_op='INSERT' or
   jsonb_build_array(new.title,new.titulo,new.description,new.city,new.locality,new.category,new.categoria,new.subcategory,new.subcategoria,new.estado_producto,new.size_class,new.location_reference)
    is distinct from jsonb_build_array(old.title,old.titulo,old.description,old.city,old.locality,old.category,old.categoria,old.subcategory,old.subcategoria,old.estado_producto,old.size_class,old.location_reference)) then
  raise exception 'Escribe el barrio o una referencia general de ubicación.' using errcode='23514';
 end if;
 if length(new.location_reference)>100 then raise exception 'La referencia de ubicación debe tener máximo 100 caracteres.' using errcode='23514';end if;
 foreach field in array array['title','titulo','description','descripcion','location_reference'] loop
  value:=to_jsonb(new)->>field;
  if value is null or (tg_op='UPDATE' and value is not distinct from before_value->>field) then continue;end if;
  if field in ('title','titulo') and length(value)>160 then raise exception 'El título debe tener máximo 160 caracteres.' using errcode='23514';end if;
  problem:=public.publication_text_problem(value);
  if problem is not null then raise exception '%',problem using errcode='23514';end if;
 end loop;
 return new;
end $$;
notify pgrst,'reload schema';
commit;
