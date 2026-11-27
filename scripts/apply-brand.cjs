// Applies brand.json + brand/logo.png to the build settings and the app icon.
// Run after changing your product name or logo:  npm run brand
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const brand = JSON.parse(fs.readFileSync(path.join(root, 'brand.json'), 'utf8'));
const logo = path.join(root, 'brand', 'logo.png');

// The icon must be a square PNG of at least 512x512 for macOS and Windows installers.
const png = fs.readFileSync(logo);
if (png.toString('ascii', 1, 4) !== 'PNG') throw new Error('brand/logo.png لازم يكون PNG');
const w = png.readUInt32BE(16); const h = png.readUInt32BE(20);
if (w !== h) console.warn(`⚠️  اللوجو مش مربع (${w}x${h}) — هيظهر متمطوط في الأيقونة. الأفضل صورة مربعة.`);
if (Math.min(w, h) < 512) throw new Error(`اللوجو صغير (${w}x${h}) — لازم 512x512 على الأقل للأيقونة`);
fs.copyFileSync(logo, path.join(root, 'build', 'icon.png'));

const pkgFile = path.join(root, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
pkg.productName = brand.productName;
pkg.description = brand.description || pkg.description;
pkg.author = brand.company || pkg.author;
pkg.build.productName = brand.productName;
pkg.build.appId = brand.appId;
pkg.build.nsis.shortcutName = brand.productName;
fs.writeFileSync(pkgFile, `${JSON.stringify(pkg, null, 2)}\n`);

console.log(`✓ ${brand.productName} — icon ${w}x${h}, appId ${brand.appId}`);
