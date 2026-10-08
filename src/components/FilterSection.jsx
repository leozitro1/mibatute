import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

export default function FilterSection({ id, title, summary, icon, action, children }) {
  const [open, setOpen] = useState(false);

  return (
    <section className="border-b border-gray-200 py-3 lg:py-4" aria-labelledby={`${id}-heading`}>
      <div className="flex items-center gap-2">
        <h3 id={`${id}-heading`} className="min-w-0 flex-1">
          <button type="button" onClick={() => setOpen(value => !value)}
            aria-expanded={open} aria-controls={id}
            className="flex w-full min-h-11 items-center gap-3 text-left lg:hidden rounded-md focus-visible:outline-2 focus-visible:outline-forest-green"
            aria-label={title}>
            {icon}
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-gray-800">{title}</span>
              <span className="block text-xs text-gray-500 break-words mt-0.5">{summary}</span>
            </span>
            <ChevronDown size={18} className={`shrink-0 text-gray-500 transition-transform motion-reduce:transition-none ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
          </button>
          <span className="hidden lg:flex items-center gap-2 text-xs font-bold text-gray-800">
            {icon}
            {title}
          </span>
        </h3>
        {action}
      </div>
      <div id={id} className={`${open ? 'block' : 'hidden'} lg:block pt-3`}>
        {children}
      </div>
    </section>
  );
}
