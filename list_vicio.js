const fs = require('fs');
const https = require('https');
const qs = require('querystring');
const ndus = fs.readFileSync('token.txt','utf-8').trim();
function post(path, data) {
  return new Promise((resolve, reject) => {
    const body = qs.stringify(data);
    const req = https.request({ hostname: 'www.terabox.com', path, method: 'POST', headers: { 'User-Agent': 'Mozilla/5.0', 'Cookie': 'lang=en; ndus=' + ndus, 'Content-Type': 'application/x-www-form-urlencoded' } }, res => {
      let d = ''; res.on('data', c => d += c); res.on('end', () => { try { resolve(JSON.parse(d)); } catch(e){ reject(e); } });
    });
    req.on('error', reject); req.write(body); req.end();
  });
}
(async () => {
  const r = await post('/api/list', { dir: '/vicio', num: 1000, page: 1 });
  console.log('errno:', r.errno);
  const files = (r.list || []).map(i => (i.isdir ? '[D] ' : '    ') + i.server_filename).join('\n');
  console.log(files || '(vacio)');
})();
