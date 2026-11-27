import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Plus } from 'lucide-react';

// Text field with a suggestion list: pick an existing value or type a new one.
// Replaces <datalist>, whose popup looks different on every OS and hides options that don't match the current text.
export default function Combobox({ value, onChange, options, placeholder, autoFocus, newLabel = 'إضافة' }) {
  const input = useRef(null);
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState(false); // filter only after the user types
  const [active, setActive] = useState(-1);
  const [pos, setPos] = useState(null);

  const unique = useMemo(() => [...new Set((options || []).filter(Boolean))], [options]);
  const q = String(value || '').trim();
  const shown = typed && q ? unique.filter((o) => o.toLowerCase().includes(q.toLowerCase())) : unique;
  const isNew = q && !unique.some((o) => o === q);

  // The list is position:fixed so it is never clipped by a scrolling modal.
  const place = () => {
    const r = input.current?.getBoundingClientRect();
    if (!r) return;
    const below = window.innerHeight - r.bottom;
    const up = below < 220 && r.top > below;
    setPos({ left: r.left, width: r.width, ...(up ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 }), maxHeight: Math.max(120, Math.min(260, (up ? r.top : below) - 16)) });
  };
  useLayoutEffect(() => { if (open) place(); }, [open, shown.length]);
  useEffect(() => {
    if (!open) return undefined;
    const update = () => place();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => { window.removeEventListener('resize', update); window.removeEventListener('scroll', update, true); };
  }, [open]);

  const show = () => { setOpen(true); setTyped(false); setActive(Math.max(0, unique.indexOf(q))); };
  const choose = (v) => { onChange(v); setOpen(false); setTyped(false); };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) { show(); return; }
      const d = e.key === 'ArrowDown' ? 1 : -1;
      setActive((a) => (shown.length ? (a + d + shown.length) % shown.length : -1));
    } else if (e.key === 'Enter' && open) {
      e.preventDefault();
      if (active >= 0 && shown[active]) choose(shown[active]); else setOpen(false);
    } else if (e.key === 'Escape' && open) {
      e.stopPropagation(); // keep the surrounding modal open
      setOpen(false);
    }
  };

  return (
    <div className={`combo ${open ? 'open' : ''}`}>
      <input
        ref={input}
        value={value || ''}
        placeholder={placeholder}
        autoFocus={autoFocus}
        role="combobox"
        aria-expanded={open}
        onChange={(e) => { onChange(e.target.value); setTyped(true); setOpen(true); setActive(0); }}
        onFocus={show}
        onClick={() => !open && show()}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
      />
      <button
        type="button" tabIndex={-1} className="combo-toggle" aria-label="عرض الاختيارات"
        onMouseDown={(e) => { e.preventDefault(); if (open) setOpen(false); else { input.current?.focus(); show(); } }}
      ><ChevronDown /></button>
      {open && pos && (shown.length > 0 || isNew) && createPortal(
        <ul className="combo-list" role="listbox" style={pos} onMouseDown={(e) => e.preventDefault()}>
          {shown.map((o, i) => (
            <li key={o} role="option" aria-selected={o === q} className={`${i === active ? 'active' : ''} ${o === q ? 'selected' : ''}`}
              onMouseEnter={() => setActive(i)} onClick={() => choose(o)}>
              <span>{o}</span>{o === q && <Check />}
            </li>
          ))}
          {isNew && (
            <li className="combo-new" onClick={() => choose(q)}><Plus /><span>{newLabel} «{q}»</span></li>
          )}
        </ul>,
        document.body,
      )}
    </div>
  );
}
