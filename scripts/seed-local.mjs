import { createClient } from '@supabase/supabase-js';

const accounts = [
  { email: 'vendedor@example.com', nombre: 'Vendedor de prueba' },
  { email: 'comprador@example.com', nombre: 'Comprador de prueba' },
];
const password = '123456';
const photos = {
  silla: 'photo-1598300042247-d088f8ab3a91',
  bicicleta: 'photo-1485965120184-e220f721d03e',
  libros: 'photo-1495446815901-a7297e633e8d',
  audifonos: 'photo-1505740420928-5e560c06d30e',
};
const fixtures = [
  ['Silla de escritorio - PRUEBA', 'Hogar & Muebles', 'Muebles', 80000, 'silla', 0, 'venta'],
  ['Bicicleta urbana - PRUEBA', 'Deportes & Movilidad', 'Bicicletas', 250000, 'bicicleta', 0, 'venta'],
  ['Audifonos - PRUEBA', 'Electrónica & Tecnología', 'Repuestos', 45000, 'audifonos', 0, 'venta'],
  ['Libros para donar - PRUEBA', 'Libros & Educación', 'Libros', 0, 'libros', 0, 'donacion'],
  ['Libros de lectura - PRUEBA', 'Libros & Educación', 'Libros', 30000, 'libros', 1, 'venta'],
  ['Silla para donar - PRUEBA', 'Hogar & Muebles', 'Muebles', 0, 'silla', 1, 'donacion'],
  ['Silla de estudio en Suba - PRUEBA', 'Hogar & Muebles', 'Muebles', 65000, 'silla', 0, 'venta', 'Suba'],
  ['Bicicleta en Usaquen - PRUEBA', 'Deportes & Movilidad', 'Bicicletas', 220000, 'bicicleta', 1, 'venta', 'Usaquén'],
  ['Audifonos en Kennedy - PRUEBA', 'Electrónica & Tecnología', 'Repuestos', 35000, 'audifonos', 0, 'venta', 'Kennedy'],
  ['Libros para donar en Engativa - PRUEBA', 'Libros & Educación', 'Libros', 0, 'libros', 1, 'donacion', 'Engativá'],
  ['Silla para donar en Fontibon - PRUEBA', 'Hogar & Muebles', 'Muebles', 0, 'silla', 0, 'donacion', 'Fontibón'],
  ['Bicicleta en Teusaquillo - PRUEBA', 'Deportes & Movilidad', 'Bicicletas', 180000, 'bicicleta', 1, 'venta', 'Teusaquillo'],
  ['Audifonos para donar en Bosa - PRUEBA', 'Electrónica & Tecnología', 'Repuestos', 0, 'audifonos', 1, 'donacion', 'Bosa'],
  ['Libros de lectura en Santa Fe - PRUEBA', 'Libros & Educación', 'Libros', 25000, 'libros', 0, 'venta', 'Santa Fe'],
  ['Silla en Puente Aranda - PRUEBA', 'Hogar & Muebles', 'Muebles', 90000, 'silla', 1, 'venta', 'Puente Aranda'],
  ['Libros para donar en Barrios Unidos - PRUEBA', 'Libros & Educación', 'Libros', 0, 'libros', 0, 'donacion', 'Barrios Unidos'],
];

function checked(result) {
  if (result.error) throw new Error(result.error.message);
  return result.data;
}

