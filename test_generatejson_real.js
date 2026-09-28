const fs = require('fs');
const Module = require('module');
const path = require('path');

const filepath = path.join(__dirname, 'index.js');
let src = fs.readFileSync(filepath, 'utf8');

// Exportar generateJSON temporalmente inyectando una linea al final
src += '\n;module.exports.__test_generateJSON = generateJSON;';

const m = new Module('index-test');
m.filename = filepath;
m.paths = Module._nodeModulePaths(__dirname);
m._compile(src, filepath);

const generateJSON = m.exports.__test_generateJSON;
console.log('generateJSON accesible:', typeof generateJSON);

// Reconstruir files desde el m3u actual
const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'lista.m3u'), 'utf8'));
const rootFolder = 'Las cositas';

const files = [];
for (const g of data.groups) {
  for (const s of g.stations) {
    files.push({
      path: s.path,
      cleanName: s.name,
      dlink: s.url,
      fsId: s.fs_id,
      isGame: !!s.isGame,
    });
  }
}
console.log('files reconstruidos:', files.length);

const result = generateJSON(files, rootFolder, {}, {}, {});
console.log('generateJSON ejecutado OK');
console.log('grupos generados:', result.groups.length);
let totalStations = 0;
for (const g of result.groups) totalStations += g.stations.length;
console.log('stations totales:', totalStations);

const jsonStr = JSON.stringify(result);
console.log('JSON stringify OK, bytes:', Buffer.byteLength(jsonStr));

// Spot-checks
const checks = [
  ['Spider-Man imagen CUSTOM_POSTERS', result.groups.some(g => /spider-man/i.test(g.name) && /spiderman_serie_animada/.test(g.image || ''))],
  ['Que Bello Es Sobrevivir', result.groups.some(g => /sobrevivir/i.test(g.name) && /que_bello_es_sobrevivir/.test(g.image || ''))],
  ['Juego de Tronos PATH_POSTER_SUFFIXES', result.groups.some(g => /juego de tronos\/t1/i.test(g.name) && /juego_de_tronos/.test(g.image || ''))],
];
console.log('\n=== SPOT CHECKS ===');
let ok = true;
for (const [name, v] of checks) { console.log(`  ${v ? 'PASS' : 'FAIL'} | ${name}`); if (!v) ok = false; }
console.log(ok ? '\nTODO OK' : '\nHAY FALLOS');
process.exit(ok ? 0 : 1);