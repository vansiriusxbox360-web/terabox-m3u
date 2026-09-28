const { TeraBoxApp } = require('terabox-api');
const helper = require('terabox-api/helper.js');
const fs = require('fs');
const path = require('path');
(async () => {
  const tb = new TeraBoxApp(fs.readFileSync('token.txt','utf-8').trim());
  await tb.updateAppData();
  const V = '/Ooooohh buenos días/Que bueno que vinihte/Pase, pase/Ah los zapatos en la puerta/La que esta cayendo por aqui/Te ofreceria un vasito de agua/Pero esta chungo/A ver donde puñetas la tengo/Pero si estaba aqui hace 25 años/Aaaaahhhquiestáaaa/Pera que lo limpie un poquito/Toma, echa un ojo/Menú del día dos puntos/El rinconcito dharmatico de Vishnu/Las cositas/Vicio';
  const fp = 'C:\\Users\\VanSirius\\Downloads\\Cositas ms-ds\\EMP\\zips\\Prince of Persia.zip';
  const f = 'Prince of Persia.zip';
  function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }
  const size = fs.statSync(fp).size;
  const hash = await helper.hashFile(fp);
  const pre = await tb.precreateFile({ remote_dir: V, file: f, size, hash });
  const total = hash.chunks.length;
  const data = { remote_dir: V, file: f, size, hash, upload_id: pre.uploadid, uploaded: new Array(total).fill(false) };
  const st = await helper.uploadChunks(tb, data, fp);
  if (!st.ok) { console.log('upload fallo'); }
  const cr = await tb.createFile({ remote_dir: V, file: f, size, hash: st.data.hash, upload_id: pre.uploadid });
  console.log('PoP1:', cr && cr.errno === 0 ? 'SUBIDO' : 'fallo ' + (cr && cr.errno));
})();
