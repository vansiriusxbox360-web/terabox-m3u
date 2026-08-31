const fs = require('fs');
const path = require('path');
const https = require('https');
const { TeraBoxApp } = require('terabox-api');
const {
  sleep,
  isVideoFile,
  cleanName,
  loadPosterCache,
  savePosterCache,
  isGenericFolderName,
  normalizeTitle,
} = require('./util.js');
const {
  RATE_LIMIT,
  WIKIDATA_FAILED,
  fetchPosters,
  fetchFilePosters,
  movieTitleCandidates,
} = require('./posters.js');
const {
  TITLE_ALIASES,
  CUSTOM_POSTERS,
  PATH_POSTER_SUFFIXES,
  FILE_TITLE_ALIASES,
  FILE_POSTER_URLS,
  CHILD_INHERIT_GROUP_ICON,
  FILE_CLEANNAME_ALIASES,
} = require('./data.js');

// Exponer constantes clave para compatibilidad con workflows externos
module.exports = module.exports || {};
module.exports.CUSTOM_POSTERS = CUSTOM_POSTERS;
module.exports.PATH_POSTER_SUFFIXES = PATH_POSTER_SUFFIXES;
module.exports.FILE_POSTER_URLS = FILE_POSTER_URLS;
module.exports.CHILD_INHERIT_GROUP_ICON = CHILD_INHERIT_GROUP_ICON;

const VIDEO_EXTENSIONS = ['.mp4', '.mkv', '.avi', '.wmv', '.flv', '.mov', '.m4v', '.mpg', '.mpeg', '.3gp', '.webm'];
const DELAY_MS = 400;

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

// Extensiones de juegos de MS-DOS (carpeta "vicio") que DOSBox externo puede abrir
const GAME_EXTENSIONS = ['.zip', '.dosz', '.exe', '.com', '.7z', '.rar'];
const GAME_ROOT_FOLDER = 'vicio';

function isGameFile(filename) {
  const ext = path.extname(filename).toLowerCase();
  return GAME_EXTENSIONS.includes(ext);
}


function groupInheritsChildIcon(group) {
  for (const name of CHILD_INHERIT_GROUP_ICON) {
    if (group === name || group.endsWith('/' + name) || group.includes(name + '/')) return true;
  }
  return false;
}




