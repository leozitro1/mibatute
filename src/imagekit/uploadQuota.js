export async function reserveImageUpload(client, scope) {
  const { data, error } = await client.rpc('reserve_image_upload', { p_scope: scope });
  if (error || typeof data?.allowed !== 'boolean') {
    throw Object.assign(new Error(error?.code === '42501'
      ? 'Tu cuenta no puede subir imágenes.'
      : 'No se pudo comprobar el límite de imágenes. Intenta de nuevo más tarde.'), { status: error?.code === '42501' ? 403 : 503 });
  }
  if (data.allowed) return;
  if (!Number.isInteger(data.retryAfter) || data.retryAfter < 1 || !Number.isFinite(Date.parse(data.retryAt))) {
    throw Object.assign(new Error('No se pudo comprobar cuándo puedes reintentar la subida.'), { status: 503 });
  }
  const label = { burst: '20 autorizaciones de imagen cada 10 minutos', daily: '120 autorizaciones de imagen en 24 horas', profile: '4 autorizaciones de foto de perfil en 24 horas' }[data.limit];
  if (!label) throw Object.assign(new Error('No se pudo comprobar el límite de imágenes.'), { status: 503 });
  const date = new Intl.DateTimeFormat('es-CO', { dateStyle: 'short', timeStyle: 'medium', timeZone: 'America/Bogota' }).format(new Date(data.retryAt));
  throw Object.assign(new Error(`Alcanzaste el límite de ${label}. Podrás volver a subir el ${date} (hora de Colombia). Este límite no descuenta créditos.`),
    { status: 429, code: 'IMAGE_UPLOAD_LIMIT', retryAt: data.retryAt, retryAfter: data.retryAfter });
}
