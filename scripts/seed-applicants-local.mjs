import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { createClient } from '@supabase/supabase-js';

export const demoTitle = 'Libros con 10 postulaciones - PRUEBA';
const people = [
  ['Ana Torres', 'Me servirían para apoyar las tareas de mis hijos. Puedo recogerlos el sábado en Chapinero.'],
  ['Carlos Rojas', 'Estoy empezando una pequeña biblioteca comunitaria en mi barrio.'],
  ['Laura Gómez', 'Soy estudiante y me encanta leer. Gracias por compartirlos.'],
  ['Diego Martínez', 'Los llevaría al club de lectura de nuestro colegio. Podemos coordinar la recogida en la tarde.'],
  ['Sofía Rodríguez', 'Quiero retomar el hábito de lectura y compartirlos con mi hermana.'],
  ['Andrés Pérez', 'Me interesan para la biblioteca de mi familia. Vivo cerca y puedo recogerlos esta semana.'],
  ['Valentina Castro', 'Trabajo como voluntaria con niños del barrio y buscamos libros para las actividades de lectura.'],
  ['Mateo Ramírez', 'Me gustaría leerlos y luego donarlos nuevamente para que otras personas los aprovechen.'],
  ['Camila Andrea Fernández Restrepo', 'Estamos organizando una jornada de lectura en un centro comunitario. Tenemos participantes de distintas edades y queremos ampliar los libros disponibles. Estos libros serían parte de una biblioteca compartida, con préstamo gratuito para las familias del sector. Puedo recogerlos personalmente y acordar un horario que te resulte cómodo. Muchas gracias por darles una segunda vida.'],
  ['Julián Moreno', 'Los necesito para un proyecto de lectura con mis sobrinos. Puedo pasar el viernes después de las cinco.'],
];
const checked = ({ data, error }) => { if (error) throw error; return data; };

export function localStatus() {
  const status = JSON.parse(execFileSync('npx', ['--yes', 'supabase@2.119.0', 'status', '-o', 'json'], {
    env: { ...process.env, PATH: `/Applications/Docker.app/Contents/Resources/bin:${process.env.PATH}` },
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  }));
  if (new URL(status.API_URL).hostname !== '127.0.0.1') throw new Error('Solo se permite Supabase local.');
  return status;
}

export async function seedApplicants(status) {
  if (new URL(status.API_URL).hostname !== '127.0.0.1') throw new Error('Solo se permite Supabase local.');
  const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const users = [];
  for (let page = 1; ; page++) {
    const result = checked(await admin.auth.admin.listUsers({ page, perPage: 1000 }));
    users.push(...result.users);
    if (result.users.length < 1000) break;
  }
  const owner = users.find(user => user.email === 'cliente1@example.com' && user.app_metadata?.local_fixture === 'mibatute');
  if (!owner) throw new Error('Primero prepara la cuenta local Cliente 1.');
  let article = checked(await admin.from('articulos').select('id,status,estado,ganador_id').eq('owner_id', owner.id).eq('title', demoTitle).maybeSingle());
  if (article && (article.ganador_id || article.status !== 'disponible' || article.estado !== 'disponible')) {
    throw new Error('La donación de prueba ya tiene una decisión. Se conserva sin modificar.');
  }
  if (!article) {
    const source = checked(await admin.from('articulos').select('image_url,imagenes').eq('owner_id', owner.id).eq('title', 'Libros de Cliente 1 - PRUEBA').single());
    article = checked(await admin.from('articulos').insert({ owner_id: owner.id, owner_name: 'Cliente 1',
      title: demoTitle, description: 'Donación ficticia para la prueba visual local de diez postulaciones. No es una oferta real.',
      category: 'Libros & Educación', subcategory: 'Libros', subcategoria: 'Libros', mode: 'donacion', price: 0,
      estado_producto: 8, city: 'Bogotá', locality: 'Chapinero', status: 'disponible', estado: 'disponible',
      image_url: source.image_url, imagen_url: source.image_url, imagen_url_principal: source.image_url, imagenes: source.imagenes,
    }).select('id').single());
  }
  for (const [index, [nombre, justificacion]] of people.entries()) {
    const email = `aspirante${index + 1}@example.com`;
    let user = users.find(user => user.email === email);
    if (user && user.app_metadata?.local_fixture !== 'mibatute-applicants') throw new Error(`La cuenta ${email} no pertenece a esta prueba.`);
    if (!user) user = checked(await admin.auth.admin.createUser({ email, password: '123456', email_confirm: true,
      app_metadata: { local_fixture: 'mibatute-applicants' }, user_metadata: { nombre, ciudad: 'Bogotá', localidad: 'Chapinero' },
    })).user;
    const existing = checked(await admin.from('postulaciones').select('id').eq('articulo_id', article.id).eq('usuario_id', user.id).maybeSingle());
    if (!existing) checked(await admin.from('postulaciones').insert({ articulo_id: article.id, usuario_id: user.id, justificacion,
      created_at: new Date(Date.now() - (10 - index) * 60 * 60 * 1000).toISOString(),
    }));
  }
  const rows = checked(await admin.from('postulaciones').select('id').eq('articulo_id', article.id));
  if (rows.length !== 10) throw new Error(`Se esperaban diez postulaciones; hay ${rows.length}.`);
  console.log(`Prueba local lista: ${demoTitle}. 10 postulaciones, propietario cliente1@example.com / 123456.`);
  return article.id;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await seedApplicants(localStatus());