async function listDirectory(tb, dirPath, page = 1) {
  try {
    const result = await tb.getRemoteDir(dirPath, page);
    await sleep(DELAY_MS);
    if (result && result.list && result.list.length > 0) return result;
    console.warn(`  Listado vacio de ${dirPath}. Sin reintentos.`);
    return null;
  } catch (error) {
    console.error(`Error listing ${dirPath} page ${page}:`, error.message);
    await sleep(15000);
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
      if (result === null) {
        console.error(`⚠️  No se pudo listar ${dirPath} (pagina ${page}). El arbol bajo esta carpeta se omitira en este run.`);
      }
      break;
    }

    const folders = [];
    const files = [];
    const inVicio = ('/' + dirPath).toLowerCase().includes('/' + GAME_ROOT_FOLDER + '/') || dirPath.toLowerCase().endsWith('/' + GAME_ROOT_FOLDER);
    for (const item of result.list) {
      if (item.isdir === '1' || item.isdir === 1) {
        folders.push(item);
      } else if (isVideoFile(item.server_filename) || (inVicio && isGameFile(item.server_filename))) {
        files.push(item);
      }
    }

    folders.sort((a, b) => a.server_filename.localeCompare(b.server_filename, 'es', { numeric: true }));
    files.sort((a, b) => a.server_filename.localeCompare(b.server_filename, 'es', { numeric: true }));

    for (const item of folders) {
      console.log(`${indent}📁 ${item.server_filename}`);
    }

    const SCAN_CONCURRENCY = 6;
    let scanIndex = 0;
    async function scanWorker() {
      while (scanIndex < folders.length) {
        const folder = folders[scanIndex++];
        const sub = await scanRecursive(tb, folder.path, [], depth + 1);
        allFiles.push(...sub);
      }
    }
    const workers = [];
    for (let w = 0; w < Math.min(SCAN_CONCURRENCY, folders.length); w++) {
      workers.push(scanWorker());
    }
    await Promise.all(workers);

    for (const item of files) {
      allFiles.push({
        path: item.path,
        name: item.server_filename,
        cleanName: cleanName(item.server_filename),
        size: item.size,
        fsId: item.fs_id,
        isGame: inVicio && isGameFile(item.server_filename)
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
  const BATCH_SIZE = 30;
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
      await sleep(150);
      
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
            await sleep(150);
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

function extractEpisode(name) {
  let match;
  match = name.match(/[Ss](\d+)[Ee](\d+)/);
  if (match) return { season: parseInt(match[1]), episode: parseInt(match[2]) };
  match = name.match(/(\d+)[xX×](\d+)/);
  if (match) return { season: parseInt(match[1]), episode: parseInt(match[2]) };
  match = name.match(/(\d+)[\s.-]*[Ee]p(?:isodio)?[\s.-]*(\d+)/);
  if (match) return { season: 1, episode: parseInt(match[2]) };
  match = name.match(/(?:^|[^\d])(\d{1,2})[xX×](\d{1,3})(?:[^\d]|$)/);
  if (match) return { season: parseInt(match[1]), episode: parseInt(match[2]) };
  return { season: 0, episode: 0 };
}

function isSeasonFolder(name) {
  if (/^(T\d+|s\d+|Season\s*\d+|Temporada\s*\d+|\d{4})$/i.test(name)) return true;
  if (/^\d+[\s.-]+\d+/.test(name)) return true;
  if (/^Saga\s/i.test(name)) return true;
  if (/Temporada\s+\d+/i.test(name)) return true;
  if (/^\d+\.\s*\w+/.test(name)) return true;
  return false;
}

function isJokeFolder(name) {
  if (name.length > 40) return true;
  const skipWords = ['que se divide', 'merendando', 'desayunando', 'dibus puede', 'puedes hallar',
    'padawan', 'spin-off', 'pille ya mayor', 'streaming básicamente', 'cositas que se ven',
    'much marcha', 'Tele5 molaba', 'VHS', 'madre te decía', 'Digital+', 'Cartoon Network',
    'FoxKids', 'Disney Channel', 'Nickelodeon', 'sine malo', 'sine güeno',
    'encontrará de todo', 'aparte de las pelis', 'del cole', 'que no haya',
    'Formas alternativas', 'La Casa del Árbol', 'freshquishimosh', 'Castellano'];
  return skipWords.some(w => name.toLowerCase().includes(w.toLowerCase()));
}

const CONTAINER_FOLDERS = new Set([
  'dibus', 'videos', 'episodios', 'capítulos', 'capitulos', 'temporada', 'temp',
  'pelos', 'cortos', 'especiales', 'extras', 'original', 'pelis', 'pilotos',
  'promociones', 'reportajes', 'revisión 2021', 'adultos', 'chorris', 'chou y ehpesiale',
  'eplis', 'no adultos', 'no chorris', 'no dibus', 'ªnime', 'en castellano', 'en neutro',
  'monty\'s movies', 'festivales del tiri', 'festivales por capis'
]);

function isContainerFolder(name) {
  return CONTAINER_FOLDERS.has(name.toLowerCase());
}

function getGroupFromPath(filePath, rootFolder) {
  const pathParts = filePath.split('/').filter(p => p);
  const rootIndex = pathParts.indexOf(rootFolder);
  if (rootIndex === -1 || rootIndex + 1 >= pathParts.length) {
    return { group: 'Otros', searchName: 'Otros', fallbackName: null };
  }
  const subParts = pathParts.slice(rootIndex + 1);
  const topGroup = subParts[0];

  const folderParts = subParts.slice(0, -1);
  let group = folderParts.length > 0 ? folderParts.join('/') : topGroup;

  let showName = null;
  let seasonName = null;
  for (let i = subParts.length - 2; i >= 1; i--) {
    const name = subParts[i];
    if (isSeasonFolder(name)) { if (!seasonName) seasonName = name; continue; }
    if (isJokeFolder(name) || isContainerFolder(name) || name === topGroup) continue;
    showName = name;
    break;
  }
  if (!showName) {
    seasonName = null;
    for (let i = 1; i < subParts.length; i++) {
      const name = subParts[i];
      if (isSeasonFolder(name) || isJokeFolder(name) || isContainerFolder(name) || name === topGroup) continue;
      showName = name;
      break;
    }
  }
  if (!showName) {
    const fileName = subParts[subParts.length - 1];
    showName = fileName;
    group = group + '/' + cleanName(fileName).replace(/\./g, ' ');
  }

  const cleanShowName = cleanName(showName).replace(/\./g, ' ');
  let searchName = cleanShowName;
  let fallbackName = null;
  if (seasonName) {
    searchName = cleanShowName + ' ' + cleanName(seasonName).replace(/\./g, ' ');
    fallbackName = cleanShowName;
  }

  return { group, searchName, fallbackName };
}

function generateJSON(files, rootFolder, posters, filePosters, metas) {
  const now = new Date();
  const day = String(now.getUTCDate()).padStart(2, '0');
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const year = now.getUTCFullYear();
  const dateStr = `${day}-${month}-${year}`;

  const posterCache = loadPosterCache();

  const VS_ICON = 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/icon.png';
  const COLLECTION_ICON = VS_ICON;

  const BASE = 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main';
  const FOLDER_IMAGES = {
    '\u00aanime': `${BASE}/img-anime.png`,
    'Dibus que no son \u00aanime': `${BASE}/img-dibus.png`,
    'en la 2 con mucha marcha y \u1409TPH,  en la 3 Megatrix o el Club Disney en Tele5': `${BASE}/img-tele5.png`,
    'y si eras un ni\u00f1o afortunado y tus padres ten\u00edan Digital+': `${BASE}/img-digital.png`,
    '(la carpeta spin-off que no te pillaba jamando)': `${BASE}/img-spinoff.png`,
    'las que te pon\u00edas en VHS o tu madre te dec\u00eda en mis tiempos habia cosas muy bonitas': `${BASE}/img-vhs.png`,
    'Sine malo y sine g\u00fceno': `${BASE}/img-sine.png`,
  };

  const groupsMap = {};
  for (const file of files) {
    const { group, searchName, fallbackName } = getGroupFromPath(file.path, rootFolder);
    if (!groupsMap[group]) {
      let groupImg = posters && posters[searchName] ? posters[searchName] : null;
      if (!groupImg && fallbackName) groupImg = posters && posters[fallbackName] ? posters[fallbackName] : null;
      for (const [suffix, url] of Object.entries(PATH_POSTER_SUFFIXES)) {
        if (group === suffix || group.includes(suffix + '/') || group.endsWith('/' + suffix)) {
          groupImg = url;
          break;
        }
      }
      groupsMap[group] = { name: group, image: groupImg, info: '', meta: (metas && metas[searchName]) || (metas && fallbackName && metas[fallbackName]) || null, stations: [] };
    }
    let poster = posters && posters[searchName] ? posters[searchName] : null;
    if (!poster && fallbackName) poster = posters && posters[fallbackName] ? posters[fallbackName] : null;
    if (filePosters && filePosters[file.cleanName]) poster = filePosters[file.cleanName];
    if (FILE_POSTER_URLS && FILE_POSTER_URLS[file.cleanName]) poster = FILE_POSTER_URLS[file.cleanName];
    // Coincidencia por fragmento del nombre (p.ej. pelis de Martes y Trece con actores en el título)
    if (!poster && FILE_POSTER_URLS) {
      for (const [frag, url] of Object.entries(FILE_POSTER_URLS)) {
        if (frag.length > 6 && file.cleanName.includes(frag)) {
          poster = url;
          break;
        }
      }
    }
    if (!poster) {
      const cachedFilePoster = posterCache['FILE::' + file.cleanName];
      if (cachedFilePoster && cachedFilePoster !== WIKIDATA_FAILED) poster = cachedFilePoster;
    }
    if (groupInheritsChildIcon(group)) poster = groupsMap[group].image || null;
    const station = { name: file.cleanName, url: file.dlink, fs_id: file.fsId, path: file.path };
    if (file.isGame) station.isGame = true;
    if (poster && poster !== groupsMap[group].image) station.image = poster;
    groupsMap[group].stations.push(station);
  }

  const groups = Object.values(groupsMap).sort((a, b) => a.name.localeCompare(b.name, 'es'));

  const esTime = now.toLocaleString('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', hour12: false });
  const dateTimeStr = `${day}-${month}-${year} ${esTime}`;

  return {
    name: 'La colección de VanSirius',
    author: `VanSirius (Actualizada al ${dateStr})`,
    _last_updated: now.toISOString(),
    _last_updated_display: dateTimeStr,
    image: COLLECTION_ICON,
    url: 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/lista.m3u',
    groups: groups
  };
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
      await sleep(DELAY_MS);
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

  const prevListPath = process.env.GITHUB_ACTIONS
    ? path.join(process.env.GITHUB_WORKSPACE || '.', 'lista.m3u')
    : path.join(__dirname, 'lista.m3u');
  let prevStationCount = 0;
  let prevStationNames = new Set();
  try {
    if (fs.existsSync(prevListPath)) {
      const prev = JSON.parse(fs.readFileSync(prevListPath, 'utf-8'));
      prevStationCount = (prev.groups || []).reduce((sum, g) => sum + (g.stations || []).length, 0);
      for (const g of (prev.groups || [])) {
        for (const s of (g.stations || [])) {
          if (s.name) prevStationNames.add(s.name);
        }
      }
    }
  } catch (e) {
    console.warn(`No se pudo leer la lista previa: ${e.message}`);
  }
  if (prevStationCount > 0 && allFiles.length < prevStationCount * 0.6) {
    writeErrorLog(`Escaneo incompleto: ${allFiles.length} archivos vs ${prevStationCount} previos. No se sobreescribe la lista para no perder contenido.`);
    console.error(`🔴 ERROR: El escaneo encontro ${allFiles.length} archivos, pero la lista previa tiene ${prevStationCount}.`);
    console.error('   Abortando sin sobrescribir la lista (posible rate-limit de Terabox).');
    process.exit(1);
  }

  console.log('Ordenando archivos...');
  allFiles.sort((a, b) => {
    const groupA = getGroupFromPath(a.path, rootFolder);
    const groupB = getGroupFromPath(b.path, rootFolder);
    if (groupA.group !== groupB.group) return groupA.group.localeCompare(groupB.group, 'es');
    return a.path.localeCompare(b.path, 'es', { numeric: true });
  });
  console.log(`Archivos ordenados.\n`);

  console.log('Obteniendo enlaces de descarga...');
  const filesWithLinks = await getDownloadLinks(tb, allFiles);
  console.log(`Enlaces obtenidos: ${filesWithLinks.length}/${allFiles.length}\n`);

  const uniqueGroups = [...new Set(filesWithLinks.flatMap(f => {
    const { searchName, fallbackName } = getGroupFromPath(f.path, rootFolder);
    const names = [searchName];
    if (fallbackName && fallbackName !== searchName) names.push(fallbackName);
    return names;
  }).filter(name => name && name !== 'Otros' && !isGenericFolderName(name)))];

  let posters = {};
  const omdbKey = process.env.OMDB_API_KEY || config.omdbApiKey;
  const tmdbKey = process.env.TMDB_API_KEY || config.tmdbApiKey;
  if (omdbKey) {
    console.log(`\nBuscando portadas OMDb para ${uniqueGroups.length} grupos...`);
    posters = await fetchPosters(uniqueGroups, omdbKey, tmdbKey);
    console.log('');
  } else if (tmdbKey) {
    console.log(`\nSin OMDb. Buscando portadas TMDB para ${uniqueGroups.length} grupos...`);
    posters = await fetchPosters(uniqueGroups, null, tmdbKey);
    console.log('');
  } else {
    console.log('No hay API key de OMDb ni TMDB. Se generan solo portadas personalizadas.\n');
    const cache = loadPosterCache();
    for (const group of uniqueGroups) {
      if (CUSTOM_POSTERS[group]) {
        posters[group] = CUSTOM_POSTERS[group];
        cache[group] = CUSTOM_POSTERS[group];
      }
    }
    savePosterCache(cache);
  }

  console.log(`Posters personalizados aplicados: ${Object.keys(posters).filter(k => CUSTOM_POSTERS[k]).length}`);

  console.log('Buscando portadas por archivo (grupos sin portada + archivos nuevos)...');
  const filesNeedingFilePoster = filesWithLinks.filter(f => {
    const { searchName, fallbackName } = getGroupFromPath(f.path, rootFolder);
    const g = posters && posters[searchName] ? posters[searchName] : null;
    const fb = !g && fallbackName ? posters && posters[fallbackName] : null;
    const isNew = !prevStationNames.has(f.cleanName);
    // Si el grupo tiene portada pero el archivo es NUEVO, intentar su portada individual
    if ((g || fb) && !isNew) return false;
    if (!/\b(?:19|20)\d{2}\b/.test(f.cleanName)) return false;
    if (/S\d+E\d+|E\d{2,3}\b/i.test(f.cleanName)) return false;
    return true;
  });
  console.log(`Archivos que parecen películas y buscan portada individual: ${filesNeedingFilePoster.length}`);

  let filePosters = {};
  if ((omdbKey || tmdbKey) && filesNeedingFilePoster.length > 0) {
    console.log(`\nBuscando portadas por archivo para ${filesNeedingFilePoster.length} archivos...`);
    filePosters = await fetchFilePosters(filesNeedingFilePoster, omdbKey, 400, tmdbKey);
    console.log('');
  }

  console.log('Generando lista JSON...');
  const jsonContent = generateJSON(filesWithLinks, rootFolder, posters, filePosters, {});
  
  const outputPath = process.env.GITHUB_ACTIONS 
    ? path.join(process.env.GITHUB_WORKSPACE || '.', 'lista.m3u')
    : path.join(__dirname, 'lista.m3u');
  
  fs.writeFileSync(outputPath, JSON.stringify(jsonContent), 'utf-8');
  console.log(`Lista guardada en: ${outputPath}`);
  console.log(`Total de entradas: ${filesWithLinks.length}`);
  console.log('\n¡Completado!');
}

if (require.main === module) {
  main().catch(error => {
    const msg = error.message || String(error);
    writeErrorLog(msg);
    console.error('Error fatal:', msg);
    process.exit(1);
  });
}

module.exports = { normalizeTitle, movieTitleCandidates, TITLE_ALIASES, getGroupFromPath };
