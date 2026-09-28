const { TeraBoxApp } = require('terabox-api');
const fs = require('fs');
function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }
async function searchRetry(tb, term){
  for (let i = 0; i < 4; i++) {
    try { return await tb.search(term, 1); }
    catch(e){ await sleep(4000); }
  }
  return null;
}
(async () => {
  const tb = new TeraBoxApp(fs.readFileSync('token.txt','utf-8').trim());
  tb.TERABOX_TIMEOUT = 60000;
  await tb.updateAppData();
  const terms = ['Filadelfia','Doraemon','Power Rangers','Off the Air','Edison','Disney','Pixar'];
  for (const t of terms) {
    const r = await searchRetry(tb, t);
    const list = (r && (r.list || [])) || [];
    console.log(`\n### "${t}" -> ${list.length} resultados`);
    for (const it of list.slice(0, 12)) {
      console.log(`  [${String(it.isdir)==='1'?'DIR':'FILE'}] ${it.path}`);
    }
  }
})();
