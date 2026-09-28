const fs = require('fs');
const https = require('https');
const qs = require('querystring');
const ndus = fs.readFileSync('token.txt','utf-8').trim();
function get(path, q) {
  return new Promise((resolve, reject) => {
    const url = 'https://www.terabox.com' + path + '?' + qs.stringify(q);
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0', 'Cookie': 'lang=en; ndus=' + ndus } }, res => {
      let d = ''; res.on('data', c => d += c); res.on('end', () => { try { resolve(JSON.parse(d)); } catch(e){ reject(new Error(d.slice(0,200))); } });
    }).on('error', reject);
  });
}
(async () => {
  const r = await get('/api/list', { dir: '/vicio', num: 1000, page: 1, web: 1, channel: 'dubox', clienttype: 0, app_id: 250528, bdstoken: '' });
  console.log('errno:', r.errno, r.errmsg || '');
  if (r.errno === 0) console.log((r.list||[]).map(i => (i.isdir?'[D] ':'    ')+i.server_filename).join('\n') || '(vacio)');
})();
