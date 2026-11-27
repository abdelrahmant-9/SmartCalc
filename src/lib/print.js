// Receipts for thermal printers (80mm / 58mm) or A4, printed through a hidden iframe.
import logo from '../assets/logo.png';
import ar400 from '@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-arabic-400-normal.woff2';
import ar600 from '@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-arabic-600-normal.woff2';
import ar700 from '@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-arabic-700-normal.woff2';
import la400 from '@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-latin-400-normal.woff2';
import la600 from '@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-latin-600-normal.woff2';
import la700 from '@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-latin-700-normal.woff2';
import { num } from './format.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const abs = (u) => new URL(u, window.location.href).href;

const PAPER = {
  '80mm': { page: '80mm auto', width: '72mm', base: 11.5 },
  '58mm': { page: '58mm auto', width: '50mm', base: 10 },
  A4: { page: 'A4', width: '120mm', base: 12.5 },
};

function fontFaces() {
  const face = (url, weight, range) => `@font-face{font-family:'Plex';src:url('${abs(url)}') format('woff2');font-weight:${weight};unicode-range:${range};}`;
  const AR = 'U+0600-06FF,U+0750-077F,U+0870-088E,U+0890-0891,U+0898-08E1,U+08E3-08FF,U+200C-200E,U+2010-2011,U+204F,U+2E41,U+FB50-FDFF,U+FE70-FE74,U+FE76-FEFC';
  const LA = 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD';
  return [face(ar400, 400, AR), face(ar600, 600, AR), face(ar700, 700, AR), face(la400, 400, LA), face(la600, 600, LA), face(la700, 700, LA)].join('');
}

/**
 * @param {object} r
 * @param {object} r.settings   app settings (venue name, phone, address, footer, paper, currency)
 * @param {string} r.title      document type, e.g. "فاتورة كافيه"
 * @param {string} [r.number]   receipt / booking number
 * @param {Array<[string,string]>} [r.meta]   small label/value pairs (date, cashier…)
 * @param {Array<{name:string, qty:number, price:number}>} [r.items]
 * @param {Array<[string, number]>} [r.totals]  lines above the grand total (subtotal, discount…)
 * @param {[string, number]} r.grand            the main amount, e.g. ['الإجمالي', 190]
 * @param {Array<[string, number]>} [r.after]  lines after the total (paid, remaining…)
 * @param {string} [r.payment]
 * @param {string} [r.note]
 */
