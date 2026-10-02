import { ArrowLeft, ArrowRight } from 'lucide-react';

export default function ProfilePagination({ page, pages, onChange }) {
  if (pages <= 1) return null;
  return <nav aria-label="Páginas del listado del perfil" className="mt-4 flex items-center justify-center gap-3">
    <button type="button" aria-label="Página anterior" title="Página anterior" disabled={page <= 1}
      onClick={() => onChange(page - 1)}
      className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-700 enabled:hover:text-forest-green disabled:opacity-40">
      <ArrowLeft size={16} aria-hidden="true" />
    </button>
    <span aria-live="polite" className="text-xs font-semibold text-gray-600">Página {page} de {pages}</span>
    <button type="button" aria-label="Página siguiente" title="Página siguiente" disabled={page >= pages}
      onClick={() => onChange(page + 1)}
      className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-700 enabled:hover:text-forest-green disabled:opacity-40">
      <ArrowRight size={16} aria-hidden="true" />
    </button>
  </nav>;
}
