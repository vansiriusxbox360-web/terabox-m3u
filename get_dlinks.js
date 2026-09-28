const { TeraBoxApp } = require('terabox-api');
const fs = require('fs');

const BATCH = 30;

(async () => {
  try {
    const ndus = fs.readFileSync('token.txt', 'utf-8').trim();
    const tb = new TeraBoxApp(ndus);
    await tb.updateAppData();
    const avi = JSON.parse(fs.readFileSync('avi_scan.json', 'utf-8'));

    // cargar dlinks ya obtenidos para reanudar
    let dlinks = {};
    if (fs.existsSync('avi_dlinks.json')) {
      try { dlinks = JSON.parse(fs.readFileSync('avi_dlinks.json', 'utf-8')); } catch (e) {}
    }
    const paths = avi.map((a) => a.path);
    const pending = paths.filter((p) => !dlinks[p]);

    console.log('AVIs:', avi.length, '- dlinks pendientes:', pending.length);
    for (let b = 0; b < pending.length; b += BATCH) {
      const batch = pending.slice(b, b + BATCH);
      try {
        const meta = await tb.getFileMeta(batch);
        const infoList = (meta && meta.info) || (meta && meta.list) || (Array.isArray(meta) ? meta : []);
        for (const f of infoList) {
          if (f && f.dlink && f.path) dlinks[f.path] = f.dlink;
          else if (f && f.dlink && f.server_filename) {
            // encontrar el path completo por el nombre
            const hit = avi.find((a) => a.path.endsWith('/' + f.server_filename));
            if (hit) dlinks[hit.path] = f.dlink;
          }
        }
        // intento individual para los que faltan de este lote
        for (const p of batch) {
          if (dlinks[p]) continue;
          try {
            const one = await tb.getFileMeta([p]);
            const oi = (one && one.info) || (one && one.list) || (Array.isArray(one) ? one : []);
            if (oi[0] && oi[0].dlink) dlinks[p] = oi[0].dlink;
          } catch (e) {}
          await new Promise((r) => setTimeout(r, 100));
        }
      } catch (e) {
        console.log('error lote', b, e.message);
      }
      if ((b / BATCH) % 20 === 0) {
        fs.writeFileSync('avi_dlinks.json', JSON.stringify(dlinks));
        console.log('  progreso:', Object.keys(dlinks).length, '/', avi.length);
      }
      await new Promise((r) => setTimeout(r, 150));
    }
    fs.writeFileSync('avi_dlinks.json', JSON.stringify(dlinks));
    const ok = Object.keys(dlinks).length;
    console.log('TOTAL dlinks:', ok, '/', avi.length, '- fallos:', avi.length - ok);
  } catch (e) {
    console.error('FATAL', e.message);
  }
})();
