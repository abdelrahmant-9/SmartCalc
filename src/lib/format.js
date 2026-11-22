export const pad = (n) => String(n).padStart(2, '0');

export function toISODate(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export const today = () => toISODate(new Date());

export function nowTime() {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function addDays(iso, days) {
  const [y, m, d] = iso.split('-').map(Number);
  return toISODate(new Date(y, m - 1, d + days));
}

export function startOfMonth(iso = today()) { return `${iso.slice(0, 7)}-01`; }
export function endOfMonth(iso = today()) {
  const [y, m] = iso.split('-').map(Number);
  return toISODate(new Date(y, m, 0));
}

export function startOfWeek(iso = today()) {
  // Week starts on Saturday (common in Egypt).
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const diff = (date.getDay() + 1) % 7;
  return addDays(iso, -diff);
}

const nf = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
// A left-to-right mark keeps the minus sign in front of negative numbers inside Arabic text.
export const num = (v) => {
  const n = Number(v) || 0;
  return n < 0 ? `\u200E-${nf.format(-n)}` : nf.format(n);
};
// Arabic-Indic (٠-٩) and Persian (۰-۹) digits -> 0-9, so numbers typed on an Arabic keyboard stay consistent.
export function latin(v) {
  return String(v ?? '').replace(/[\u0660-\u0669\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) & 0xf));
}
export const money = (v, currency = 'ج.م') => `${num(v)} ${currency}`;

const DAYS = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
export const MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
export const WEEK_DAYS_FROM_SAT = ['السبت', 'الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'];

export function dayName(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return DAYS[new Date(y, m - 1, d).getDay()];
}

export function prettyDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return `${dayName(iso)} ${d} ${MONTHS[m - 1]} ${y}`;
}

export function time12(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const suffix = h >= 12 ? 'م' : 'ص';
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}:${pad(m)} ${suffix}`;
}

export function minutesOf(t) {
  const [h, m] = (t || '00:00').split(':').map(Number);
  return h * 60 + m;
}

export function timeFromMinutes(mins) {
  const m = ((mins % 1440) + 1440) % 1440;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

export function dateTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return `${toISODate(d)} ${time12(`${pad(d.getHours())}:${pad(d.getMinutes())}`)}`;
}

export function durationLabel(mins) {
  const m = Number(mins) || 0;
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (!h) return `${r} دقيقة`;
  const hs = h === 1 ? 'ساعة' : h === 2 ? 'ساعتين' : `${h} ساعات`;
  return r ? `${hs} و${r} دقيقة` : hs;
}

export function toCSV(headers, rows) {
  const esc = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  // BOM so Excel opens Arabic text correctly.
  return `﻿${[headers, ...rows].map((r) => r.map(esc).join(',')).join('\n')}`;
}
