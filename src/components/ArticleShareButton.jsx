import { useState } from 'react';
import { Share2 } from 'lucide-react';
import { shareArticle } from './articleShare.js';
import './ArticleShareButton.css';

export default function ArticleShareButton({ articleId, title }) {
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  async function handleShare() {
    if (busy) return;
    setBusy(true);
    setResult(null);
    try {
      setResult(await shareArticle({ id: articleId, title, href: window.location.href, navigator }));
    } catch {
      setResult({ status: 'error' });
    } finally {
      setBusy(false);
    }
  }
  return <div className="article-share">
    <button type="button" className="article-share-button" onClick={handleShare} disabled={busy}>
      <Share2 size={14} aria-hidden="true" /> Compartir
    </button>
    {result?.status === 'copied' && <span className="article-share-feedback" role="status">Enlace copiado</span>}
    {result?.status === 'error' && <span className="article-share-feedback" role="status">No se pudo compartir. Intenta de nuevo.</span>}
    {result?.status === 'manual' && <label className="article-share-fallback">Copia este enlace:
      <input aria-label="Enlace de la publicación" readOnly value={result.url} onFocus={event => event.target.select()} />
    </label>}
  </div>;
}
