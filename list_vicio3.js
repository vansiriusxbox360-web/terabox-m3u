const fs = require('fs');
const https = require('https');
const qs = require('querystring');
const ndus = fs.readFileSync('token.txt','utf-8').trim();
function req(path, data) {
  return new Promise((resolve, reject) => {
    const body = qs.stringify(data);
    const r = https.request({ hostname: 'www.terabox.com', path, method: 'POST', headers: { 'User-Agent': 'Mozilla/5.0', 'Cookie': 'lang=en; ndus=' + ndus, 'Content-Type': 'application/x-www-form-urlencoded' } }, res => {
      let d = ''; res.on('data', c => d += c); res.on('end', () => { try { resolve(JSON.parse(d)); } catch(e){ reject(new Error(d.slice(0,200))); } });
    });
    r.on('error', reject); r.write(body); r.end();
  });
}
(async () => {
  // probar list con distintos origenes
  for (const extra of [{}, {origin:'list'}, {order:'time',desc:1}, {logid: Date.now()}]) {
    const r = await req('/api/list', Object.assign({ dir: '/vicio', num: 1000, page: 1 }, extra));
    console.log('extra', JSON.stringify(extra), '-> errno:', r.errno);
    if (r.errno === 0) { console.log((r.list||[]).map(i => (i.isdir?'[D] ':'    ')+i.server_filename).join('\n')); break; }
  }
  // probar el list v2
  const r2 = await req('/api/list/v2', { dir: '/vicio', num: 1000, page: 1 });
  console.log('list/v2 errno:', r2.errno);
  if (r2.errno === 0) console.log((r2.list||[]).map(i => (i.isdir?'[D] ':'    ')+i.server_filename).join('\n'));
})();
