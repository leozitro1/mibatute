import { Children, useId, useLayoutEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import './StyledSelect.css';

const fold = text => String(text).normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
const supportsPopover = typeof HTMLElement !== 'undefined' && 'showPopover' in HTMLElement.prototype;

// Keeps native form validation/data, while the visible control and menu belong to MiBatute.
export default function StyledSelect({ children, value = '', onChange, id, disabled = false, required = false,
  name, autoComplete, className = '', align = 'start', 'aria-label': ariaLabel = 'Ciudad' }) {
  const generatedId = useId(), controlId = id || generatedId, listId = `${controlId}-list`;
  const button = useRef(null), menu = useRef(null), typed = useRef({ text: '', at: 0 });
  const [open, setOpen] = useState(false), [active, setActive] = useState(-1);
  const [position, setPosition] = useState({}), [invalid, setInvalid] = useState(false);
  const options = Children.toArray(children).filter(child => child?.type === 'option').map(child => ({
    value: String(child.props.value ?? child.props.children ?? ''),
    label: Children.toArray(child.props.children).join(''), disabled: Boolean(child.props.disabled),
  }));
  const current = options.findIndex(option => option.value === String(value));
  const available = options.map((option, index) => option.disabled ? -1 : index).filter(index => index >= 0);
  const close = () => { menu.current?.hidePopover?.(); setOpen(false); };
  const show = (index = current >= 0 ? current : available[0]) => {
    if (disabled || !available.length) return;
    const rect = button.current.getBoundingClientRect(), gap = 7;
    const width = Math.min(Math.max(rect.width, 240), window.innerWidth - 16);
    const below = window.innerHeight - rect.bottom - gap - 8, above = rect.top - gap - 8;
    const upwards = below < 220 && above > below;
    const maxHeight = Math.max(80, Math.min(340, upwards ? above : below));
    setPosition({ width, maxHeight,
      left: Math.max(8, Math.min(align === 'end' ? rect.right - width : rect.left, window.innerWidth - width - 8)),
      ...(upwards ? { bottom: window.innerHeight - rect.top + gap } : { top: rect.bottom + gap }),
    });
    setActive(available.includes(index) ? index : available[0]);
    setOpen(true); menu.current?.showPopover?.();
  };
  const choose = index => {
    const option = options[index];
    if (!option || option.disabled) return;
    setInvalid(false); close(); button.current?.focus();
    if (option.value !== String(value)) onChange?.({ target: { value: option.value }, currentTarget: { value: option.value } });
  };
  useLayoutEffect(() => {
    if (!open) return;
    const dismiss = event => {
      if (!menu.current?.contains(event.target) && !button.current?.contains(event.target)) {
        menu.current?.hidePopover?.(); setOpen(false);
      }
    };
    const moved = event => {
      if (event.type === 'scroll' && menu.current?.contains(event.target)) return;
      menu.current?.hidePopover?.(); setOpen(false);
    };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('focusin', dismiss);
    document.addEventListener('scroll', moved, true); window.addEventListener('resize', moved);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('focusin', dismiss);
      document.removeEventListener('scroll', moved, true); window.removeEventListener('resize', moved);
    };
  }, [open]);
  useLayoutEffect(() => {
    if (open) menu.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);
  const keyDown = event => {
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const direction = event.key === 'ArrowUp' ? -1 : 1;
      const from = available.indexOf(open ? active : current);
      const next = event.key === 'Home' ? available[0] : event.key === 'End' ? available.at(-1) :
        from < 0 ? (direction < 0 ? available.at(-1) : available[0]) : available[(from + direction + available.length) % available.length];
      if (!open) show(next); else setActive(next);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault(); if (open) choose(active); else show();
    } else if (event.key === 'Escape' && open) {
      event.preventDefault(); event.stopPropagation(); close();
    } else if (event.key === 'Tab') close();
    else if (event.key.length === 1 && !event.altKey && !event.ctrlKey && !event.metaKey) {
      const now = Date.now();
      typed.current = { text: now - typed.current.at > 700 ? event.key : typed.current.text + event.key, at: now };
      const query = fold(typed.current.text), match = available.find(index => fold(options[index].label).startsWith(query));
      if (match !== undefined) { event.preventDefault(); if (open) setActive(match); else show(match); }
    }
  };
  return <div className="site-select">
    <select hidden tabIndex={-1} aria-hidden="true" className="site-select-native" value={value} onChange={onChange}
      name={name} autoComplete={autoComplete} disabled={disabled} required={required} onInvalid={event => {
        event.preventDefault(); setInvalid(true); button.current?.focus();
      }}>{children}</select>
    <button ref={button} id={controlId} type="button" role="combobox" aria-label={ariaLabel} disabled={disabled}
      aria-haspopup="listbox" aria-expanded={open} aria-controls={listId} aria-required={required || undefined}
      aria-invalid={invalid && !value || undefined} aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
      className={`site-select-trigger ${className}`} onClick={() => open ? close() : show()} onKeyDown={keyDown}>
      <span className="site-select-value">{options[current]?.label || 'Selecciona una ciudad'}</span>
      <ChevronDown size={15} className={open ? 'site-select-arrow-open' : ''} aria-hidden="true" />
    </button>
    <div ref={menu} id={listId} popover="manual" role="listbox" aria-label={ariaLabel} className="site-select-menu"
      style={position} data-fallback-open={open && !supportsPopover || undefined}
      onToggle={event => setOpen((event.nativeEvent?.newState || event.newState) === 'open')}>
      <div className="site-select-caption" aria-hidden="true">Selecciona una ciudad</div>
      {options.map((option, index) => <div key={option.value} id={`${listId}-${index}`} role="option"
        aria-selected={String(value) === option.value} aria-disabled={option.disabled || undefined}
        data-index={index} data-highlighted={active === index} className="site-select-option"
        onPointerDown={event => event.preventDefault()} onPointerMove={() => !option.disabled && setActive(index)} onClick={() => choose(index)}>
        <span>{option.label}</span>{String(value) === option.value && <Check size={16} aria-hidden="true" />}
      </div>)}
    </div>
    {invalid && !value && <span className="site-select-error" role="alert">Selecciona una ciudad.</span>}
  </div>;
}
