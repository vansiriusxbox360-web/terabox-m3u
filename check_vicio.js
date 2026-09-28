const { TeraBoxApp } = require('terabox-api');
const fs = require('fs');
(async () => {
  const tb = new TeraBoxApp(fs.readFileSync('token.txt','utf-8').trim());
  await tb.updateAppData();
  const quota = await tb.getQuota();
  console.log('QUOTA:', JSON.stringify(quota));
  // listar carpeta vicio
  try {
    const list = await tb.list('vicio', 1000, 1, 'name', 1);
    console.log('VICIO files:', JSON.stringify(list).slice(0, 3000));
  } catch (e) { console.log('list vicio err:', e.message); }
})();
