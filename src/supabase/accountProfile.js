// Use real profile columns. A missing compatibility alias must not discard sanctions.
export const ACCOUNT_PROFILE_FIELDS = 'id,nombre,movil,ciudad,localidad,direccion,foto_url,is_blocked,bloqueado,ban_until';

export async function readAccountProfile(client, uid) {
  try {
    const { data, error } = await client.from('usuarios').select(ACCOUNT_PROFILE_FIELDS).eq('id', uid).maybeSingle();
    if (error) return { data:null, error };
    if (!data || data.id !== uid || typeof data.is_blocked !== 'boolean' || typeof data.bloqueado !== 'boolean'
      || !Object.hasOwn(data, 'ban_until') || (data.ban_until !== null && !Number.isFinite(Date.parse(data.ban_until))))
      return { data:null, error:new Error('No se pudo verificar el estado de la cuenta.') };
    return { data:{ ...data, accountStatusVerified:true }, error:null };
  } catch (error) {
    return { data:null, error };
  }
}

export function publicationAccessError(user, now = Date.now()) {
  if (!user) return 'Debes iniciar sesión para publicar.';
  if (user.is_blocked || user.bloqueado) return 'Tu cuenta está bloqueada. No puedes publicar.';
  if (Date.parse(user.ban_until) > now) return 'Tu cuenta tiene una suspensión temporal activa. No puedes publicar hasta que termine.';
  if (user.accountStatusVerified !== true) return 'No se pudo verificar el estado de tu cuenta. Vuelve a cargar la app antes de publicar.';
  return '';
}
