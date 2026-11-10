import { useState } from 'react';
import useProfilePhoto from '../imagekit/useProfilePhoto.js';

export default function ProfileAvatar({ user, photo, name = 'Usuario', client, className = 'w-full h-full object-cover', fallback }) {
  const allowed = !!user?.id && !user.is_anonymous;
  const url = useProfilePhoto(allowed ? photo : '', client);
  const [brokenUrl, setBrokenUrl] = useState('');
  if (!url || brokenUrl === url) {
    return fallback ?? <span title={!allowed ? 'Inicia sesión para ver la foto de perfil' : undefined}>{(name[0] || 'U').toUpperCase()}</span>;
  }
  return <img src={url} alt={name} className={className} referrerPolicy="no-referrer" onError={() => setBrokenUrl(url)} />;
}
