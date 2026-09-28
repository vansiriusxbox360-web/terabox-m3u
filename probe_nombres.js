const { TeraBoxApp } = require('terabox-api');
const fs = require('fs');
function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }
async function s(tb, term){ for (let i=0;i<4;i++){ try { return await tb.search(term,1); } catch(e){ await sleep(4000); } } return null; }
(async () => {
  const tb = new TeraBoxApp(fs.readFileSync('token.txt','utf-8').trim());
  tb.TERABOX_TIMEOUT = 60000;
  await tb.updateAppData();
  for (const t of ['Remastered','Flapjack','Jorobado','Hunchback']) {
    const r = await s(tb, t);
    const list = (r && r.list) || [];
    const dirs = list.filter(x=>String(x.isdir)==='1');
    const files = list.filter(x=>String(x.isdir)!=='1');
    console.log(`### ${t}: dirs=${dirs.length} files=${files.length}`);
    for (const d of dirs.slice(0,6)) { const p=d.path.split('/'); console.log('  DIR .../'+p.slice(-3).join(' / ')); }
    for (const f of files.slice(0,4)) { const p=f.path.split('/'); console.log('  FILE .../'+p.slice(-4).join(' / ')); }
  }
})();
