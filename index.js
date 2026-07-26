const fs = require('fs');
const path = require('path');
const https = require('https');
const { TeraBoxApp } = require('terabox-api');

const VIDEO_EXTENSIONS = ['.mp4', '.mkv', '.avi', '.wmv', '.flv', '.mov', '.m4v', '.mpg', '.mpeg', '.3gp', '.webm'];
const DELAY_MS = 300;
const OMD_DELAY_MS = 250;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function loadConfig() {
  if (process.env.TERABOX_NDUS) {
    return { ndus: process.env.TERABOX_NDUS };
  }
  if (process.env.TERABOX_EMAIL && process.env.TERABOX_PASSWORD) {
    return { email: process.env.TERABOX_EMAIL, password: process.env.TERABOX_PASSWORD };
  }
  const configPath = path.join(__dirname, 'config.json');
  if (!fs.existsSync(configPath)) {
    console.error('Error: config.json no encontrado. Copia config.json.example a config.json y rellena tus credenciales.');
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
}

function writeErrorLog(message) {
  try {
    const logPath = path.join(process.env.TMPDIR || '/tmp', 'terabox_error.log');
    fs.writeFileSync(logPath, message, 'utf-8');
  } catch (e) {}
}

async function authenticate(config) {
  if (config.ndus) {
    console.log('Usando token ndus...');
    const tb = new TeraBoxApp(config.ndus);
    try {
      await tb.updateAppData();
    } catch (e) {
      const msg = (e.message || '').toLowerCase();
      if (msg.includes('login') || msg.includes('425') || msg.includes('403') || msg.includes('cookie') || msg.includes('ndus') || msg.includes('error')) {
        writeErrorLog(`Token ndus invalido o caducado: ${e.message}`);
        console.error('\n🔴 ERROR: Token ndus caducado o invalido.');
        console.error('   Actualiza el token siguiendo las instrucciones en refresh-token.md\n');
        process.exit(1);
      }
      throw e;
    }
    return tb;
  }

  if (config.email && config.password) {
    console.log(`Iniciando sesion con ${config.email}...`);
    const tb1 = new TeraBoxApp('');
    
    console.log('  Pre-login...');
    const preLogin = await tb1.passportPreLogin(config.email);
    console.log('  Pre-login response:', JSON.stringify(preLogin));
    
    console.log('  Obteniendo clave publica...');
    const pubKey = await tb1.getPublicKey();
    console.log('  Public key:', pubKey ? 'obtenida' : 'no disponible');
    
    console.log('  Autenticando...');
    const loginResult = await tb1.passportLogin(preLogin, config.email, config.password);
    console.log('  Login response:', JSON.stringify(loginResult));
    
    if (loginResult.code !== 0) {
      writeErrorLog(`Login fallido: ${loginResult.code} - ${loginResult.message}`);
      throw new Error(`Login fallido (code: ${loginResult.code}): ${loginResult.message || JSON.stringify(loginResult)}`);
    }
    
    const ndus = loginResult.data.ndus;
    console.log('  Login exitoso, configurando sesion...');
    
    const tb2 = new TeraBoxApp(ndus);
    await tb2.updateAppData();
    
    console.log(`\n  Guarda este ndus en config.json para futuras ejecuciones:`);
    console.log(`  "${ndus}"`);
    
    return tb2;
  }

  throw new Error('No hay credenciales. Configura ndus o email/password en config.json');
}

function isVideoFile(filename) {
  const ext = path.extname(filename).toLowerCase();
  return VIDEO_EXTENSIONS.includes(ext);
}

function cleanName(name) {
  return name.replace(/\.[^/.]+$/, '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
}

function loadPosterCache() {
  const cachePath = path.join(__dirname, 'posters-cache.json');
  try {
    if (fs.existsSync(cachePath)) {
      return JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
    }
  } catch (e) {}
  return {};
}

function savePosterCache(cache) {
  const cachePath = path.join(__dirname, 'posters-cache.json');
  fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2), 'utf-8');
}

function isGenericFolderName(name) {
  return /^(T\d+|s\d+|Season\s*\d+|Temporada\s*\d+|Especiales?|Pelis|Extras|Ovas|MP3|Promociones|Reportajes|dibus|no dibus|adultos|no adultos)$/i.test(name);
}

function omdbSearch(title, apiKey) {
  return new Promise((resolve) => {
    const url = `https://www.omdbapi.com/?t=${encodeURIComponent(title)}&apikey=${apiKey}`;
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.Response === 'True' && json.Poster && json.Poster !== 'N/A') {
            resolve(json.Poster);
          } else {
            resolve(null);
          }
        } catch (e) {
          resolve(null);
        }
      });
    }).on('error', () => resolve(null));
  });
}