export function printReceipt(r) {
  const s = r.settings || {};
  const paper = PAPER[s.receiptPaper] || PAPER['80mm'];
  const currency = s.currency || 'ج.م';
  const contact = [s.venuePhone, s.venueAddress].filter(Boolean);
  const items = r.items || [];

  const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${esc(r.title)}</title>
  <style>
    ${fontFaces()}
    @page { size: ${paper.page}; margin: 4mm 0; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body { font-family: 'Plex', Tahoma, sans-serif; font-size: ${paper.base}px; line-height: 1.45; color: #111;
      width: ${paper.width}; margin: 0 auto; font-variant-numeric: tabular-nums; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .n { direction: ltr; unicode-bidi: isolate; display: inline-block; }
    .head { text-align: center; padding-bottom: 3mm; }
    .logo { width: 15mm; height: 15mm; border-radius: 50%; display: block; margin: 0 auto 1.5mm; }
    .brand { font-family: Didot, 'Bodoni 72', 'Times New Roman', serif; font-size: 1.75em; letter-spacing: .3em; margin-left: -.3em; line-height: 1.1; }
    .tag { font-size: .68em; letter-spacing: .22em; color: #555; direction: ltr; margin-top: .5mm; }
    .contact { font-size: .82em; color: #444; margin-top: 1.5mm; }
    .doc { display: flex; justify-content: space-between; align-items: baseline; border-top: 1.5px solid #111; border-bottom: 1.5px solid #111; padding: 1.5mm 0; margin-bottom: 2mm; }
    .doc b { font-size: 1.08em; }
    .doc span { font-size: .9em; }
    .meta { display: grid; grid-template-columns: auto 1fr; gap: .6mm 3mm; font-size: .9em; margin-bottom: 2.5mm; }
    .meta dt { color: #555; } .meta dd { margin: 0; text-align: left; overflow-wrap: anywhere; }
    table { width: 100%; border-collapse: collapse; }
    th { font-size: .78em; font-weight: 600; color: #555; text-align: right; padding: 1mm 0; border-bottom: 1px solid #111; }
    th.amt, td.amt { text-align: left; white-space: nowrap; padding-right: 2mm; }
    td { padding: 1.4mm 0; border-bottom: 1px dotted #bbb; vertical-align: top; }
    tr:last-child td { border-bottom: 0; }
    .item { font-weight: 600; overflow-wrap: anywhere; }
    .calc { font-size: .85em; color: #555; margin-top: .3mm; }
    .sums { margin-top: 2mm; border-top: 1px solid #111; padding-top: 1.5mm; }
    .line { display: flex; justify-content: space-between; gap: 3mm; padding: .5mm 0; }
    .grand { display: flex; justify-content: space-between; align-items: baseline; margin: 2mm 0; padding: 2mm 2.5mm; border: 1.5px solid #111; border-radius: 1.5mm; }
    .grand b { font-size: 1.15em; } .grand strong { font-size: 1.55em; font-weight: 700; }
    .grand small { font-size: .6em; font-weight: 400; margin-right: 1mm; }
    .pay { text-align: center; font-size: .9em; margin-top: 1mm; }
    .note { margin-top: 2mm; padding: 1.5mm 2mm; background: #f2f2f2; font-size: .88em; overflow-wrap: anywhere; }
    .foot { text-align: center; margin-top: 4mm; padding-top: 2.5mm; border-top: 1px dashed #777; font-size: .9em; }
    .foot .thanks { font-weight: 600; }
    .foot .tiny { font-size: .72em; color: #777; margin-top: 1mm; direction: ltr; }
  </style></head><body>
  <div class="head">
    <img class="logo" src="${s.venueLogo || abs(logo)}" alt="">
    <div class="brand">${esc((s.venueName || 'Heaven').toUpperCase())}</div>
    ${(s.venueTagline ?? 'LENS & LEAVES · CAPTURING BEAUTY') ? `<div class="tag">${esc(s.venueTagline ?? 'LENS & LEAVES · CAPTURING BEAUTY')}</div>` : ''}
    ${contact.length ? `<div class="contact">${contact.map((c) => `<span class="${/^[\d+\s-]+$/.test(c) ? 'n' : ''}">${esc(c)}</span>`).join(' · ')}</div>` : ''}
  </div>
  <div class="doc"><b>${esc(r.title)}</b>${r.number ? `<span>رقم <span class="n">${esc(r.number)}</span></span>` : ''}</div>
  ${(r.meta || []).length ? `<dl class="meta">${r.meta.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>` : ''}
  ${items.length ? `<table>
    <thead><tr><th>الصنف</th><th class="amt">المبلغ</th></tr></thead>
    <tbody>${items.map((i) => `<tr><td><div class="item">${esc(i.name)}</div><div class="calc"><span class="n">${num(i.qty)} × ${num(i.price)}</span></div></td><td class="amt"><span class="n">${num(i.qty * i.price)}</span></td></tr>`).join('')}</tbody>
  </table>` : ''}
  ${(r.totals || []).length ? `<div class="sums">${r.totals.map(([k, v]) => `<div class="line"><span>${esc(k)}</span><span class="n">${num(v)}</span></div>`).join('')}</div>` : ''}
  <div class="grand"><b>${esc(r.grand[0])}</b><strong><span class="n">${num(r.grand[1])}</span><small>${esc(currency)}</small></strong></div>
  ${(r.after || []).map(([k, v]) => `<div class="line"><span>${esc(k)}</span><span class="n">${num(v)} ${esc(currency)}</span></div>`).join('')}
  ${r.payment ? `<div class="pay">طريقة الدفع: ${esc(r.payment)}</div>` : ''}
  ${r.note ? `<div class="note">${esc(r.note)}</div>` : ''}
  <div class="foot">
    <div class="thanks">${esc(s.receiptFooter || 'شكراً لزيارتكم')}</div>
    <div class="tiny">${esc(new Date().toLocaleString('en-GB'))}</div>
  </div>
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
  // Wait for the logo and fonts so the first print is not missing them.
  const img = doc.querySelector('img');
  const imgReady = img && !img.complete ? new Promise((res) => { img.onload = res; img.onerror = res; }) : Promise.resolve();
  Promise.all([imgReady, doc.fonts ? doc.fonts.ready : Promise.resolve()]).then(() => setTimeout(go, 50));
  return html;
}
