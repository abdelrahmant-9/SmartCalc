// Thin wrapper around the Electron IPC bridge. Every call resolves to data or throws an Error with an Arabic message.
async function invoke(channel, ...args) {
  if (!window.heaven) throw new Error('البرنامج يجب أن يعمل من داخل التطبيق');
  const res = await window.heaven.invoke(channel, ...args);
  if (!res.ok) throw new Error(res.error);
  return res.data;
}

export const api = {
  login: (u, p) => invoke('auth:login', u, p),
  logout: () => invoke('auth:logout'),
  me: () => invoke('auth:me'),
  changePassword: (o, n) => invoke('auth:changePassword', o, n),

  list: (tbl, opts) => invoke('db:list', tbl, opts),
  get: (tbl, id) => invoke('db:get', tbl, id),
  put: (tbl, obj) => invoke('db:put', tbl, obj),
  remove: (tbl, id) => invoke('db:remove', tbl, id),
  saveUser: (u) => invoke('users:save', u),
  catalogue: () => invoke('auth:catalogue'),
  license: () => invoke('license:status'),
  activateLicense: (k) => invoke('license:activate', k),
  activateLicenseFile: () => invoke('license:activateFile'),
  checkLicense: () => invoke('license:check'),
  removeLicense: () => invoke('license:remove'),
  branding: () => invoke('app:branding'),
  updateProfile: (d) => invoke('auth:updateProfile', d),
  activity: (opts) => invoke('audit:list', opts),
  devInfo: () => invoke('dev:info'),
  devAction: (a) => invoke('dev:action', a),

  syncConfig: () => invoke('sync:getConfig'),
  setSyncConfig: (c) => invoke('sync:setConfig', c),
  syncStatus: () => invoke('sync:status'),
  syncNow: () => invoke('sync:now'),

  saveFile: (opts) => invoke('file:save', opts),
  exportBackup: () => invoke('backup:export'),
  importBackup: () => invoke('backup:import'),
  appInfo: () => invoke('app:info'),

  on: (channel, cb) => (window.heaven ? window.heaven.on(channel, cb) : () => {}),
};
