alter table public.articulos
  add column if not exists estado_producto smallint
  check (estado_producto between 1 and 10);

notify pgrst, 'reload schema';
