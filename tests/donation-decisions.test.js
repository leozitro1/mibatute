import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const owner = '11111111-1111-1111-1111-111111111111';
const applicant = '22222222-2222-2222-2222-222222222222';
const other = '33333333-3333-3333-3333-333333333333';
const article = '44444444-4444-4444-4444-444444444444';

test('donation decisions enforce cooldown, privacy and accepted-only chats', async t => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create schema auth;
      create function auth.uid() returns uuid language sql stable as
        'select nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
      create table public.articulos(id uuid primary key,owner_id uuid,usuario_id uuid,
        mode text default 'donacion',estado text default 'disponible',status text default 'disponible',
        ganador_id uuid,winner_id uuid,recipient_id uuid,buyer_id uuid,title text,city text,locality text,price numeric,
        image_url text,imagen_url_principal text,imagenes jsonb,delivered_at timestamptz,updated_at timestamptz,created_at timestamptz default now());
      create table public.postulaciones(id uuid default gen_random_uuid() primary key,articulo_id uuid,usuario_id uuid,
        justificacion text,created_at timestamptz default now(),unique(articulo_id,usuario_id));
      create table public.postulaciones_rechazadas(id uuid default gen_random_uuid() primary key,articulo_id uuid,usuario_id uuid,
        created_at timestamptz default now(),unique(articulo_id,usuario_id));
      create table public.chats(id uuid default gen_random_uuid() primary key,articulo_id uuid,buyer_id uuid,seller_id uuid,
        owner_id uuid,usuario_id uuid,status text,updated_at timestamptz,unique(articulo_id,buyer_id));
      create table public.chat_messages(chat_id uuid,sender_id uuid,body text);
      create table public.articulo_imagenes(id uuid default gen_random_uuid(),articulo_id uuid,url text,position int);
      alter table public.articulos enable row level security;
      create policy article_read on public.articulos for select using(true);
      create policy owner_update on public.articulos for update using(owner_id=auth.uid());
      alter table public.postulaciones enable row level security;
      create policy post_read on public.postulaciones for select using(usuario_id=auth.uid()
        or exists(select 1 from public.articulos a where a.id=articulo_id and a.owner_id=auth.uid()));
      create policy post_insert on public.postulaciones for insert with check(usuario_id=auth.uid());
      create policy post_delete on public.postulaciones for delete using(usuario_id=auth.uid()
        or exists(select 1 from public.articulos a where a.id=articulo_id and a.owner_id=auth.uid()));
      alter table public.postulaciones_rechazadas enable row level security;
      grant usage on schema auth,public to authenticated;
      grant select,insert,update,delete on all tables in schema public to authenticated;
    `);
    const migration = await readFile(new URL('../supabase/migrations/2026-10-01-donation-decisions.sql', import.meta.url), 'utf8');
    await db.exec(migration);
    const asUser = async id => {
      await db.exec('reset role; set role authenticated;');
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
    };
    const reset = async () => {
      await db.exec('reset role; truncate public.chats,public.chat_messages,public.postulaciones,public.postulaciones_rechazadas,public.articulos;');
      await db.query('insert into public.articulos(id,owner_id,title) values($1,$2,$3)', [article,owner,'Mesa']);
    };
    const apply = () => db.query('insert into public.postulaciones(articulo_id,usuario_id,justificacion) values($1,auth.uid(),$2)', [article,'Para mi casa']);
    const rows = async () => (await db.query('select public.my_rescue_applications() as row')).rows.map(r => r.row);

    await t.test('owner rejection persists for 24 hours; deleting or hiding it cannot bypass cooldown', async () => {
      await reset(); await asUser(applicant); await apply();
      assert.equal((await rows())[0]._source, 'postulaciones');
      await asUser(owner);
      await db.query('delete from public.postulaciones where articulo_id=$1', [article]);
      await asUser(applicant);
      const rejected = await rows();
      assert.equal(rejected.length, 1);
      assert.equal(rejected[0]._source, 'rechazadas');
      assert.ok(rejected[0]._rejectedAt);
      await db.query('delete from public.postulaciones_rechazadas where articulo_id=$1', [article]);
      await assert.rejects(apply(), /24 horas/);
      await asUser(other); assert.equal((await rows()).length, 0);
      await db.exec("reset role; update public.postulaciones_rechazadas set created_at=now()-interval '24 hours';");
      await asUser(applicant); assert.equal((await rows()).length, 0); await apply();
      assert.equal((await rows())[0]._source, 'postulaciones');
    });

    await t.test('applicant withdrawal is not a rejection', async () => {
      await reset(); await asUser(applicant); await apply();
      await db.query('delete from public.postulaciones where articulo_id=$1', [article]);
      assert.equal((await rows()).length, 0); await apply();
    });

    await t.test('accepting a valid applicant atomically opens chat and rejects remaining applicants', async () => {
      await reset(); await asUser(applicant); await apply(); await asUser(other); await apply();
      const createChat = () => db.query("insert into public.chats(articulo_id,buyer_id,seller_id,owner_id,status) values($1,$2,$3,$3,'open')", [article,applicant,owner]);
      await assert.rejects(createChat(), /aceptar al aspirante/);
      await asUser(owner);
      await db.query("update public.articulos set ganador_id=$1,estado='reservado',status='reservado' where id=$2", [applicant,article]);
      const chat = (await db.query('select * from public.chats')).rows[0];
      assert.equal(chat.buyer_id, applicant); assert.equal(chat.status, 'open');
      await asUser(other);
      assert.equal((await rows())[0]._source, 'rechazadas');
      await assert.rejects(db.query("insert into public.chats(articulo_id,buyer_id,seller_id,owner_id,status) values($1,$2,$3,$3,'open')", [article,other,owner]), /aceptar/);
      await assert.rejects(db.query('insert into public.chat_messages values($1,$2,$3)', [chat.id,other,'Hola']), /aspirante aceptado/);
      await asUser(applicant);
      await db.query('insert into public.chat_messages values($1,$2,$3)', [chat.id,applicant,'Gracias']);
      await asUser(owner);
      await db.query("update public.articulos set estado='entregado',status='entregado' where id=$1", [article]);
      assert.equal((await db.query('select status from public.chats')).rows[0].status, 'closed');
      await asUser(applicant);
      await assert.rejects(db.query('insert into public.chat_messages values($1,$2,$3)', [chat.id,applicant,'Hola']), /aspirante aceptado/);
    });

    await t.test('choosing a non-applicant fails and an anonymous user cannot read applications', async () => {
      await reset(); await asUser(owner);
      await assert.rejects(db.query("update public.articulos set ganador_id=$1,estado='reservado',status='reservado' where id=$2", [other,article]), /aspirante activo/);
      await db.exec('reset role; set role anon;');
      await assert.rejects(rows(), /permission denied/);
    });
  } finally { await db.close(); }
});
