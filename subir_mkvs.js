const { TeraBoxApp } = require('terabox-api');
const helper = require('terabox-api/helper.js');
const fs = require('fs');
const path = require('path');

const DIR_SALIDA = 'J:\\trabajo\\salida';
// sube los .mkv de DIR_SALIDA a la carpeta de su AVI original en Terabox
// mapeo: avi_decision.json tiene path -> info; el MKV es el mismo nombre con .mkv

(async () => {
  try {
    const ndus = fs.readFileSync('token.txt', 'utf-8').trim();
    const tb = new TeraBoxApp(ndus);
    await tb.updateAppData();

    const decision = JSON.parse(fs.readFileSync('avi_decision.json', 'utf-8'));
    // invertir: nombre base -> path terabox
    const porBase = {};
    for (const [p, v] of Object.entries(decision)) {
      const base = path.basename(p).replace(/\.avi$/i, '');
      porBase[base] = p;
    }

    const done = {};
    if (fs.existsSync('avi_uploaded.json')) {
      try { Object.assign(done, JSON.parse(fs.readFileSync('avi_uploaded.json', 'utf-8'))); } catch (e) {}
    }

    const mkvs = fs.readdirSync(DIR_SALIDA).filter((f) => f.toLowerCase().endsWith('.mkv'));
    console.log('MKVs en salida:', mkvs.length, '- ya subidos:', Object.keys(done).length);

    // reparto por worker: W_ID y W_TOTAL reparten los MKVs entre procesos paralelos
    const W_ID = parseInt(process.env.W_ID || '0', 10);
    const W_TOTAL = parseInt(process.env.W_TOTAL || '1', 10);
    const misMkvs = mkvs.filter((_, idx) => idx % W_TOTAL === W_ID);
    console.log('worker', W_ID + '/' + W_TOTAL, '->', misMkvs.length, 'MKVs');

    for (const mkv of misMkvs) {
      if (done[mkv]) continue;
      try {
        const base = mkv.replace(/\.mkv$/i, '');
        const remotePath = porBase[base];
        if (!remotePath) { console.log('sin path remoto para', mkv); continue; }
        const file = path.basename(remotePath).replace(/\.avi$/i, '.mkv');
        const remoteDir = path.dirname(remotePath);
        const filePath = path.join(DIR_SALIDA, mkv);
        const size = fs.statSync(filePath).size;

        // SEGURIDAD: primero SUBIR el MKV y verificar que esta en Terabox.
        const hash = await helper.hashFile(filePath);
        const pre = await tb.precreateFile({ remote_dir: remoteDir, file, size, hash });
        const totalChunks = hash.chunks.length;
        const data = { remote_dir: remoteDir, file, size, hash, upload_id: pre.uploadid, uploaded: new Array(totalChunks).fill(false) };
        const st = await helper.uploadChunks(tb, data, filePath);
        if (!st.ok) { console.log('upload fallo, NO se toca el AVI:', file); continue; }
        const cr = await tb.createFile({ remote_dir: remoteDir, file, size, hash: st.data.hash, upload_id: pre.uploadid });
        if (!cr || cr.errno !== 0) {
          console.log('createFile fallo, NO se toca el AVI:', file, cr && cr.errno);
          continue;
        }
        // MKV subido y confirmado: ahora si, borrar el AVI original en Terabox
        try {
          const del = await tb.filemanager('delete', [remotePath]);
          if (del && del.errno === 0) console.log('AVI borrado (MKV ya subido):', file);
        } catch (e) { console.log('no se pudo borrar AVI (pero MKV ya subido)', file, e.message); }
        // borrar MKV local para liberar espacio
        try { fs.unlinkSync(filePath); } catch (e) {}
        done[mkv] = true;
        // guardar progreso incremental
        fs.writeFileSync('avi_uploaded.json', JSON.stringify(done, null, 2));
        console.log('SUBIDO y guardado:', file);
      } catch (e) {
        // no morir por un error: registrar y seguir
        console.log('error en ' + mkv + ': ' + e.message);
      }
    }

    fs.writeFileSync('avi_uploaded.json', JSON.stringify(done, null, 2));
    console.log('=== FIN subida === subidos:', Object.keys(done).length);
  } catch (e) {
    console.error('FATAL', e.message);
  }
})();
