import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Package, MapPin, X } from 'lucide-react';
import { chatArticlePresentation } from './chatArticlePresentation.js';
import './ChatArticleDescription.css';

const fallbackImage = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="100%" height="100%" fill="#f3f4f6"/><text x="50%" y="50%" text-anchor="middle" font-family="Arial" font-size="24" fill="#69756a">Imagen no disponible</text></svg>');
const handleImageError = event => {
  if (event.currentTarget.dataset.fallbackApplied) return;
  event.currentTarget.dataset.fallbackApplied = 'true';
  event.currentTarget.src = fallbackImage;
};

export default function ChatArticleDescription({article,onClose}) {
  const dialog = useRef(null);
  const headingId = useId();
  const [selectedImage,setSelectedImage] = useState(null);
  useEffect(() => {
    const previous = document.activeElement;
    const node = dialog.current;
    node.showModal();
    return () => {node.close();if (previous?.isConnected) previous.focus({preventScroll:true});};
  },[]);
  const title = article?.title || article?.titulo || 'Artículo';
  const description = String(article?.descripcion || article?.description || '').trim();
  const {images,status,condition,locality,city} = chatArticlePresentation(article);
  const activeImage = images.includes(selectedImage) ? selectedImage : images[0];
  return createPortal(<dialog ref={dialog} className="chat-article-description" aria-labelledby={headingId}
    onCancel={event => {event.preventDefault();event.stopPropagation();onClose();}}
    onKeyDown={event => event.stopPropagation()}
    onClick={event => {event.stopPropagation();if (event.target === event.currentTarget) onClose();}}>
    <div className="chat-article-description-surface">
      <header><div><p><Package size={17} aria-hidden="true" />Detalle del artículo</p><h2 id={headingId}>{title}</h2></div>
        <button type="button" data-mobile-back className="chat-description-close" aria-label="Cerrar detalle del artículo" onClick={onClose}><X size={22} /></button>
      </header>
      <div className="chat-article-description-content">
        {images.length ? <div className="chat-article-gallery">
          <img key={activeImage} className="chat-article-main-photo" src={activeImage} alt={`${title}, foto ${images.indexOf(activeImage)+1}`} onError={handleImageError} />
          {images.length > 1 && <div className="chat-article-photo-list" role="group" aria-label="Fotos del artículo">
            {images.map((image,index) => <button key={image} type="button" aria-label={`Ver foto ${index+1}`} aria-pressed={activeImage === image} onClick={() => setSelectedImage(image)}>
              <img src={image} alt="" loading="lazy" onError={handleImageError} />
            </button>)}
          </div>}
        </div> : <p className="chat-article-no-photos">Este artículo no tiene fotos.</p>}
        <dl className="chat-article-facts">
          <div><dt>Estado</dt><dd>{status}</dd></div>
          {condition && <div><dt>Estado del producto</dt><dd>{condition.label} · {condition.score}/10</dd></div>}
          <div><dt><MapPin size={15} aria-hidden="true" />Localidad</dt><dd>{locality || 'No informada'}{city && <span>{city}</span>}</dd></div>
        </dl>
        <h3>Descripción</h3>
        <p>{description || 'Este artículo no tiene descripción.'}</p>
      </div>
      <footer><button type="button" onClick={onClose}>Volver al chat</button></footer>
    </div>
  </dialog>,document.body);
}