async function fetchPosters(groups, apiKey) {
  const cache = loadPosterCache();
  const posters = {};
  let fetched = 0;
  let cached = 0;
  let missed = 0;

  for (const group of groups) {
    if (cache[group]) {
      posters[group] = cache[group];
      cached++;
      continue;
    }

    const poster = await omdbSearch(group, apiKey);
    await sleep(OMD_DELAY_MS);

    if (poster) {
      posters[group] = poster;
      cache[group] = poster;
      fetched++;
      if ((fetched + cached) % 10 === 0) {
        console.log(`  Portadas: ${fetched + cached}/${groups.length} (fetch: ${fetched}, cache: ${cached})`);
      }
    } else {
      posters[group] = null;
      missed++;
    }
  }

  savePosterCache(cache);
  console.log(`  Portadas obtenidas: ${fetched + cached}/${groups.length} (fetch: ${fetched}, cache: ${cached}, sin resultado: ${missed})`);
  return posters;
}

async function listDirectory(tb, dirPath, page = 1) {
  try {
    const result = await tb.getRemoteDir(dirPath, page);
    await sleep(DELAY_MS);
    return result;
  } catch (error) {
    console.error(`Error listing ${dirPath} page ${page}:`, error.message);
    return null;
  }
}

async function scanRecursive(tb, dirPath, allFiles = [], depth = 0) {
  const indent = '  '.repeat(depth);
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const result = await listDirectory(tb, dirPath, page);
    
    if (!result || !result.list || result.list.length === 0) {
      hasMore = false;
      break;
    }

    const folders = [];
    const files = [];
    for (const item of result.list) {
      if (item.isdir === '1' || item.isdir === 1) {
        folders.push(item);
      } else if (isVideoFile(item.server_filename)) {
        files.push(item);
      }
    }

    folders.sort((a, b) => a.server_filename.localeCompare(b.server_filename, 'es', { numeric: true }));
    files.sort((a, b) => a.server_filename.localeCompare(b.server_filename, 'es', { numeric: true }));

    for (const item of folders) {
      console.log(`${indent}📁 ${item.server_filename}`);
      await scanRecursive(tb, item.path, allFiles, depth + 1);
    }

    for (const item of files) {
      allFiles.push({
        path: item.path,
        name: item.server_filename,
        cleanName: cleanName(item.server_filename),
        size: item.size,
        fsId: item.fs_id
      });
    }

    const count = parseInt(result.list_count || result.list.length);
    if (count >= 200) {
      page++;
    } else {
      hasMore = false;
    }
  }

  return allFiles;
}

async function getDownloadLinks(tb, files) {
  const results = [];
  const BATCH_SIZE = 10;
  let debugShown = false;
  
  const batches = [];
  for (let i = 0; i < files.length; i += BATCH_SIZE) {
    batches.push(files.slice(i, i + BATCH_SIZE));
  }
  
  for (let b = 0; b < batches.length; b++) {
    const batch = batches[b];
    const paths = batch.map(f => f.path);
    
    if ((b + 1) % 25 === 0 || b === 0) {
      console.log(`  Lote ${b + 1}/${batches.length} | Enlaces: ${results.length}/${files.length}`);
    }
    
    try {
      const meta = await tb.getFileMeta(paths);
      await sleep(300);
      
      if (!debugShown && meta) {
        console.log('  [DEBUG] Estructura:', JSON.stringify(meta).substring(0, 200));
        debugShown = true;
      }
      
      const infoList = (meta && meta.info) || (meta && meta.list) || (Array.isArray(meta) ? meta : []);
      
      const matched = new Set();
      for (const file of batch) {
        const match = infoList.find(f => f.path === file.path || f.server_filename === file.name);
        if (match && match.dlink) {
          results.push({ ...file, dlink: match.dlink });
          matched.add(file.path);
        }
      }
      
      const missing = batch.filter(f => !matched.has(f.path));
      if (missing.length > 0 && missing.length <= 3) {
        for (const file of missing) {
          try {
            const single = await tb.getFileMeta([file.path]);
            await sleep(300);
            const singleInfo = (single && single.info) || (single && single.list) || [];
            if (singleInfo.length > 0 && singleInfo[0].dlink) {
              results.push({ ...file, dlink: singleInfo[0].dlink });
            }
          } catch (e) {}
        }
      }
      
    } catch (error) {
      if (b < 3 || b % 100 === 0) {
        console.log(`  ❌ Error lote ${b + 1}: ${error.message}`);
      }
    }
  }
  
  return results;
}

function getGroupFromPath(filePath, rootFolder) {
  const pathParts = filePath.split('/').filter(p => p);
  const rootIndex = pathParts.indexOf(rootFolder);
  if (rootIndex === -1 || rootIndex + 1 >= pathParts.length) {
    return { group: 'Otros', searchName: 'Otros' };
  }
  const subParts = pathParts.slice(rootIndex + 1);
  const limitedParts = subParts.slice(0, 3);
  const searchName = subParts[subParts.length - 1];
  const group = limitedParts.join('/');
  return { group, searchName };
}

function generateM3U(files, rootFolder, posters) {
  const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
  let m3u = '#EXTM3U\n';
  m3u += `#PLAYLIST:La colección de VanSirius\n`;
  m3u += `#EXTINF:-1 tvg-logo="https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/icon.svg" group-title="",La colección de VanSirius - Actualizado: ${now}\n`;
  m3u += `https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/icon.svg\n`;
  
  for (const file of files) {
    const { group, searchName } = getGroupFromPath(file.path, rootFolder);
    
    const displayName = file.cleanName;
    const poster = posters && posters[searchName];

    if (poster) {
      m3u += `#EXTINF:-1 tvg-logo="${poster}" group-title="${group}",${displayName}\n`;
    } else {
      m3u += `#EXTINF:-1 group-title="${group}",${displayName}\n`;
    }
    m3u += `${file.dlink}\n`;
  }

  return m3u;
}

