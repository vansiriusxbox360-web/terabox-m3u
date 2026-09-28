const { TeraBoxApp } = require('terabox-api');
const fs = require('fs');
function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }
(async () => {
  const tb = new TeraBoxApp(fs.readFileSync('token.txt','utf-8').trim());
  tb.TERABOX_TIMEOUT = 60000;
  await tb.updateAppData();
  const search = await tb.search('Doraemon', 1);
  const files = (search && search.list || []).filter(x=>String(x.isdir)!=='1').map(x=>x.path);
  const idx = files[0].indexOf('/Doraemon');
  const base = files[0].slice(0, idx + '/Doraemon'.length);
  for (const y of ['1979','1997','2005','2009']) {
    const sub = await tb.getRemoteDir(base + '/' + y, 1);
    const eps = (sub && sub.list || []).filter(x=>String(x.isdir)!=='1');
    console.log('['+y+'] '+eps.length+' -> muestra:');
    for (const e of eps.slice(0,3)) console.log('   ', e.server_filename.slice(0,60));
    if (eps.length>3) console.log('   ...');
  }
})();
