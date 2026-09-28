const { TeraBoxApp } = require('terabox-api');
const fs = require('fs');
(async () => {
  const tb = new TeraBoxApp(fs.readFileSync('token.txt','utf-8').trim());
  await tb.updateAppData();
  const V = '/Ooooohh buenos días/Que bueno que vinihte/Pase, pase/Ah los zapatos en la puerta/La que esta cayendo por aqui/Te ofreceria un vasito de agua/Pero esta chungo/A ver donde puñetas la tengo/Pero si estaba aqui hace 25 años/Aaaaahhhquiestáaaa/Pera que lo limpie un poquito/Toma, echa un ojo/Menú del día dos puntos/El rinconcito dharmatico de Vishnu/Las cositas/Vicio';
  for (const dup of ["Dangerous Dave 2 - Risky Rescue(1).zip","Dangerous Dave 4 - Copyright Infringement(1).zip"]) {
    const target = V + '/' + dup;
    const del = await tb.filemanager('delete', [target]);
    console.log('borrado', dup, '->', del && del.errno === 0 ? 'OK' : JSON.stringify(del && del.errno));
  }
})();
