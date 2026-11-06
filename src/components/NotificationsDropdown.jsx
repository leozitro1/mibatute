import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { ArrowLeft, Bell, CheckCheck, HandHeart, Loader2, MessageCircle, Package, Settings, ShieldCheck, Truck, X } from 'lucide-react';
import { publicContactText } from './contactText.js';
import { NOTIFICATION_HISTORY_LIMIT } from './notificationHistory.js';
import { bellListItems, bellNotificationCategory, groupBellNotifications, isBellUnread } from './notificationPresentation.js';
import './NotificationsDropdown.css';

const TYPES = {
  message: { icon: MessageCircle, label: 'Mensaje' },
  request: { icon: HandHeart, label: 'Solicitud' },
  accepted: { icon: CheckCheck, label: 'Aceptación' },
  delivery: { icon: Truck, label: 'Entrega' },
  system: { icon: ShieldCheck, label: 'MiBatute' },
  publication: { icon: Package, label: 'Publicación' },
};

function formatAgo(value) {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return '';
  const minutes = Math.floor(Math.max(0, Date.now() - time) / 60000);
  if (minutes < 1) return 'Ahora';
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} h`;
  return new Date(time).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
}

export default function NotificationsDropdown({ anchorRef, onClose, items = [], onItemClick, onMarkAllRead, marking, markError, localPreferences }) {
  const panelRef = useRef(null);
  const [filter, setFilter] = useState('all');
  const [limit, setLimit] = useState(NOTIFICATION_HISTORY_LIMIT);
  const [settings, setSettings] = useState(false);
  const dismiss = useEffectEvent(() => onClose?.());
  const unreadCount = items.filter(isBellUnread).length;
  const filtered = bellListItems(items, filter === 'unread');
  const groups = groupBellNotifications(filtered.slice(0, limit));
  const close = () => { onClose?.(); anchorRef.current?.focus({ preventScroll: true }); };

  useEffect(() => {
    const panel = panelRef.current;
    const anchor = anchorRef.current;
    panel?.focus({ preventScroll: true });
    const outside = event => {
      if (!panel?.contains(event.target) && !anchor?.contains(event.target)) dismiss();
    };
    const escape = event => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      dismiss();
      anchor?.focus({ preventScroll: true });
    };
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('focusin', outside);
    panel?.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('focusin', outside);
      panel?.removeEventListener('keydown', escape);
    };
  }, [anchorRef]);

  return <section ref={panelRef} className="marketplace-surface marketplace-notifications" role="dialog" aria-label="Notificaciones" tabIndex={-1}>
    <header className="notification-header">
      <div><h2>{settings ? 'Ajustes de avisos' : 'Notificaciones'}</h2>
        {!settings && <p>{unreadCount ? `${unreadCount} sin leer` : 'Estás al día'}</p>}</div>
      <div className="notification-header-actions">
        {localPreferences && <button type="button" className="notification-icon-button" onClick={() => setSettings(value => !value)} aria-label={settings ? 'Volver a notificaciones' : 'Ajustes de avisos'} title={settings ? 'Volver' : 'Ajustes de avisos'}>
          {settings ? <ArrowLeft size={18} /> : <Settings size={18} />}
        </button>}
        <button type="button" className="notification-icon-button" onClick={close} aria-label="Cerrar notificaciones"><X size={20} /></button>
      </div>
    </header>
    {settings ? <div className="notification-settings-panel">{localPreferences}</div> : <>
      <div className="notification-toolbar">
        <div className="notification-filters" role="group" aria-label="Filtrar notificaciones">
          <button type="button" aria-pressed={filter === 'all'} onClick={() => { setFilter('all'); setLimit(NOTIFICATION_HISTORY_LIMIT); }}>Todas</button>
          <button type="button" aria-pressed={filter === 'unread'} onClick={() => { setFilter('unread'); setLimit(NOTIFICATION_HISTORY_LIMIT); }}>Sin leer{unreadCount > 0 && <span>{unreadCount}</span>}</button>
        </div>
        {onMarkAllRead && <button type="button" className="notification-mark-all" onClick={onMarkAllRead} disabled={marking || !unreadCount} aria-label="Marcar todas como leídas" title="Marcar todas como leídas">
          {marking ? <Loader2 size={17} className="animate-spin" /> : <CheckCheck size={17} />}<span>{marking ? 'Marcando…' : 'Marcar todas'}</span>
        </button>}
      </div>
      {markError && <p className="notification-error" role="alert">{markError}</p>}
      <div className="notification-list">
        {!filtered.length ? <div className="notification-empty" role="status">
          <span><Bell size={25} aria-hidden="true" /></span>
          <strong>{filter === 'unread' ? 'Todo al día' : 'Todavía no hay avisos'}</strong>
          <p>{filter === 'unread' ? 'No tienes notificaciones sin leer.' : 'Aquí aparecerán tus mensajes, solicitudes y novedades.'}</p>
        </div> : groups.map(group => <div key={group.label} className="notification-group">
          <h3>{group.label}</h3>
          <ul>{group.items.map(item => {
            const category = bellNotificationCategory(item);
            const { icon: Icon } = TYPES[category];
            const unread = isBellUnread(item);
            const title = publicContactText(String(item.title || item.titulo || item.text || 'Notificación'));
            const subtitle = publicContactText(String(item.subtitle || item.subtitulo || item.message || ''));
            const thumb = item.thumb || item.image || item.foto_url;
            return <li key={item.id}><button type="button" className="notification-row" data-notification-id={item.id} data-read={!unread} onClick={() => onItemClick?.(item)}>
              <span className="notification-visual" data-category={category}>
                <Icon size={23} aria-hidden="true" />
                {thumb && <img key={thumb} src={thumb} alt="" loading="lazy" decoding="async" onError={event => { event.currentTarget.style.display = 'none'; }} />}
                {thumb && <span className="notification-type-icon"><Icon size={12} aria-hidden="true" /></span>}
              </span>
              <span className="notification-copy">
                <span className="notification-title-row">
                  <span className="notification-title">{title}</span>
                  <time className="notification-time" dateTime={item.created_at}>{formatAgo(item.created_at)}</time>
                </span>
                {subtitle && <span className="notification-subtitle">{subtitle}</span>}
              </span>
              {unread && <span className="notification-unread-dot" aria-label="Sin leer" />}
            </button></li>;
          })}</ul>
        </div>)}
        {filtered.length > limit && <button type="button" className="notification-load-more" onClick={() => setLimit(value => value + NOTIFICATION_HISTORY_LIMIT)}>Mostrar anteriores</button>}
      </div>
    </>}
  </section>;
}
