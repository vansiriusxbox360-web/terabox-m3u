const { TeraBoxApp } = require('terabox-api');
const fs = require('fs');
(async () => {
  const tb = new TeraBoxApp(fs.readFileSync('token.txt','utf-8').trim());
  await tb.updateAppData();
  try {
    const r = await tb.getRemoteDir('/vicio', 1);
    console.log('VICIO via getRemoteDir:');
    console.log((r.list || []).map(i => (i.isdir ? '[D] ' : '    ') + i.server_filename).join('\n') || '(vacio)');
  } catch (e) { console.log('err:', e.message); }
})();
