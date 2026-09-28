const { TeraBoxApp } = require('terabox-api');
const fs = require('fs');
(async () => {
  const tb = new TeraBoxApp(fs.readFileSync('token.txt','utf-8').trim());
  await tb.updateAppData();
  const r = await tb.getRemoteDir('/', 1);
  const dirs = (r.list || []).filter(i => i.isdir).map(i => i.server_filename);
  console.log('Carpetas raiz (' + dirs.length + '):');
  console.log(dirs.join('\n'));
})();
