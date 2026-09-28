const { TeraBoxApp } = require('terabox-api');
const fs = require('fs');
function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }
const LOG = 'C:\\Users\\VanSirius\\AppData\\Local\\Temp\\opencode\\doraemon_rename.log';
function log(m){
  const line = '[' + new Date().toISOString().slice(11,19) + '] ' + m;
  console.log(line);
  try { fs.appendFileSync(LOG, line + '\n'); } catch(e){}
}
function cleanName(fname){
  let n = fname.replace(/\.[^.]+$/,'');
  n = n.replace(/^Doraemon\s*/i,'');
  const dm = n.match(/^(\d{4})[- ](\d{2})[- ](\d{2})/);
  if (!dm) return null;
  const date = dm[1]+'-'+dm[2]+'-'+dm[3];
  n = n.slice(dm[0].length).trim();
  let num = null;
  let m = n.match(/^\[([^\]]+)\]/);
  if (m) { num = m[1]; n = n.slice(m[0].length).trim(); }
  else {
    m = n.match(/^(?:Cap[íi]tulo|Cap\.?)\s*(\d+)/i);
    if (m) { num = m[1]; n = n.slice(m[0].length).trim(); }
  }
  n = n.replace(/(\s*\[[^\]]*\]\s*)+$/g,'');
  n = n.replace(/[_]/g,' ').replace(/\s+/g,' ').replace(/\s*[-.]*\s*$/,'').trim();
  if (num === null) num = 'S';
  return date + ' [' + num + '] ' + n;
}
(async () => {
  const tb = new TeraBoxApp(fs.readFileSync('token.txt','utf-8').trim());
  tb.TERABOX_TIMEOUT = 60000;
  await tb.updateAppData();
  const search = await tb.search('Doraemon', 1);
  const files = (search && search.list || []).filter(x=>String(x.isdir)!=='1').map(x=>x.path);
  if (!files.length) { console.log('sin files'); return; }
  const idx = files[0].indexOf('/Doraemon');
  const base = files[0].slice(0, idx + '/Doraemon'.length);
  const root = await tb.getRemoteDir(base, 1);
  const ops = [];
  for (const it of (root && root.list || [])) {
    if (String(it.isdir)!=='1' || !/^\d{4}$/.test(it.server_filename)) continue;
    const sub = await tb.getRemoteDir(it.path, 1);
    for (const e of (sub && sub.list || [])) {
      if (String(e.isdir)==='1') continue;
      const nn = cleanName(e.server_filename);
      if (!nn || nn === e.server_filename) continue;
      ops.push({ path: e.path, id: e.fs_id, old: e.server_filename, new: nn });
    }
  }
  log('TOTAL a renombrar: ' + ops.length);
  const only = process.argv[2]; // si pasan 'probe' solo imprime
  if (only === 'probe') { for (const o of ops.slice(0,20)) log('  ' + o.old.slice(0,55) + '  =>  ' + o.new); return; }

  const BATCH = 25;
  let okCount = 0, failCount = 0;
  for (let i = 0; i < ops.length; i += BATCH) {
    const batch = ops.slice(i, i + BATCH);
    const payload = batch.map(o => ({ path: o.path, newname: o.new }));
    let res = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try { res = await tb.filemanager('rename', payload); break; }
      catch(e){ res = { errno: -1, msg: e.message }; }
      await sleep(3000);
    }
    if (res && res.errno === 0) {
      okCount += batch.length;
      for (const o of batch) log('  OK ' + o.new);
    } else {
      // reintentar individualmente
      for (const o of batch) {
        let r2 = null;
        for (let a2=0; a2<3; a2++) {
          try { r2 = await tb.filemanager('rename', [{ path: o.path, newname: o.new }]); break; }
          catch(e){ r2 = { errno: -1, msg: e.message }; }
          await sleep(2500);
        }
        if (r2 && r2.errno === 0) { okCount++; log('  OK(ind) ' + o.new); }
        else { failCount++; log('  !! FALLO ' + o.old + ' -> ' + (r2 && r2.errno)); }
      }
    }
    await sleep(800);
  }
  log('=== FIN: ok=' + okCount + ' fail=' + failCount + ' ===');
})();