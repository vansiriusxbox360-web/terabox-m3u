const { TeraBoxApp } = require('terabox-api');
const fs = require('fs');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const tb = new TeraBoxApp(fs.readFileSync('token.txt','utf-8').trim());
  await tb.updateAppData();
  const NOMBRE_VICIO = 'vicio';
  let found = null;
  async function walk(p, depth) {
    if (found || depth > 14) return;
    let items = [];
    try { const r = await tb.getRemoteDir(p, 1); items = r.list || []; }
    catch (e) { return; }
    await sleep(250);
    for (const i of items) {
      if (!i.isdir) continue;
      const full = p + '/' + i.server_filename;
      if (i.server_filename.toLowerCase() === NOMBRE_VICIO) { found = full; console.log('VICIO =', full); return; }
      await walk(full, depth + 1);
    }
  }
  await walk('/Ooooohh buenos días', 0);
  if (!found) console.log('NO se encontro carpeta vicio');
})();
