const { TeraBoxApp } = require('terabox-api');
const fs = require('fs');
const { execFileSync } = require('child_process');

const FFMPEG = 'C:\\Users\\VanSirius\\Downloads\\ffmpeg-win32-x64.exe';
const TMP = 'C:\\Users\\VanSirius\\AppData\\Local\\Temp\\opencode\\head_tmp';

(async () => {
  try {
    const ndus = fs.readFileSync('token.txt', 'utf-8').trim();
    const tb = new TeraBoxApp(ndus);
    await tb.updateAppData();
    fs.mkdirSync(TMP, { recursive: true });

    const avi = JSON.parse(fs.readFileSync('avi_scan.json', 'utf-8'));
    // LIMIT: si existe la variable de entorno, probar con un subconjunto
    const limit = process.env.AVI_LIMIT ? parseInt(process.env.AVI_LIMIT) : 0;
    const subset = limit > 0 ? avi.slice(0, limit) : avi;
    console.log('Analizando', subset.length, 'AVIs...');

    const results = [];
    let err = 0;

    for (let i = 0; i < subset.length; i++) {
      const a = subset[i];
      if (i % 100 === 0) console.log(`  ${i}/${subset.length} (err:${err})`);
      try {
        // obtener dlink en lotes para no rate-limit
        let dlink = null;
        const meta = await tb.getFileMeta([a.path]);
        const infoList = (meta && meta.info) || (meta && meta.list) || (Array.isArray(meta) ? meta : []);
        const match = infoList.find((f) => f.path === a.path || (f.server_filename && a.path.endsWith(f.server_filename)));
        if (match && match.dlink) dlink = match.dlink;
        if (!dlink) { results.push({ path: a.path, err: 'no dlink' }); err++; continue; }

        // descargar solo los primeros 1MB con Range
        const headPath = TMP + '\\head.avi';
        const res = await fetch(dlink, { headers: { 'Range': 'bytes=0-1048575', 'User-Agent': 'Mozilla/5.0' } });
        const buf = Buffer.from(await res.arrayBuffer());
        fs.writeFileSync(headPath, buf);

        // analizar con ffmpeg
        const out = execFileSync(FFMPEG, ['-hide_banner', '-i', headPath], { encoding: 'utf8', stdio: ['ignore', 'ignore', 'pipe'] });
        const info = out + '';
        const vMatch = info.match(/Video:\s*([^,]+),.*?(\d{2,4})x(\d{2,4}).*?(\d+)\s*kb\/s/);
        const aMatch = info.match(/Audio:\s*([^,]+),/);
        const vcodec = vMatch ? vMatch[1].trim() : '?';
        const w = vMatch ? vMatch[2] : '?';
        const h = vMatch ? vMatch[3] : '?';
        const vbit = vMatch ? parseInt(vMatch[4]) : 0;
        const acodec = aMatch ? aMatch[1].trim() : '?';

        // clasificar
        let action = 'remux'; // por defecto solo envolver a MKV
        const vc = vcodec.toLowerCase();
        if (vc.includes('mpeg2video') || vc.includes('mpeg2')) action = 'recodificar'; // MPEG2 = mucho que ganar
        else if (vc.includes('mpeg4') && (vbit > 1500 || (w >= 1280 && h >= 720 && vbit > 1200))) action = 'recodificar'; // Xvid inflado
        else if (vc.includes('h264') && vbit > 2500) action = 'recodificar';

        results.push({ path: a.path, vcodec, res: w + 'x' + h, vbit, acodec, action, size: a.size });
      } catch (e) {
        results.push({ path: a.path, err: e.message ? e.message.slice(0, 60) : 'err' });
        err++;
      }
      await new Promise((r) => setTimeout(r, 120));
    }

    fs.writeFileSync('avi_analysis.json', JSON.stringify(results, null, 2));
    console.log('=== RESUMEN ===');
    const byAction = {};
    const byCodec = {};
    for (const r of results) {
      if (r.err) { byAction['error'] = (byAction['error'] || 0) + 1; continue; }
      byAction[r.action] = (byAction[r.action] || 0) + 1;
      byCodec[r.vcodec] = (byCodec[r.vcodec] || 0) + 1;
    }
    console.log('Por accion:', JSON.stringify(byAction));
    console.log('Por codec:', JSON.stringify(byCodec, null, 1));
    console.log('Guardado en avi_analysis.json');
  } catch (e) {
    console.error('FATAL', e.message);
  }
})();
