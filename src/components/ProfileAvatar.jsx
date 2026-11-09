export default function ProfileAvatar({ user, photo, name = 'Usuario' }) {
  if (!user?.id || !photo) {
    return <span title={!user?.id ? 'Inicia sesión para ver la foto de perfil' : undefined}>{(name[0] || 'U').toUpperCase()}</span>;
  }
  return <img src={photo} alt={name} className="w-full h-full object-cover" onError={event => { event.currentTarget.style.display = 'none'; }} />;
}
