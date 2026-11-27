// Your product's identity (not the customer's venue — that comes from Settings).
// Edit brand.json and brand/logo.png, then run: npm run brand
import brand from '../../brand.json';
import productLogo from '../../brand/logo.png';

const VARS = {
  primary: '--brand', primaryHover: '--brand-hover', ink: '--brand-ink', tint: '--brand-tint', line: '--brand-line',
  gold: '--gold', goldInk: '--gold-ink', chart: '--chart', loginFrom: '--login-from', loginTo: '--login-to',
};

// Puts brand.json colors into the CSS variables every screen uses.
export function applyTheme() {
  const root = document.documentElement.style;
  for (const [k, v] of Object.entries(brand.colors || {})) if (VARS[k]) root.setProperty(VARS[k], v);
}

export { brand, productLogo };
