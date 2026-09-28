const { TeraBoxApp } = require('terabox-api');
const fs = require('fs');

(async () => {
  const ndus = fs.readFileSync('token.txt', 'utf-8').trim();
  const tb = new TeraBoxApp(ndus);
  await tb.updateAppData();
  const target = "/Ooooohh buenos días/Que bueno que vinihte/Pase, pase/Ah los zapatos en la puerta/La que esta cayendo por aqui/Te ofreceria un vasito de agua/Pero esta chungo/A ver donde puñetas la tengo/Pero si estaba aqui hace 25 años/Aaaaahhhquiestáaaa/Pera que lo limpie un poquito/Toma, echa un ojo/Menú del día dos puntos/El rinconcito dharmatico de Vishnu/Las cositas/Dibus que no son ªnime/las que te ponian comiendo/merendando o desayunando si tenías cerca el cole/Y que no haya dibus puede/o algo de ªnime puedes hallar/hoven padawan/las que te ponías en VHS o tu madre te decía en mis tiempos habia cosas muy bonitas/no como los Pokémon esos que el muñeco solo mueve la boca/Las Aventuras de Tintin/Tintin 1x18 Tintin en el Tibet(1).mkv";
  try {
    const del = await tb.filemanager('delete', [target]);
    console.log('delete respuesta:', JSON.stringify(del));
  } catch (e) {
    console.log('FALLO:', e.message);
  }
})();
