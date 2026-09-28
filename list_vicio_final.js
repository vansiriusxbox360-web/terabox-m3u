const { TeraBoxApp } = require('terabox-api');
const fs = require('fs');
(async () => {
  const tb = new TeraBoxApp(fs.readFileSync('token.txt','utf-8').trim());
  await tb.updateAppData();
  const V = '/Ooooohh buenos días/Que bueno que vinihte/Pase, pase/Ah los zapatos en la puerta/La que esta cayendo por aqui/Te ofreceria un vasito de agua/Pero esta chungo/A ver donde puñetas la tengo/Pero si estaba aqui hace 25 años/Aaaaahhhquiestáaaa/Pera que lo limpie un poquito/Toma, echa un ojo/Menú del día dos puntos/El rinconcito dharmatico de Vishnu/Las cositas/Vicio';
  const r = await tb.getRemoteDir(V, 1);
  const items = r.list || [];
  console.log('TOTAL EN VICIO:', items.length);
  for (const it of items) console.log((it.isdir ? '[D] ' : '    ') + it.server_filename);
})();
