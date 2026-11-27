import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';

// Places a popup list under (or above) an anchor element. position:fixed so modals never clip it.
export function useFloating(anchor, open, deps = []) {
  const [pos, setPos] = useState(null);
  const place = () => {
    const r = anchor.current?.getBoundingClientRect();
    if (!r) return;
    const below = window.innerHeight - r.bottom;
    const up = below < 220 && r.top > below;
    setPos({
      left: r.left, minWidth: r.width,
      ...(up ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 }),
      maxHeight: Math.max(120, Math.min(300, (up ? r.top : below) - 16)),
    });
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => { if (open) place(); }, [open, ...deps]);
  useEffect(() => {
    if (!open) return undefined;
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  return pos;
}

const norm = (o) => (typeof o === 'object' ? o : { value: o, label: o });

/**
 * Drop-in replacement for <select>, drawn by the app so it looks the same on macOS and Windows.
 * options: array of strings or { value, label }.
 */
export default function Select({ value, onChange, options, placeholder = 'اختر', disabled, 'aria-label': ariaLabel, className = '' }) {
  const id = useId();
  const btn = useRef(null);
  const list = useRef(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const typeahead = useRef({ text: '', t: 0 });
  const opts = (options || []).map(norm);
  const index = opts.findIndex((o) => String(o.value) === String(value));
  const current = opts[index];
  const pos = useFloating(btn, open, [opts.length]);

  const openList = () => { if (disabled) return; setActive(index >= 0 ? index : 0); setOpen(true); };
  const choose = (o) => { setOpen(false); if (String(o.value) !== String(value)) onChange(o.value); btn.current?.focus(); };

  // Close when clicking anywhere else.
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (!btn.current?.contains(e.target) && !list.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  // Keep the highlighted option visible.
  useEffect(() => {
    if (open) list.current?.querySelector(`[data-i="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [open, active]);

  const onKeyDown = (e) => {
    if (disabled) return;
    if (['ArrowDown', 'ArrowUp'].includes(e.key)) {
      e.preventDefault();
      if (!open) { openList(); return; }
      const d = e.key === 'ArrowDown' ? 1 : -1;
      setActive((a) => (a + d + opts.length) % opts.length);
    } else if (e.key === 'Home' && open) { e.preventDefault(); setActive(0); }
    else if (e.key === 'End' && open) { e.preventDefault(); setActive(opts.length - 1); }
    else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (!open) openList(); else if (opts[active]) choose(opts[active]);
    } else if (e.key === 'Escape' && open) {
      e.preventDefault(); e.stopPropagation(); setOpen(false);
    } else if (e.key === 'Tab') setOpen(false);
    else if (e.key.length === 1 && !e.metaKey && !e.ctrlKey) {
      // Type the first letters of an option to jump to it.
      const now = Date.now();
      const ta = typeahead.current;
      ta.text = now - ta.t > 700 ? e.key : ta.text + e.key;
      ta.t = now;
      const hit = opts.findIndex((o) => String(o.label).startsWith(ta.text));
      if (hit >= 0) { if (open) setActive(hit); else choose(opts[hit]); }
    }
  };

  return (
    <>
      <button
        ref={btn} type="button" className={`select ${open ? 'open' : ''} ${className}`} disabled={disabled}
        role="combobox" aria-haspopup="listbox" aria-expanded={open} aria-controls={`${id}-list`} aria-label={ariaLabel}
        aria-activedescendant={open ? `${id}-${active}` : undefined}
        onClick={() => (open ? setOpen(false) : openList())} onKeyDown={onKeyDown}
      >
        <span className={`select-value ${current ? '' : 'placeholder'}`}>{current ? current.label : placeholder}</span>
        <ChevronDown className="select-chevron" />
      </button>
      {open && pos && createPortal(
        <ul ref={list} id={`${id}-list`} className="combo-list" role="listbox" style={pos} onMouseDown={(e) => e.preventDefault()}>
          {opts.map((o, i) => (
            <li key={String(o.value)} id={`${id}-${i}`} data-i={i} role="option" aria-selected={i === index}
              className={`${i === active ? 'active' : ''} ${i === index ? 'selected' : ''}`}
              onMouseEnter={() => setActive(i)} onClick={() => choose(o)}>
              <span>{o.label}</span>{i === index && <Check />}
            </li>
          ))}
        </ul>,
        // Rendered at the page root: inside a <label>, a click on an option would re-open the list.
        document.body,
      )}
    </>
  );
}
