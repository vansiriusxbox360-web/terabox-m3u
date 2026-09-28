const { TeraBoxApp } = require('terabox-api');
const fs = require('fs');
const path = require('path');
const VIDEO_EXTENSIONS = ['.mp4', '.mkv', '.avi', '.wmv', '.flv', '.mov', '.m4v', '.mpg', '.mpeg', '.3gp', '.webm'];
const DELAY_MS = 400;
const ROOT = '/Ooooohh buenos días/Que bueno que vinihte/Pase, pase/Ah los zapatos en la puerta/La que esta cayendo por aqui/Te ofreceria un vasito de agua/Pero esta chungo/A ver donde puñetas la tengo/Pero si estaba aqui hace 25 años/Aaaaahhhquiestáaaa/Pera que lo limpie un poquito/Toma, echa un ojo/Menú del día dos puntos/El rinconcito dharmatico de Vishnu/Las cositas';
function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }
function isVideoFile(f){ return VIDEO_EXTENSIONS.includes(path.extname(f).toLowerCase()); }
(async () => {
  const tb = new TeraBoxApp(fs.readFileSync('token.txt','utf-8').trim());
  tb.TERABOX_TIMEOUT = 60000;
  await tb.updateAppData();
  const files = [];
  async function listDirectory(dirPath, page=1){
    try { const r = await tb.getRemoteDir(dirPath, page); await sleep(DELAY_MS); return (r && r.list && r.list.length) ? r : null; }
    catch(e){ await sleep(10000); return null; }
  }
  async function scanRecursive(dirPath){
    let page = 1;
    while (true) {
      const result = await listDirectory(dirPath, page);
      if (!result || !result.list || !result.list.length) break;
      const folders = [], f = [];
      for (const it of result.list) { if (String(it.isdir)==='1') folders.push(it); else if (isVideoFile(it.server_filename)) f.push({path: it.path, name: it.server_filename}); }
      folders.sort((a,b)=>a.server_filename.localeCompare(b.server_filename,'es',{numeric:true}));
      const CONC = 6; let idx = 0;
      async function worker(){ while(idx<folders.length){ const folder = folders[idx++]; await scanRecursive(folder.path); } }
      await Promise.all(Array.from({length: Math.min(CONC, folders.length)}, worker));
      for (const x of f) files.push(x);
      const count = parseInt(result.list_count || result.list.length);
      if (count >= 200) page++; else break;
    }
  }
  await scanRecursive(ROOT);
  const byFolder = {};
  for (const f of files) {
    const folder = f.path.substring(0, f.path.lastIndexOf('/'));
    const ext = path.extname(f.name).toLowerCase();
    if (ext === '.mkv') continue;
    if (!byFolder[folder]) byFolder[folder] = [];
    byFolder[folder].push({name: f.name, ext});
  }
  const rows = Object.entries(byFolder).filter(([,v])=>v.length).sort((a,b)=>b[1].length-a[1].length);
  let total = 0; for (const [,v] of rows) total += v.length;
  let out = `Carpetas con videos que NO son .mkv (${rows.length}) | videos NO mkv: ${total} (de ${files.length} videos en total)\n`;
  out += '='.repeat(90) + '\n';
  for (const [folder, v] of rows) {
    const exts = {}; for (const x of v) exts[x.ext] = (exts[x.ext]||0)+1;
    const extStr = Object.entries(exts).map(([e,n])=>`${e} x${n}`).join(', ');
    out += `\n[${v.length}] ${folder}\n    exts: ${extStr}\n`;
    for (const x of v.slice(0, 10)) out += `    - ${x.name}\n`;
    if (v.length > 10) out += `    ... y ${v.length-10} mas\n`;
  }
  fs.writeFileSync('carpetas_no_mkv.txt', out, 'utf-8');
  console.log('carpetas:', rows.length, '| videos no-mkv:', total, '| escritos en carpetas_no_mkv.txt');
})();
