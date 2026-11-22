// Print a small receipt (80mm thermal printers or A4) using a hidden iframe.
import logo from '../assets/logo.png';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function printReceipt({ title, lines = [], items = [], totals = [], footer, venueName = 'Heaven' }) {
  const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${esc(title)}</title>
  <style>
    @page { margin: 4mm; }
    body { font-family: Tahoma, Arial, sans-serif; width: 72mm; margin: 0 auto; color: #000; font-size: 12px; }
    .c { text-align: center; } img { width: 70px; height: 70px; }
    h2 { margin: 4px 0; font-size: 15px; } hr { border: 0; border-top: 1px dashed #000; margin: 6px 0; }
    table { width: 100%; border-collapse: collapse; } td { padding: 2px 0; vertical-align: top; }
    td.n { text-align: left; white-space: nowrap; } .row { display: flex; justify-content: space-between; margin: 2px 0; }
    .big { font-size: 15px; font-weight: bold; }
  </style></head><body>
  <div class="c"><img src="${new URL(logo, window.location.href).href}" alt=""><h2>${esc(venueName)}</h2><div>${esc(title)}</div></div><hr>
  ${lines.map(([k, v]) => `<div class="row"><span>${esc(k)}</span><span>${esc(v)}</span></div>`).join('')}
  ${items.length ? `<hr><table>${items.map((i) => `<tr><td>${esc(i.name)} × ${esc(i.qty)}</td><td class="n">${esc(i.total)}</td></tr>`).join('')}</table>` : ''}
  ${totals.length ? `<hr>${totals.map(([k, v, big]) => `<div class="row ${big ? 'big' : ''}"><span>${esc(k)}</span><span>${esc(v)}</span></div>`).join('')}` : ''}
  <hr><div class="c">${esc(footer || '')}</div>
  </body></html>`;

  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;width:0;height:0;border:0;left:-1000px';
  document.body.appendChild(frame);
  const doc = frame.contentWindow.document;
  doc.open(); doc.write(html); doc.close();
  const go = () => {
    frame.contentWindow.focus();
    frame.contentWindow.print();
    setTimeout(() => frame.remove(), 1500);
  };
  const img = doc.querySelector('img');
  if (img && !img.complete) { img.onload = go; img.onerror = go; } else setTimeout(go, 50);
}
