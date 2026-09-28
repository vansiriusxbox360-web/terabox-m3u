const { TeraBoxApp } = require('terabox-api');
const fs = require('fs');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const tb = new TeraBoxApp(fs.readFileSync('token.txt','utf-8').trim());
  await tb.updateAppData();
  const V = '/Ooooohh buenos días/Que bueno que vinihte/Pase, pase/Ah los zapatos en la puerta/La que esta cayendo por aqui/Te ofreceria un vasito de agua/Pero esta chungo/A ver donde puñetas la tengo/Pero si estaba aqui hace 25 años/Aaaaahhhquiestáaaa/Pera que lo limpie un poquito/Toma, echa un ojo/Menú del día dos puntos/El rinconcito dharmatico de Vishnu/Las cositas/Vicio';
  console.log('=== VICIO actual ===');
  const r = await tb.getRemoteDir(V, 1);
  const items = r.list || [];
  for (const it of items) {
    console.log((it.isdir ? '[D] ' : '    ') + it.server_filename);
  }
  // listar subcarpetas de Vicio
  console.log('\n=== SUBcarpetas de Vicio ===');
  for (const d of items.filter(i => i.isdir)) {
    await sleep(250);
    const sr = await tb.getRemoteDir(V + '/' + d.server_filename, 1);
    const sub = (sr.list || []).map(i => (i.isdir ? '[D] ' : '    ') + i.server_filename);
    console.log('\n[' + d.server_filename + ']');
    console.log(sub.join('\n') || '  (vacia)');
  }
})();
