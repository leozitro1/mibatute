import { useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

export default function ArticlePhotoViewer({ images, activeIndex, title, fallbackImage, onChange, onClose }) {
  const dialogRef = useRef(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog.showModal();
    return () => dialog.close();
  }, []);

  const move = (direction) => onChange((activeIndex + direction + images.length) % images.length);

  return (
    <dialog
      ref={dialogRef}
      aria-label={`Fotos de ${title}`}
      className="article-photo-viewer"
      onCancel={onClose}
      onClick={event => { if (event.target === event.currentTarget) onClose(); }}
      onKeyDown={event => {
        if (images.length < 2) return;
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
          event.preventDefault();
          move(event.key === 'ArrowLeft' ? -1 : 1);
        }
      }}
    >
      <button type="button" autoFocus onClick={onClose} aria-label="Cerrar foto" title="Cerrar foto" className="article-photo-viewer-close">
        <X size={24} />
      </button>
      <img key={activeIndex} src={images[activeIndex]} alt={title} className="article-photo-viewer-image" onError={event => {
        if (event.currentTarget.dataset.fallbackApplied) return;
        event.currentTarget.dataset.fallbackApplied = '1';
        event.currentTarget.src = fallbackImage;
      }} />
      {images.length > 1 && (
        <>
          <button type="button" onClick={() => move(-1)} aria-label="Foto anterior" title="Foto anterior" className="article-photo-viewer-previous">
            <ChevronLeft size={28} />
          </button>
          <button type="button" onClick={() => move(1)} aria-label="Foto siguiente" title="Foto siguiente" className="article-photo-viewer-next">
            <ChevronRight size={28} />
          </button>
          <output className="article-photo-viewer-count">{activeIndex + 1} / {images.length}</output>
        </>
      )}
    </dialog>
  );
}
