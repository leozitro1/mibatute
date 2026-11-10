export function databaseActionError(error, fallback) {
  const code = typeof error?.code === 'string' && /^(?:[0-9A-Z]{5}|PGRST\d{3})$/.test(error.code) ? error.code : undefined;
  const message = error?.message;
  // Application RPCs use explicit RAISE EXCEPTION messages for business rules.
  // PostgreSQL and PostgREST failures use the generic message instead.
  const business = code === 'P0001' && typeof message === 'string' && /^[^\r\n]{1,240}$/.test(message);
  if (!business && import.meta.env?.DEV) console.warn('[Base de datos] Operación rechazada', { code });
  return Object.assign(new Error(business ? message : fallback), { code });
}
