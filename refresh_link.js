// refresh_link.js - Obtiene un enlace dlink fresco de Terabox para un fs_id
// Uso: node refresh_link.js <ndus> <fs_id>
// Salida: la URL dlink en stdout (solo la URL)

const { TeraBoxApp } = require('terabox-api');

const ndus = process.argv[2];
const fsId = process.argv[3];

if (!ndus || !fsId) {
    console.error('Uso: node refresh_link.js <ndus> <fs_id>');
    process.exit(1);
}

(async () => {
    const tb = new TeraBoxApp(ndus);
    await tb.updateAppData();
    const res = await tb.download([Number(fsId)]);
    let dlink = null;
    if (res && Array.isArray(res.dlink)) {
        for (const item of res.dlink) {
            if (item && item.dlink) {
                dlink = item.dlink;
                break;
            }
        }
    }
    // fallback: formato antiguo con list
    if (!dlink && res && Array.isArray(res.list)) {
        for (const item of res.list) {
            if (item && item.dlink) {
                dlink = item.dlink;
                break;
            }
        }
    }
    if (dlink) {
        console.log(dlink);
    } else {
        console.error('No se obtuvo dlink:', JSON.stringify(res).substring(0, 200));
        process.exit(1);
    }
})().catch((e) => {
    console.error('Error:', e.message || String(e));
    process.exit(1);
});