export async function seedLocal({ API_URL, ANON_KEY, SERVICE_ROLE_KEY }) {
  if (new URL(API_URL).hostname !== '127.0.0.1') {
    throw new Error('Los datos de prueba solo pueden crearse en Supabase local.');
  }
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const admin = createClient(API_URL, SERVICE_ROLE_KEY, options);
  const users = [];
  let existingUsers = [];
  for (let page = 1; ; page++) {
    const result = checked(await admin.auth.admin.listUsers({ page, perPage: 1000 }));
    existingUsers.push(...result.users);
    if (result.users.length < 1000) break;
  }
  for (const account of accounts) {
    let user = existingUsers.find(u => u.email === account.email);
    if (user && user.app_metadata?.local_fixture !== 'mibatute') {
      throw new Error(`La cuenta ${account.email} ya existe y no es una cuenta de prueba gestionada.`);
    }
    if (!user) {
      user = checked(await admin.auth.admin.createUser({
        email: account.email, password, email_confirm: true,
        app_metadata: { local_fixture: 'mibatute' },
        user_metadata: { nombre: account.nombre, ciudad: 'Bogotá', localidad: 'Chapinero', localidad_es: 'Chapinero' },
      })).user;
    }
    users.push(user);
    const credits = checked(await admin.from('cupos').select('saldo').eq('usuario_id', user.id).maybeSingle());
    if (!credits) checked(await admin.from('cupos').insert({ usuario_id: user.id, saldo: 20 }));
  }
  const imageCache = new Map();
  for (const [title, category, subcategory, price, photo, ownerIndex, mode, locality = 'Chapinero'] of fixtures) {
    const owner = users[ownerIndex];
    const existing = checked(await admin.from('articulos').select('id').eq('owner_id', owner.id).eq('title', title).maybeSingle());
    if (existing) continue;
    if (!imageCache.has(photo)) {
      const sourceFixture = fixtures.find(fixture => fixture[4] === photo);
      const source = checked(await admin.from('articulos').select('image_url')
        .eq('owner_id', users[sourceFixture[5]].id).eq('title', sourceFixture[0]).maybeSingle());
      const localUrl = source?.image_url && new URL(source.image_url);
      const imageUrl = localUrl?.origin === new URL(API_URL).origin
        ? localUrl.href
        : `https://images.unsplash.com/${photos[photo]}?w=640&q=75&fit=max`;
      const response = await fetch(imageUrl, { signal: AbortSignal.timeout(30000) });
      if (!response.ok || !response.headers.get('content-type')?.startsWith('image/')) {
        throw new Error(`No se pudo descargar la foto de prueba: ${photo}.`);
      }
      imageCache.set(photo, new Uint8Array(await response.arrayBuffer()));
    }
    const path = `mibatute/articulos/${owner.id}/${crypto.randomUUID()}.jpg`;
    const image = imageCache.get(photo);
    checked(await admin.storage.from('local-images').upload(path, image, { contentType: 'image/jpeg' }));
    const { data: imageData } = admin.storage.from('local-images').getPublicUrl(path);
    try {
      const article = checked(await admin.from('articulos').insert({
        owner_id: owner.id, owner_name: owner.user_metadata.nombre,
        title, description: 'Articulo ficticio para probar MiBatute en local. No es una oferta real.',
        category, subcategory, subcategoria: subcategory, mode, price,
        city: 'Bogotá', locality, estado_producto: 8,
        status: 'disponible', estado: 'disponible',
        imagenes: [imageData.publicUrl], image_url: imageData.publicUrl,
        imagen_url: imageData.publicUrl, imagen_url_principal: imageData.publicUrl,
      }).select('id').single());
      checked(await admin.from('articulo_imagenes').insert({
        articulo_id: article.id, owner_id: owner.id, url: imageData.publicUrl,
        path, file_id: `local:${path}`, position: 0,
      }));
    } catch (error) {
      // Retain files already referenced by an article if a later insert failed.
      const referenced = checked(await admin.from('articulos').select('id').eq('image_url', imageData.publicUrl));
      if (!referenced.length) checked(await admin.storage.from('local-images').remove([path]));
      throw error;
    }
  }
  for (const account of accounts) {
    const client = createClient(API_URL, ANON_KEY, options);
    checked(await client.auth.signInWithPassword({ email: account.email, password }));
    const articles = checked(await client.from('articulos').select('id'));
    if (articles.length < fixtures.length) throw new Error('Faltan articulos de prueba visibles.');
    checked(await client.auth.signOut({ scope: 'local' }));
    console.log(`Cuenta lista: ${account.email} / ${password}`);
  }
  console.log(`${fixtures.length} articulos de prueba preparados. Las reservas existentes se conservan.`);
}
