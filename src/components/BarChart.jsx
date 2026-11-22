import { useLayoutEffect, useRef, useState } from 'react';
import { num } from '../lib/format.js';

// Single-series column chart. Time reads right-to-left to match the Arabic layout.
// data: [{ key, label (axis), title (tooltip), value }]
export default function BarChart({ data, height = 180, currency = '', empty = 'لا توجد بيانات' }) {
  const wrap = useRef(null);
  const [width, setWidth] = useState(600);
  const [hover, setHover] = useState(null);

  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(200, e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const max = Math.max(0, ...data.map((d) => d.value));
  if (!data.length || max <= 0) return <div ref={wrap} className="empty">{empty}</div>;

  const axisW = 52; const top = 8; const bottom = 22;
  const plotW = width - axisW; const plotH = height - top - bottom;
  const step = niceStep(max / 3);
  const yMax = Math.ceil(max / step) * step;
  const ticks = []; for (let v = 0; v <= yMax + 1e-9; v += step) ticks.push(v);
  const slot = plotW / data.length;
  const barW = Math.max(2, Math.min(28, slot - Math.max(2, slot * 0.28)));
  const xOf = (i) => plotW - (i + 0.5) * slot; // index 0 on the right
  const yOf = (v) => top + plotH - (v / yMax) * plotH;
  const labelEvery = Math.ceil(data.length / Math.max(1, Math.floor(plotW / 44)));

  return (
    <div className="chart" ref={wrap}>
      <svg height={height} role="img" aria-label="رسم بياني">
        <g className="grid">
          {ticks.map((t) => <line key={t} x1={0} x2={plotW} y1={yOf(t)} y2={yOf(t)} />)}
        </g>
        <g className="axis">
          {ticks.map((t) => <text key={t} x={width - 4} y={yOf(t) + 4} textAnchor="end">{compact(t)}</text>)}
          {data.map((d, i) => (i % labelEvery === 0
            ? <text key={d.key} x={xOf(i)} y={height - 6} textAnchor="middle">{d.label}</text> : null))}
        </g>
        {data.map((d, i) => {
          const h = (d.value / yMax) * plotH;
          if (h <= 0) return null;
          const x = xOf(i) - barW / 2; const y = top + plotH - h; const r = Math.min(4, barW / 2, h);
          const path = `M${x},${top + plotH} V${y + r} Q${x},${y} ${x + r},${y} H${x + barW - r} Q${x + barW},${y} ${x + barW},${y + r} V${top + plotH} Z`;
          return <path key={d.key} d={path} className={`bar ${hover !== null && hover !== i ? 'dim' : ''}`} />;
        })}
        {data.map((d, i) => (
          <rect key={d.key} className="hit" x={xOf(i) - slot / 2} y={top} width={slot} height={plotH}
            onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />
        ))}
      </svg>
      {hover !== null && (
        <div className="chart-tip" style={{ left: xOf(hover) + 16, top: Math.max(0, yOf(data[hover].value)) }}>
          <div className="tip-title">{data[hover].title}</div>
          <div className="tip-value">{num(data[hover].value)} {currency}</div>
        </div>
      )}
    </div>
  );
}

function niceStep(raw) {
  if (raw <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(raw));
  const n = raw / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

function compact(v) {
  if (v >= 1000000) return `${num(v / 1000000)}M`;
  if (v >= 1000) return `${num(v / 1000)}k`;
  return num(v);
}
