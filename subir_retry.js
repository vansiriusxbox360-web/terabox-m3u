const { TeraBoxApp } = require('terabox-api');
const helper = require('terabox-api/helper.js');
const fs = require('fs');
const path = require('path');
(async () => {
  const tb = new TeraBoxApp(fs.readFileSync('token.txt','utf-8').trim());
  await tb.updateAppData();
  const V = '/Ooooohh buenos días/Que bueno que vinihte/Pase, pase/Ah los zapatos en la puerta/La que esta cayendo por aqui/Te ofreceria un vasito de agua/Pero esta chungo/A ver donde puñetas la tengo/Pero si estaba aqui hace 25 años/Aaaaahhhquiestáaaa/Pera que lo limpie un poquito/Toma, echa un ojo/Menú del día dos puntos/El rinconcito dharmatico de Vishnu/Las cositas/Vicio';
  const zipDir = 'C:\\Users\\VanSirius\\Downloads\\Cositas ms-ds\\EMP\\zips';
  const lote = ["Dangerous Dave 2 - Risky Rescue.zip","Dangerous Dave 4 - Copyright Infringement.zip"];
  function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }
  for (const f of lote) {
    const fp = path.join(zipDir, f);
    if (!fs.existsSync(fp)) { console.log('FALTA:', f); continue; }
    const size = fs.statSync(fp).size;
    for (let attempt=1; attempt<=3; attempt++) {
      try {
        const hash = await helper.hashFile(fp);
        const pre = await tb.precreateFile({ remote_dir: V, file: f, size, hash });
        const total = hash.chunks.length;
        const data = { remote_dir: V, file: f, size, hash, upload_id: pre.uploadid, uploaded: new Array(total).fill(false) };
        const st = await helper.uploadChunks(tb, data, fp);
        if (!st.ok) { console.log('upload fallo:', f, '(intento '+attempt+')'); await sleep(8000); continue; }
        const cr = await tb.createFile({ remote_dir: V, file: f, size, hash: st.data.hash, upload_id: pre.uploadid });
        if (cr && cr.errno === 0) { console.log('SUBIDO:', f); break; }
        else { console.log('createFile fallo:', f, cr && cr.errno, '(intento '+attempt+')'); await sleep(8000); }
      } catch(e){ console.log('error intento '+attempt, f, e.message); await sleep(10000); }
    }
    await sleep(3000);
  }
  console.log('=== REINTENTO FIN ===');
})();
