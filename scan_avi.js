const { TeraBoxApp } = require('terabox-api');
const fs = require('fs');

(async () => {
  try {
    const ndus = fs.readFileSync('token.txt', 'utf-8').trim();
    const tb = new TeraBoxApp(ndus);
    await tb.updateAppData();
    const base = '/Ooooohh buenos días/Que bueno que vinihte/Pase, pase/Ah los zapatos en la puerta/La que esta cayendo por aqui/Te ofreceria un vasito de agua/Pero esta chungo/A ver donde puñetas la tengo/Pero si estaba aqui hace 25 años/Aaaaahhhquiestáaaa/Pera que lo limpie un poquito/Toma, echa un ojo/Menú del día dos puntos/El rinconcito dharmatico de Vishnu/Las cositas';

    const avi = [];
    const seen = new Set();
    let totalArchivos = 0;

    async function walk(dir, depth) {
      if (depth > 15 || seen.has(dir)) return;
      seen.add(dir);
      let page = 1;
      while (true) {
        const r = await tb.getRemoteDir(dir, page);
        if (!r || !r.list || r.list.length === 0) break;
        for (const item of r.list) {
          const isDir = item.isdir === '1' || item.isdir === 1;
          if (isDir) {
            await walk(item.path, depth + 1);
          } else {
            totalArchivos++;
            const ext = (item.server_filename.split('.').pop() || '').toLowerCase();
            if (ext === 'avi') {
              avi.push({ path: item.path, size: item.size || 0 });
            }
          }
        }
        if ((r.list || []).length < 200) break;
        page++;
        await new Promise((res) => setTimeout(res, 300));
      }
    }

    console.log('Escaneando...');
    await walk(base, 0);
    // Guardar completo a disco (independiente del stdout)
    fs.writeFileSync('avi_scan.json', JSON.stringify(avi, null, 2));
    console.log('JSON guardado. Total AVI:', avi.length);

    // Resumen por serie (carpeta contenedora)
    const bySeries = {};
    for (const a of avi) {
      const parts = a.path.split('/');
      let serie = parts[parts.length - 2];
      if (/^T\d|^S\d/i.test(serie) || /^Temp/i.test(serie)) {
        serie = parts[parts.length - 3];
      }
      if (!bySeries[serie]) bySeries[serie] = { n: 0, mb: 0 };
      bySeries[serie].n++;
      bySeries[serie].mb += Math.round(a.size / 1024 / 1024);
    }
    console.log('=== AVI POR SERIE ===');
    const sorted = Object.entries(bySeries).sort((a, b) => b[1].n - a[1].n);
    for (const [serie, info] of sorted) {
      console.log(`${String(info.n).padStart(4)} archivos, ${(info.mb / 1024).toFixed(1)}GB : ${serie}`);
    }
  } catch (e) {
    console.error('ERR', e.message);
  }
})();
