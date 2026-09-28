const { TeraBoxApp } = require('terabox-api');
const fs = require('fs');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const tb = new TeraBoxApp(fs.readFileSync('token.txt','utf-8').trim());
  await tb.updateAppData();
  async function ls(p) {
    try { const r = await tb.getRemoteDir(p, 1); await sleep(300); return (r.list || []); }
    catch (e) { return []; }
  }
  const n1 = await ls('/Ooooohh buenos días');
  console.log('Nivel 1 (' + n1.length + '):');
  for (const d of n1.filter(i => i.isdir)) console.log('  [D]', d.server_filename);
  // buscar vicio en nivel 2
  for (const d of n1.filter(i => i.isdir)) {
    const n2 = await ls('/Ooooohh buenos días/' + d.server_filename);
    const sub = n2.filter(i => i.isdir).map(i => i.server_filename);
    if (sub.some(s => /vicio/i.test(s))) {
      console.log('FOUND vicio bajo:', d.server_filename, '->', sub.filter(s => /vicio/i.test(s)));
    }
  }
})();