async function main() {
  console.log('=== Generador de M3U desde Terabox ===\n');
  
  const config = loadConfig();
  
  console.log('Conectando con Terabox...');
  const tb = await authenticate(config);
  
  const status = await tb.checkLogin();
  if (!status || status.errno !== 0) {
    writeErrorLog(`Sesion no valida: ${JSON.stringify(status)}`);
    console.error('🔴 ERROR: Sesion no valida. Token caducado o invalido.');
    console.error('   Actualiza el token siguiendo refresh-token.md\n');
    process.exit(1);
  }
  console.log('Sesion iniciada correctamente.\n');

  console.log('Escaneando directorios...');
  console.log('(Esto puede tardar varios minutos)\n');
  
  const rootFolder = config.rootFolder || 'Las cositas';
  
  console.log(`Buscando carpeta "${rootFolder}" en la raiz...`);
  const rootListing = await tb.getRemoteDir('/');
  
  if (rootListing && rootListing.list) {
    console.log('Carpetas en la raiz:');
    for (const item of rootListing.list) {
      if (item.isdir === '1' || item.isdir === 1) {
        console.log(`  📁 ${item.server_filename} → ${item.path}`);
      }
    }
  }
  
  console.log(`\nBuscando "${rootFolder}" recursivamente...`);
  
  async function findFolder(tb, dirPath, targetName, depth = 0) {
    if (depth > 30) return null;
    const indent = '  '.repeat(depth);
    let page = 1;
    let hasMore = true;
    
    while (hasMore) {
      const result = await tb.getRemoteDir(dirPath, page);
      if (!result || !result.list || result.list.length === 0) break;
      
      for (const item of result.list) {
        if ((item.isdir === '1' || item.isdir === 1)) {
          if (item.server_filename === targetName) {
            console.log(`${indent}✅ Encontrado: ${item.path}`);
            return item.path;
          }
          console.log(`${indent}📁 ${item.server_filename}`);
          const found = await findFolder(tb, item.path, targetName, depth + 1);
          if (found) return found;
        }
      }
      
      hasMore = result.list.length >= 200;
      page++;
    }
    return null;
  }
  
  const rootDir = await findFolder(tb, '/', rootFolder);
  
  if (!rootDir) {
    console.error(`Error: No se encontro la carpeta "${rootFolder}"`);
    process.exit(1);
  }
  
  console.log(`\nCarpeta raiz encontrada: ${rootDir}\n`);
  
  const allFiles = await scanRecursive(tb, rootDir);
  console.log(`\nTotal de archivos de video encontrados: ${allFiles.length}\n`);

  if (allFiles.length === 0) {
    console.log('No se encontraron archivos de video.');
    process.exit(0);
  }

  console.log('Ordenando archivos...');
  allFiles.sort((a, b) => a.cleanName.localeCompare(b.cleanName, 'es', { numeric: true }));
  console.log(`Archivos ordenados.\n`);

  console.log('Obteniendo enlaces de descarga...');
  const filesWithLinks = await getDownloadLinks(tb, allFiles);
  console.log(`Enlaces obtenidos: ${filesWithLinks.length}/${allFiles.length}\n`);

  let posters = {};
  const omdbKey = process.env.OMDB_API_KEY || config.omdbApiKey;
  if (omdbKey) {
    const uniqueGroups = [...new Set(filesWithLinks.map(f => {
      const parts = f.path.split('/').filter(p => p);
      const idx = parts.indexOf(rootFolder);
      if (idx === -1 || idx + 1 >= parts.length) return null;
      const subParts = parts.slice(idx + 1);
      return subParts[subParts.length - 1];
    }).filter(name => name && !isGenericFolderName(name)))];
    console.log(`\nBuscando portadas OMDb para ${uniqueGroups.length} grupos...`);
    posters = await fetchPosters(uniqueGroups, omdbKey);
    console.log('');
  } else {
    console.log('No hay API key de OMDb. Se genera M3U sin portadas.\n');
  }

  console.log('Generando lista M3U...');
  const m3uContent = generateM3U(filesWithLinks, rootFolder, posters);
  
  const outputPath = process.env.GITHUB_ACTIONS 
    ? path.join(process.env.GITHUB_WORKSPACE || '.', 'lista.m3u')
    : path.join(__dirname, 'lista.m3u');
  
  fs.writeFileSync(outputPath, m3uContent, 'utf-8');
  console.log(`Lista M3U guardada en: ${outputPath}`);
  console.log(`Total de entradas: ${filesWithLinks.length}`);
  console.log('\n¡Completado!');
}

main().catch(error => {
  const msg = error.message || String(error);
  writeErrorLog(msg);
  console.error('Error fatal:', msg);
  process.exit(1);
});
