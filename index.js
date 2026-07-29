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
  return name.replace(/\[[^\]]*\]\s*/g, '').replace(/\.[^/.]+$/, '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
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
  return /^(T\d+|s\d+|Season\s*\d+|Temporada\s*\d+|Especiales?|Pelis|Extras|Ovas|MP3|Promociones|Reportajes|dibus|no dibus|adultos|no adultos|chorris|no chorris|eplis|Cortos|Pilotos|QVMT\s+Temporada\s*\d+|T\d+\s+Final\s+Act)$/i.test(name);
}

function normalizeTitle(title) {
  return title
    .replace(/ª/g, 'n')
    .replace(/\([^\)]*\)/g, '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/-\s*(?:BD|WEB|DVD|TV|1080p|720p|480p|BDRip|DVDRip|HDTV|Remux|HEVC|x264|x265|HDRip|WEBRip|AAC|AC3|DTS|Cast(?:ellano)?|Jap(?:on[eé]s?)?|Sub(?:s)?)\s*/gi, '')
    .replace(/\s*\(Netflix\)\s*/gi, '')
    .replace(/[:：]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const TITLE_ALIASES = {
  // Ghibli & anime pelis
  'El viaje de Chihiro': 'Spirited Away',
  'Mi vecino Totoro': 'My Neighbor Totoro',
  'La princesa Mononoke': 'Princess Mononoke',
  'La Tumba de las Luciérnagas': 'Grave of the Fireflies',
  'El Castillo en el aire - La leyenda de Laputa': 'Castle in the Sky',
  'El Infierno de Dante': 'Dante\'s Inferno',
  'La chica que saltaba através del tiempo': 'The Girl Who Leapt Through Time',
  'Puedo escuchar el mar': 'I Can Hear the Sea',
  'Viaje a Agartha': 'Journey to Agartha',
  'Hadashi no Gen 1&2 (Barefoot Gen)': 'Barefoot Gen',
  'Vampire Hunter + Bloodlust': 'Vampire Hunter D Bloodlust',
  'Cuentos de Terramar': 'Tales from Earthsea',
  'Ovelord Ovas + special': 'Overlord',
  'Astérix y Obélix La batalla de los jefes': 'Asterix: The Big Fight',
  'Aggresive Retsuko': 'Aggretsuko',
  'La leyenda de Korra': 'The Legend of Korra',
  'Sand Lands': 'Sand Land',
  'Mononoke Karakasa & Shou - Hinezumi': 'Mononoke',
  'Death Note Rewrite': 'Death Note',
  'Tenrou Sirius the Jaeger': 'Sirius the Jaeger',
  'Forky Ask a Question': 'Forky Asks a Question',
  'Ren y Stimpy': 'The Ren & Stimpy Show',
  'Patoaventuras': 'DuckTales',
  'El Laboratorio de Dexter': 'Dexter\'s Laboratory',
  'Los Simpsons': 'The Simpsons',
  'Codigo KND': 'Codename: Kids Next Door',
  'Capitan N el amo del videojuego': 'Captain N',
  'Capitán Cavernícola': 'Captain Caveman',
  'Pepe Potamo': 'Pepe Potamo',
  'Maguila Gorila': 'Magilla Gorila',
  'La Aldea del arce': 'Maison Ikkoku',
  'La Tropa Goofy': 'Goof Troop',
  'La Leyenda de Zelda': 'The Legend of Zelda',
  'Las Aventuras de Tintin': 'The Adventures of Tintin',
  'Soy Comadreja': 'I Am Weasel',
  'Oggy y las cucarachas': 'Oggy and the Cockroaches',
  'Brandy y Mr Whiskers': 'Brandy & Mr. Whiskers',
  'Osos Revoltosos': 'We Bare Bears',
  'Rocky y Bullwinkle': 'The Adventures of Rocky and Bullwinkle',
  'La Pajareria de Transilvania': 'Count Duckula',
  'Figaro y Cleo': 'Figaro and Cleo',
  'Los Oblongs': 'The Oblongs',
  'Beavis and Butt-Head Remastered': 'Beavis and Butt-Head',
  'La conserje Pokémon': 'Pokémon',
  'Crónicas Pokémon': 'Pokémon',
  'Pokémon Megaevolución': 'Pokémon',
  'Pokémon Origin': 'Pokémon',
  'BeyBlade 2000': 'Beyblade',
  'BeyBlade Burst Evolution': 'Beyblade Burst',
  'BeyBlade Burst Turbo': 'Beyblade Burst',
  'Choppy y la princesa': 'Choppy and the Princess',
  'Final Fantasy V': 'Final Fantasy',
  'La brigada de los sepultureros': 'The Munsters',
  'La M palabra y Tontico': 'The Smurfs',
  'Los Terribles Gemelos Cramp': 'The Cramp Twins',
  'Jackie y Nuca': 'Jackie and Nuca',
  'Belfy Y Lillibit': 'Belfy and Lillibit',
  'Virkikis': 'Virkikis',
  'Serie Kinki': 'Serie Kinki',
  'Rertorno a Lilifor': 'Return to Lillifor',
  'Naranjito, fútbol en acción': 'Naranjito',
  'Cocodrilos al rescate': 'Rescue Crocodiles',
  'En busca de Carmen Sandiego': 'Where on Earth Is Carmen Sandiego?',
  'La Tortuga DArtagnan y Dum Dum': 'Dogtanian',
  'Teenage Mutant Ninja Tuuurtles': 'Teenage Mutant Ninja Turtles',
  'HeroesinahalfshellNANANA': 'Teenage Mutant Ninja Turtles',
  'Banner y Flappy': 'Banner and Flappy',
  'Abbot y Costello': 'Abbott and Costello',
  'Los Fruitis': 'The Fruitties',
  'Pesadillas (Goosebumps) de R L Stine': 'Goosebumps',
  'La zapatero y la Princesa': 'The Thief and the Cobbler',
  'El Zapatero y la Princesa (El Ladrón de Bagdad)': 'The Thief and the Cobbler',
  'El cuentacuentos': 'The Storyteller',
  'El conde Pátula': 'Count Duckula',
  'Rafaela Y Su Loco Mundo': 'Rafaela',
  'Quentin Taran tantarantino': 'Quentin Tarantino',
  'QVMT': 'Qué vida más triste',
  'QVMT TEMPORADA 0': 'Qué vida más triste',
  'QVMT TEMPORADA 1': 'Qué vida más triste',
  'QVMT TEMPORADA 2': 'Qué vida más triste',
  'QVMT TEMPORADA 3': 'Qué vida más triste',
  'QVMT TEMPORADA 4': 'Qué vida más triste',
  'QVMT TEMPORADA 5': 'Qué vida más triste',
  'QVMT TEMPORADA 6': 'Qué vida más triste',
  'QVMT TEMPORADA 7': 'Qué vida más triste',
  'Off the air': 'Off the Air',
  'Peep show': 'Peep Show',
  'Robot chicken': 'Robot Chicken',
  'Trailer Park Boys': 'Trailer Park Boys',
  'Problem Solverz': 'The Problem Solverz',
  'Superjail': 'Superjail!',
  'Triptank': 'Triptank',
  'Archer': 'Archer',
  'Monty Python Flying Circus': 'Monty Python\'s Flying Circus',

  // === FIXES y nuevos aliases ===
  'De yakuza a amo de casa': 'The Way of the Househusband',
  'El inspector Gadget': 'Inspector Gadget (1983)',
  'La Familia Addams': 'The Addams Family (1992)',
  'Flint y los viajeros del tiempo': 'Flint the Time Detective',
  'Chicho Terremoto': 'Chicho Terremoto',
  'Historias de fútbol': 'Historias de fútbol',
  'Super Mario Wolrd': 'Super Mario World',
  'Super Mario World': 'Super Mario World',
  'Bumpy el travieso': 'Bumpy',
  'Campeones hacia el mundial': 'Captain Tsubasa',
  'Campeones': 'Captain Tsubasa',
  'DBZKai': 'Dragon Ball Z Kai',
  'Jeff y unos aliens': 'Jeff & Some Aliens',
  'Mr Pickles': 'Mr. Pickles',
  'Rick y Morty': 'Rick and Morty',
  'Beetlejuice la serie de dibujos': 'Beetlejuice: The Animated Series',
  'Daniel el travieso': 'Dennis the Menace',
  'La banda del patio': 'Recess',
  'Las aventuras de Super Mario Bros 3': 'Super Mario Bros. 3',
  'Los Snorkels': 'Snorks',
  'Mozart': 'Viva la banda de Mozart',
  'Sonic': 'Adventures of Sonic the Hedgehog',
};

const CUSTOM_POSTERS = {
  'Basket Fever': 'https://mediaproxy.tvtropes.org/width/1200/https://static.tvtropes.org/pmwiki/pub/images/basket_fever_1.jpg',
  'Campeones': 'https://peliculas.lavanguardia.com/imagenes/w500/pIvSw3qRmGLsQ63X38xf6ol1ND7.jpg',
  'Daniel el travieso': 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTgTG2Ir-NbUHx4UmAuC259cofDkST2kYAqwxpLx211PNyqvjvE3VBsn2Q&s=10',
  'La banda del patio': 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRhcAqXu5tG_xOfUFm5OYlogECZNAiSQCjkx1aqRXJYYQ&s=10',
  'Los Fruitis': 'https://static.filmin.es/images/es/media/33551/1/poster_0_3.jpg',
  'Los Trotamusicos': 'https://pics.filmaffinity.com/los_trotamusicos_aka_los_4_musicos_de_bremen_tv_series-362874770-large.jpg',
  'Mortadelo y Filemón': 'https://www.tebeosfera.com/T3content/img/T3_audiovisuales/g/e/mortadelo_y_filem_n_serie_de_tv-965756502-large.jpg',
  'Nicolás': 'https://m.media-amazon.com/images/M/MV5BNmZkNzMzNzUtYzhlZi00NWM4LWFjNzItZmRlYTY3YWY2NTA4XkEyXkFqcGc@._V1_.jpg',
  'Sylvan': 'https://static.wikia.nocookie.net/doblaje-fanon/images/f/f9/Sylvan_poster.jpg/revision/latest?cb=20240308011600&path-prefix=es',
  'Isidoro': 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSVJk_mc_PLaBBdioLSAbP8J6eAwwZf8ZfzLgAnZ6emQmGqHppxPJ4JbbEz&s=10',
  'Rick y Morty': 'https://i.pinimg.com/originals/54/23/1f/54231fca60088a21f40581ace92e6941.jpg',
  'Pokemon': 'https://pics.filmaffinity.com/pokemon-328038148-large.jpg',
  'Pokémon': 'https://pics.filmaffinity.com/pokemon-328038148-large.jpg',
  'Los Snorkels': 'https://image.tmdb.org/t/p/original/y3wesB2INohfa3lPRWaLWiL98ac.jpg',
  'Chicho Terremoto': 'https://www.ecartelera.com/carteles-series/1400/1452/001.jpg',
  'Cocodrilos al rescate': 'https://m.media-amazon.com/images/M/MV5BNzgyZmI3OTItMDM4OS00YjY4LWIyMTgtYzNlNDJiZTU4NWI4XkEyXkFqcGc@._V1_FMjpg_UX1000_.jpg',
  'Cosas de locos': 'https://m.media-amazon.com/images/I/912sd0EJQlL._SL1500_.jpg',
  'Cosas de locos!': 'https://m.media-amazon.com/images/I/912sd0EJQlL._SL1500_.jpg',
  'Las aventuras de Super Mario Bros 3': 'https://m.media-amazon.com/images/M/MV5BOGJlZTI4NjUtYzJhZi00M2FkLWI2ZmYtOGZmZTFkNDIxOTJhXkEyXkFqcGc@._V1_.jpg',
  'Los intocables de Elliot Mouse': 'https://static.wikia.nocookie.net/doblaje/images/8/85/LosintocablesElliotMouse_poster.jpg/revision/latest?cb=20210808012943&path-prefix=es',
  'Super Mario World': 'https://m.media-amazon.com/images/M/MV5BYTZkZmEyNGItZDY0ZS00ZDYwLThiYTEtZjYzMzgzOTk0ZDI3XkEyXkFqcGc@._V1_.jpg',
  'Beetlejuice la serie de dibujos': 'https://i.pinimg.com/736x/02/15/bb/0215bb4aa03134dbd79aff1026369d99.jpg',
  'Bumpy': 'https://m.media-amazon.com/images/I/51XAX6QBBFL.jpg',
  'Bumpy el travieso': 'https://m.media-amazon.com/images/I/51XAX6QBBFL.jpg',
  'El inspector Gadget': 'https://i.pinimg.com/736x/71/89/85/718985e89724df5035637f4a7b348084.jpg',
  'Historias de fútbol': 'https://pics.filmaffinity.com/historias_del_futbol_tv_series-813297650-large.jpg',
  'La familia addams': 'https://pics.filmaffinity.com/La_familia_Addams_Serie_de_TV-758403976-large.jpg',
  'La Familia Addams': 'https://pics.filmaffinity.com/La_familia_Addams_Serie_de_TV-758403976-large.jpg',
  'La pajareria de transilvania': 'https://i.ebayimg.com/images/g/cVEAAOSwfaJlTPrk/s-l1200.jpg',
  'La Pajareria de Transilvania': 'https://i.ebayimg.com/images/g/cVEAAOSwfaJlTPrk/s-l1200.jpg',
  'Mozart': 'https://static.fnac-static.com/multimedia/Images/ES/NR/2c/52/0d/873004/1507-1/tsp20151201172434/Viva-la-banda-de-Mozart.jpg',
  'Sonic': 'https://peliculas.lavanguardia.com/imagenes/w500/z24YFviGeEGUgOw4TytKuC4izVM.jpg',
  'Teenage Mutant Ninja Tuuurtles': 'https://moztros.com/wp-content/uploads/2026/01/A_Tapa_TMNT-Animadas_2_COV.jpg',
  'Teenage Mutant Ninja Turtles': 'https://moztros.com/wp-content/uploads/2026/01/A_Tapa_TMNT-Animadas_2_COV.jpg',
  'Dragon ball trilogia + eplis': 'https://i.pinimg.com/736x/20/24/0c/20240c5619f15bce636bfe3c90a4d06d.jpg',
};

function generateSearchVariants(title) {
  const normalized = normalizeTitle(title);
  const variants = [];

  if (TITLE_ALIASES[normalized]) {
    variants.push(TITLE_ALIASES[normalized]);
  }

  variants.push(normalized);

  const jpMatch = normalized.match(/^(.*?)\s+[\u3040-\u9FFF]+/);
  if (jpMatch && jpMatch[1].trim().length > 2) {
    const jpClean = jpMatch[1].trim();
    variants.push(jpClean);
    if (TITLE_ALIASES[jpClean]) variants.push(TITLE_ALIASES[jpClean]);
  }

  const dashSplit = normalized.split(/\s*[-–—]\s*/);
  if (dashSplit.length >= 2 && dashSplit[0].trim().length > 2) {
    variants.push(dashSplit[0].trim());
  }

  const plusSplit = normalized.split(/\s*\+\s*/);
  if (plusSplit.length >= 2 && plusSplit[0].trim().length > 2) {
    variants.push(plusSplit[0].trim());
  }

  const cleaned = normalized
    .replace(/[™©®]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (cleaned !== normalized && cleaned.length > 2) {
    variants.push(cleaned);
  }

  const noArticles = normalized.replace(/^(?:El|La|Los|Las|Un|Una|Le|Les|The|A|An)\s+/i, '').trim();
  if (noArticles !== normalized && noArticles.length > 2) {
    variants.push(noArticles);
    if (TITLE_ALIASES[noArticles]) variants.push(TITLE_ALIASES[noArticles]);
  }

  return [...new Set(variants)];
}

function omdbSearchSingle(title, apiKey) {
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

async function omdbSearch(title, apiKey) {
  const variants = generateSearchVariants(title);
  for (const variant of variants) {
    const poster = await omdbSearchSingle(variant, apiKey);
    if (poster) return poster;
    await sleep(OMD_DELAY_MS);
  }
  return null;
}

async function fetchPosters(groups, apiKey) {
  const cache = loadPosterCache();
  const posters = {};
  let fetched = 0;
  let cached = 0;
  let missed = 0;

  for (const group of groups) {
    if (CUSTOM_POSTERS[group]) {
      posters[group] = CUSTOM_POSTERS[group];
      cache[group] = CUSTOM_POSTERS[group];
      cached++;
      continue;
    }

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
    return { group: 'Otros', searchName: 'Otros' };
  }
  const subParts = pathParts.slice(rootIndex + 1);
  const topGroup = subParts[0];

  const folderParts = subParts.slice(0, -1);
  const group = folderParts.length > 0 ? folderParts.join('/') : topGroup;

  let showName = null;
  for (let i = subParts.length - 2; i >= 1; i--) {
    const name = subParts[i];
    if (isSeasonFolder(name) || isJokeFolder(name) || isContainerFolder(name) || name === topGroup) continue;
    showName = name;
    break;
  }
  if (!showName) {
    for (let i = 1; i < subParts.length; i++) {
      const name = subParts[i];
      if (isSeasonFolder(name) || isJokeFolder(name) || isContainerFolder(name) || name === topGroup) continue;
      showName = name;
      break;
    }
  }
  if (!showName) {
    showName = folderParts.length > 0 ? folderParts[folderParts.length - 1] : topGroup;
  }

  showName = cleanName(showName).replace(/\./g, ' ');

  return { group, searchName: showName };
}

function generateJSON(files, rootFolder, posters) {
  const now = new Date();
  const day = String(now.getUTCDate()).padStart(2, '0');
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const year = now.getUTCFullYear();
  const dateStr = `${day}-${month}-${year}`;

  const ICON_URL = 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/detective_worried_street.png';
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
    const { group, searchName } = getGroupFromPath(file.path, rootFolder);
    if (!groupsMap[group]) {
      const groupImg = posters && posters[searchName] ? posters[searchName] : null;
      groupsMap[group] = { name: group, image: groupImg, info: '', stations: [] };
    }
    const poster = posters && posters[searchName] ? posters[searchName] : ICON_URL;
    groupsMap[group].stations.push({
      name: file.cleanName,
      image: poster,
      url: file.dlink
    });
  }

  const groups = Object.values(groupsMap).sort((a, b) => a.name.localeCompare(b.name, 'es'));

  const hours = String(now.getUTCHours()).padStart(2, '0');
  const minutes = String(now.getUTCMinutes()).padStart(2, '0');
  const dateTimeStr = `${day}-${month}-${year} ${hours}:${minutes}`;

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

  let posters = {};
  const omdbKey = process.env.OMDB_API_KEY || config.omdbApiKey;
  if (omdbKey) {
    const uniqueGroups = [...new Set(filesWithLinks.map(f => {
      const { searchName } = getGroupFromPath(f.path, rootFolder);
      return searchName;
    }).filter(name => name && name !== 'Otros' && !isGenericFolderName(name)))];
    console.log(`\nBuscando portadas OMDb para ${uniqueGroups.length} grupos...`);
    posters = await fetchPosters(uniqueGroups, omdbKey);
    console.log('');
  } else {
    console.log('No hay API key de OMDb. Se genera M3U sin portadas.\n');
  }

  console.log('Generando lista JSON...');
  const jsonContent = generateJSON(filesWithLinks, rootFolder, posters);
  
  const outputPath = process.env.GITHUB_ACTIONS 
    ? path.join(process.env.GITHUB_WORKSPACE || '.', 'lista.m3u')
    : path.join(__dirname, 'lista.m3u');
  
  fs.writeFileSync(outputPath, JSON.stringify(jsonContent, null, 2), 'utf-8');
  console.log(`Lista guardada en: ${outputPath}`);
  console.log(`Total de entradas: ${filesWithLinks.length}`);
  console.log('\n¡Completado!');
}

main().catch(error => {
  const msg = error.message || String(error);
  writeErrorLog(msg);
  console.error('Error fatal:', msg);
  process.exit(1);
});
