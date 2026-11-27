// When the product is renamed, macOS/Windows look for its data in a new folder named after the new
// name. This copies the data from the old folder the first time the renamed app starts.
// The old folder is left in place as a backup.
const fs = require('node:fs');
const path = require('node:path');

function migrateUserData(app, previousNames = [], marker) {
  const target = app.getPath('userData');
  if (fs.existsSync(path.join(target, marker))) return null;
  for (const name of previousNames) {
    const from = path.join(app.getPath('appData'), name);
    if (path.resolve(from) === path.resolve(target) || !fs.existsSync(path.join(from, marker))) continue;
    fs.mkdirSync(target, { recursive: true });
    for (const entry of fs.readdirSync(from)) {
      // Only the app's own data, not Chromium caches.
      if (/^(heaven\.db|vendor\.db|vendor-private-key\.pem)(-wal|-shm)?$/.test(entry)) {
        fs.copyFileSync(path.join(from, entry), path.join(target, entry));
      }
    }
    return from;
  }
  return null;
}

module.exports = { migrateUserData };
