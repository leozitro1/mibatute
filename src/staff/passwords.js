export function staffEmail(value,requireMaster=false) {
  const username=value.trim().toLowerCase();
  return username.includes('@')?username:`${username}@${requireMaster?'master':'admin'}.mibatute.com`;
}

export function passwordError(password,confirmation) {
  if(password.length<12) return 'Usa al menos 12 caracteres.';
  if(password.length>128) return 'Usa como máximo 128 caracteres.';
  if(password!==confirmation) return 'Las contraseñas no coinciden.';
  return '';
}

export function recoveryCredentials(hash) {
  const params=new URLSearchParams(hash.replace(/^#/,''));
  if(params.get('type')!=='recovery')return null;
  const access_token=params.get('access_token');
  const refresh_token=params.get('refresh_token');
  return access_token&&refresh_token?{access_token,refresh_token}:{error:true};
}
