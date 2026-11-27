// Online license check: real time from the internet, plus the customer's latest key and
// suspension status from the vendor's license server (a Supabase project the vendor owns).
// Everything returned here is checked against the vendor's signature before it is trusted.

const TIME_URLS = ['https://www.google.com/generate_204', 'https://www.cloudflare.com/cdn-cgi/trace'];

async function timeFrom(res) {
  const t = Date.parse(res.headers.get('date') || '');
  return Number.isFinite(t) ? t : null;
}

async function checkOnline({ server, cid, timeout = 10000 } = {}) {
  const signal = AbortSignal.timeout(timeout);
  let serverTime = null;
  let row = null;
  if (server?.url && server?.anonKey && cid) {
    try {
      const res = await fetch(`${server.url.replace(/\/+$/, '')}/rest/v1/rpc/license_status`, {
        method: 'POST', signal,
        headers: { apikey: server.anonKey, Authorization: `Bearer ${server.anonKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_cid: cid }),
      });
      serverTime = await timeFrom(res);
      if (res.ok) {
        const data = await res.json();
        row = Array.isArray(data) ? data[0] || null : data;
      }
    } catch { /* fall through to a public time source */ }
  }
  if (!serverTime) {
    for (const url of TIME_URLS) {
      try {
        serverTime = await timeFrom(await fetch(url, { method: 'HEAD', signal }));
        if (serverTime) break;
      } catch { /* try the next one */ }
    }
  }
  if (!serverTime) throw new Error('لا يوجد اتصال بالإنترنت');
  return { serverTime, key: row?.key || null, status: row?.status || null };
}

module.exports = { checkOnline };
