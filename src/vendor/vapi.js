async function invoke(channel, ...args) {
  if (!window.heaven) throw new Error('افتح البرنامج من npm run vendor');
  const res = await window.heaven.invoke(channel, ...args);
  if (!res.ok) throw new Error(res.error);
  return res.data;
}

export const v = {
  list: (tbl) => invoke('v:list', tbl),
  put: (tbl, obj) => invoke('v:put', tbl, obj),
  remove: (tbl, id) => invoke('v:remove', tbl, id),
  renew: (d) => invoke('v:renew', d),
  sell: (d) => invoke('v:sell', d),
  support: (d) => invoke('v:support', d),
  issue: (id) => invoke('v:issue', id),
  keyInfo: () => invoke('v:keyInfo'),
  link: () => invoke('v:link'),
  exportBackup: () => invoke('v:exportBackup'),
  importBackup: () => invoke('v:importBackup'),
  saveFile: (o) => invoke('file:save', o),
  info: () => invoke('v:info'),
};
