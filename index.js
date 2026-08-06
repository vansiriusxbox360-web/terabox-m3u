const fs = require('fs');
const path = require('path');
const https = require('https');
const { TeraBoxApp } = require('terabox-api');

const VIDEO_EXTENSIONS = ['.mp4', '.mkv', '.avi', '.wmv', '.flv', '.mov', '.m4v', '.mpg', '.mpeg', '.3gp', '.webm'];
const DELAY_MS = 150;
const OMD_DELAY_MS = 1200;
const OMD_RETRY_WAIT_MS = 30000;
const OMD_MAX_RETRIES = 3;
const WIKIDATA_DELAY_MS = 1000;

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
  'Mononoke Movie Dai-2 Shou - Hinezumi': 'Mononoke',
  'El Castillo en el cielo - Tenku no Shiro Laputa': 'Castle in the Sky',
  'Layton Kyouju to Eien no Utahime': 'Professor Layton and the Eternal Diva',
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
  'Pepe Potamo': 'The Peter Potamus Show',
  'Chopy y la princesa': 'Choppy and the Princess',
  'Las Maravillosas Desventuras de Flapjack': 'The Marvelous Misadventures of Flapjack',
  'El rey de la colina': 'King of the Hill',
  'Ed, Edd y Eddy': 'Ed, Edd n Eddy',
  'Ed Edd y Eddy': 'Ed, Edd n Eddy',
  'Las Macabras aventuras de Billy y Mandy': 'The Grim Adventures of Billy & Mandy',
  'Las Supernenas': 'The Powerpuff Girls',
  'El Castillo en el cielo - Tenkū no Shiro Laputa': 'Laputa: Castle in the Sky',
  'Maguila Gorila': 'Magilla Gorilla',
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
  // === Alias con clave normalizada (sin paréntesis) ===
  'Agallas el perro cobarde': 'Courage the Cowardly Dog',
  'Vaca y Pollo': 'Cow and Chicken',
  'Itou Junji Collection': 'Junji Ito Collection',
  'Itou Junji Maniac': 'Junji Ito Maniac',
  'Itou Junji Tomie': 'Tomie',
  'Canuto y Canito': 'Heckle and Jeckle',
  'Abbott y Costello': 'Abbott and Costello',
  'El libro de la selva': 'The Jungle Book',
  'Pesadillas de R L Stine': 'Goosebumps',
  'Hadashi no Gen 1&2': 'Barefoot Gen',
  'El Zapatero y la Princesa': 'The Thief and the Cobbler',
  'Relatos de los hermanos Grimm': 'The Wonderful World of the Brothers Grimm',
};

const CUSTOM_POSTERS = {
  'Basket Fever': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/basket_fever.jpg',
  'Campeones': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/campeones.jpg',
  'Daniel el travieso': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/daniel_el_travieso.jpg',
  'Daniel el Travieso': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/daniel_el_travieso.jpg',
  'La banda del patio': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/la_banda_del_patio.jpg',
  'Los Fruitis': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/los_fruitis.jpg',
  'Los Trotamusicos': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/los_trotamusicos.jpg',
  'Mortadelo y Filemón': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/mortadelo_y_filem_n.jpg',
  'Nicolás': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/nicol_s.jpg',
  'Sylvan': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/sylvan.jpg',
  'Isidoro': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/isidoro.jpg',
  'Rick y Morty': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/rick_y_morty.jpg',
  'Pokemon': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/pokemon.jpg',
  'Pokémon': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/pokemon.jpg',
  'Los Snorkels': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/los_snorkels.jpg',
  'Chicho Terremoto': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/chicho_terremoto.jpg',
  'Cocodrilos al rescate': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/cocodrilos_al_rescate.jpg',
  'Cosas de locos': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/cosas_de_locos.jpg',
  'Cosas de locos!': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/cosas_de_locos.jpg',
  'Cosas de Locos!': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/cosas_de_locos.jpg',
  'Las aventuras de Super Mario Bros 3': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/las_aventuras_de_super_mario_bros_3.jpg',
  'Los intocables de Elliot Mouse': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/los_intocables_de_elliot_mouse.jpg',
  'Super Mario World': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/super_mario_world.jpg',
  'Beetlejuice la serie de dibujos': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/beetlejuice_la_serie_de_dibujos.jpg',
  'Beetlejuice': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/beetlejuice_la_serie_de_dibujos.jpg',
  'Regreso al Futuro': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/regreso_al_futuro.jpg',
  'Regreso al futuro': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/regreso_al_futuro.jpg',
  'Bumpy': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/bumpy.jpg',
  'Bumpy el travieso': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/bumpy.jpg',
  'El inspector Gadget': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/el_inspector_gadget.jpg',
  'Historias de fútbol': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/historias_de_f_tbol.jpg',
  'La familia addams': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/la_familia_addams.jpg',
  'La Familia Addams': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/la_familia_addams.jpg',
  'La pajareria de transilvania': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/la_pajareria_de_transilvania.jpg',
  'La Pajareria de Transilvania': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/la_pajareria_de_transilvania.jpg',
  'Mozart': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/mozart.jpg',
  'Sonic': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/sonic.jpg',
  'Teenage Mutant Ninja Tuuurtles': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/teenage_mutant_ninja_turtles.jpg',
  'Teenage Mutant Ninja Turtles': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/teenage_mutant_ninja_turtles.jpg',
  'Dragon ball trilogia + eplis': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/dragon_ball_trilogia___eplis.jpg',
  'Astérix y Obélix La batalla de los jefes': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/asterix_y_obelix_la_batalla_de_los_jefes.jpg',
  'De yakuza a amo de casa': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/de_yakuza_a_amo_de_casa.jpg',
  'Mr': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/mr.jpg',
  'Puedo escuchar el mar': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/puedo_escuchar_el_mar.jpg',
  'Viaje a Agartha': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/viaje_a_agartha.jpg',
  'El Castillo en el cielo - Tenku no Shiro Laputa': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/el_castillo_en_el_cielo.jpg',
  'Pet Shop of Horror': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/pet_shop_of_horror.jpg',
  'Beavis & Butt-Head': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/beavis_butt_head.jpg',
  'Beavis & Butt-Head T0': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/beavis_butt_head_t0.jpg',
  'Beavis & Butt-Head T1': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/beavis_butt_head_t1.jpg',
  'Beavis & Butt-Head T2': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/beavis_butt_head_t2.jpg',
  'Beavis & Butt-Head T3': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/beavis_butt_head_t3.jpg',
  'Beavis & Butt-Head T4': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/beavis_butt_head_t4.jpg',
  'Beavis & Butt-Head T5': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/beavis_butt_head_t5.jpg',
  'Beavis & Butt-Head T6': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/beavis_butt_head_t6.jpg',
  'Beavis & Butt-Head T7': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/beavis_butt_head_t7.jpg',
  'Beavis & Butt-Head T8': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/beavis_butt_head_t8.jpg',
  'Beavis & Butt-Head T9': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/beavis_butt_head_t9.jpg',
  'Beavis & Butt-Head T10': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/beavis_butt_head_t10.jpg',
  'Beavis & Butt-Head T11': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/beavis_butt_head_t11.jpg',
  'Dinosaurios': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/dinosaurios.jpg',
  'Pesadillas (Goosebumps) de R L Stine': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/pesadillas_goosebumps.jpg',
  'El Inquilino': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/el_inquilino.jpg',
  'Que Bello Es Sobrevivir': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/que_bello_es_sobrevivir.jpg',
  'Quien da la vez': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/quien_da_la_vez.jpg',
  'Enjuto Mojamuto': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/enjuto_mojamuto.jpg',
  'La M palabra y Tontico': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/la_m_palabra_y_tontico.jpg',
  'Rertorno a Lilifor': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/rertorno_a_lilifor.jpg',
  'Retorno a Lilifor': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/rertorno_a_lilifor.jpg',
  'Museo Coconut': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/museo_coconut.jpg',
  'Rafaela Y Su Loco Mundo': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/rafaela_y_su_loco_mundo.jpg',
  'Abbott y Costello': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/abbott_y_costello.jpg',
  'Alicia en el pais de las maravillas': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/alicia_en_el_pais_de_las_maravillas.jpg',
  'Belfy Y Lillibit': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/belfy_y_lillibit.jpg',
  'Canuto y Canito': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/canito_y_canuto.jpg',
  'Canito y Canuto': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/canito_y_canuto.jpg',
  'Celia': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/celia.jpg',
  'Chopy y la princesa': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/chopy_y_la_princesa.jpg',
  'Don Drácula': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/don_dracula.jpg',
  'El conde Pátula': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/el_conde_patula.jpg',
  'El cuentacuentos': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/el_cuentacuentos.jpg',
  'El libro de la selva': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/el_libro_de_la_selva.jpg',
  'Final Fantasy V': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/final_fantasy_v.jpg',
  'Jackie y Nuca': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/jackie_y_nuca.jpg',
  'La Aldea del arce': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/la_aldea_del_arce.jpg',
  'Las Aventuras de Tintin': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/tintin.jpg',
  'Los osos montañeses': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/los_osos_montaneses.jpg',
  'Mofli': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/mofli.jpg',
  'Naranjito, fútbol en acción': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/naranjito_futbol_en_accion.jpg',
  'Osos Revoltosos': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/osos_revoltosos.jpg',
  'Relatos de los hermanos Grimm': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/relatos_de_los_hermanos_grimm.jpg',
  'Simbad': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/simbad.jpg',
  'Sinbad': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/simbad.jpg',
  'Virkikis': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/los_monchicchis.jpg',
  'Virtua Fighter': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/virtua_fighter.jpg',
  'WillyFog': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/willyfog.jpg',
  'Una Navidad con Mickey': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/una_navidad_con_mickey.jpg',
  'Pepe Potamo': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/pepe_potamo.jpg',
  'Digimon Adventure': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/digimon_adventure.jpg',
  'Digimon Adventure 02': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/digimon_adventure_02.jpg',
  'Digimon tamers': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/digimon_tamers.jpg',
  'Digimon Frontier': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/digimon_frontier.jpg',
  'Digimon Data Squad': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/digimon_data_squad.jpg',
  'Digimon Adventure Remake (2020)': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/digimon_adventure_remake.jpg',
  'Digimon Adventure (2020)': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/digimon_adventure_remake.jpg',
  'T1 - Digimon Adventure': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/digimon_adventure.jpg',
  'T2 - Digimon Adventure 02': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/digimon_adventure_02.jpg',
  'T3 - Digimon Tamers': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/digimon_tamers.jpg',
  'T4 - Digimon Frontier': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/digimon_frontier.jpg',
  'T5 - Digimon Savers': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/digimon_data_squad.jpg',
};

const PATH_POSTER_SUFFIXES = {
  'Rick y Morty/\u00aanime': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/rick_y_morty_anime.jpg',
  'Festivales del tiri/Primer festival': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/festival_primero.jpg',
  'Festivales del tiri/Segundo festival': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/festival_segundo.jpg',
  'Festivales del tiri/Tercer festival': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/festival_tercero.jpg',
  'Festivales del tiri': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/festivales_por_capis.jpg',
  'Festivales por capis': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/festivales_por_capis.jpg',
  'Dragon Ball/Pelis': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/db_pelis.jpg',
  'Dragon Ball Super/Pelis': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/dbs_pelis.jpg',
  'Dragon Ball Z - Selecta Vision/Pelis+especiales': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/dbz_pelis_especiales.jpg',
  'Dragon Ball Z - Selecta Vision/1. Saga Saiyan (1-35)': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/dbz_saga_saiyan.jpg',
  'Dragon Ball Z - Selecta Vision/2.Saga Freezer (36-107)': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/dbz_saga_freezer.jpg',
  'Dragon Ball Z - Selecta Vision/3.Saga Garlick Jr. (108-117)': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/dbz_saga_garlick.jpg',
  'Dragon Ball Z - Selecta Vision/4.Saga Androides y Cell (118-194)': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/dbz_saga_androides.jpg',
  'Dragon Ball Z - Selecta Vision/5.Saga del Otro Mundo (195-199)': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/dbz_saga_otro_mundo.jpg',
  'Dragon Ball Z - Selecta Vision/6.Saga Buu (200-291)': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/dbz_saga_buu.jpg',
  'Pokémon/1. Kanto': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/pokemon_kanto.jpg',
  'Pokémon/2. Johto': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/pokemon_johto.jpg',
  'Pokémon/3. Hoenn': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/pokemon_hoenn.jpg',
  'Pokémon/4. Sinnoh': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/pokemon_sinnoh.jpg',
  'Pokémon/5. Teselia': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/pokemon_teselia.jpg',
  'Pokémon/6. Kalos': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/pokemon_kalos.jpg',
  'Pokémon/7. Alola': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/pokemon_alola.jpg',
  'Pokémon/8. Galar (Viajes Pokémon)': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/pokemon_galar.jpg',
  'Pokémon/9. Paldea (Pokémon Horizontes)': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/pokemon_paldea.jpg',
  'Pokémon/Crónicas Pokémon': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/pokemon_cronicas.jpg',
  'Pokémon/La conserje Pokémon': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/pokemon_conserje.jpg',
  'Pokémon/Pokémon Megaevolución': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/pokemon_megaevolucion.jpg',
  'Pokémon/Pokémon Origin': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/pokemon_origin.jpg',
  'Tres amigos y Jerry': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/jerry.png',
  'Hora de Aventuras/T1': 'https://image.tmdb.org/t/p/w500/vpnV0g2VOounP0kHNi86oBPceMY.jpg',
  'Hora de Aventuras/T2': 'https://image.tmdb.org/t/p/w500/vpnV0g2VOounP0kHNi86oBPceMY.jpg',
  'Hora de Aventuras/T3': 'https://image.tmdb.org/t/p/w500/vpnV0g2VOounP0kHNi86oBPceMY.jpg',
  'Hora de Aventuras/T4': 'https://image.tmdb.org/t/p/w500/vpnV0g2VOounP0kHNi86oBPceMY.jpg',
  'Hora de Aventuras/T5': 'https://image.tmdb.org/t/p/w500/vpnV0g2VOounP0kHNi86oBPceMY.jpg',
  'Hora de Aventuras/T6': 'https://image.tmdb.org/t/p/w500/vpnV0g2VOounP0kHNi86oBPceMY.jpg',
  'Hora de Aventuras/T7': 'https://image.tmdb.org/t/p/w500/vpnV0g2VOounP0kHNi86oBPceMY.jpg',
  'Hora de Aventuras/T8': 'https://image.tmdb.org/t/p/w500/vpnV0g2VOounP0kHNi86oBPceMY.jpg',
  'Hora de Aventuras/T9': 'https://image.tmdb.org/t/p/w500/vpnV0g2VOounP0kHNi86oBPceMY.jpg',
  'Hora de Aventuras/T10': 'https://image.tmdb.org/t/p/w500/vpnV0g2VOounP0kHNi86oBPceMY.jpg',
  'Los Terribles Gemelos Cramp': 'https://image.tmdb.org/t/p/w500/vDbVBSQJx4xz7FAaOoJG9IFhAsB.jpg',
  'Akira Kurosawa': 'https://m.media-amazon.com/images/I/91fPGYM7PyL._AC_UF894,1000_QL80_.jpg',
  "Monty's movies": 'https://m.media-amazon.com/images/I/710PzQnaomL._AC_UF894,1000_QL80_.jpg',
  'Sergei Eisentein': 'https://upload.wikimedia.org/wikipedia/commons/2/26/Sergei_Eisenstein_03.jpg',
  'Sine Kinki': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/sine_kinki.jpg',
  'Stephen King': 'https://i.pinimg.com/736x/5d/43/bd/5d43bdd12310bc686a71e4fedbf20590.jpg',
  'Disney/Cortos': 'https://cdn.artphotolimited.com/images/61a73c0dbd40b81766e77efb/1000x1000/walt-disney.jpg',
  'Disney/Pelis': 'https://cdn.artphotolimited.com/images/61a73c0dbd40b81766e77efb/1000x1000/walt-disney.jpg',
  'Disney/Cortos/Relatos de Disney': 'https://cdn.artphotolimited.com/images/61a73c0dbd40b81766e77efb/1000x1000/walt-disney.jpg',
  'Bumpy y sus amigos': 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRqoKEI0enZnyr-NoTQbkGqd6EMNbqmUEs2WbmEpkJKUQ&s=10',
  'Street Fighter II': 'https://image.tmdb.org/t/p/w500/p7VSebvaZ6eWTrJDFh1sV7h6GV2.jpg',
  'Asterix/Asterix dibus': 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQzo79gkoUV9SyK7C_DP07m2ReCyifEvQOSct-1hOu8i9jre1YorLnLo8q1&s=10',
  'Asterix/Asterix no dibus': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/asterix_no_dibus.png',
  'Un Millán de cosas': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/un_millan_de_cosas.png',
  'BeyBlade/BeyBlade 2000': 'https://i.pinimg.com/1200x/79/ba/15/79ba1560a8ab6945e38447b0c762179e.jpg',
  'BeyBlade/BeyBlade Burst': 'https://i.pinimg.com/1200x/79/ba/15/79ba1560a8ab6945e38447b0c762179e.jpg',
  'BeyBlade/BeyBlade Burst Evolution': 'https://i.pinimg.com/originals/27/c0/f7/27c0f7a97c259031bb741d055d2bd16a.jpg',
  'BeyBlade/BeyBlade Burst Turbo': 'https://i.pinimg.com/1200x/85/c8/b0/85c8b0809648bda7ade0ba41d510a453.jpg',
  'La brigada de los sepultureros': 'https://static.filmin.es/images/es/media/38022/1/poster_0_3.jpg',
  'La leyenda de Korra': 'https://image.tmdb.org/t/p/original/eMo4uWsN3qceNhBPcuw5T2lFsc5.jpg',
  'Vaca y Pollo': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/vaca_y_pollo.jpg',
  'Soy Comadreja': 'https://image.tmdb.org/t/p/original/j71oaLzJoU7CXP6v5GEfZZ9VQtX.jpg',
  'THE ELECTRIC WIZARD BY EOIN O`KANE': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/electric_wizard.png',
  'Avatar La Leyenda de Aang/T1': 'https://m.media-amazon.com/images/M/MV5BZTZmMWU3ZTUtM2U4Ni00YmNhLTkwODktN2IzNzkyZmRlYjZjXkEyXkFqcGc@._V1_FMjpg_UX1000_.jpg',
  'Avatar La Leyenda de Aang/T2': 'https://m.media-amazon.com/images/M/MV5BZTZmMWU3ZTUtM2U4Ni00YmNhLTkwODktN2IzNzkyZmRlYjZjXkEyXkFqcGc@._V1_FMjpg_UX1000_.jpg',
  'Avatar La Leyenda de Aang/T3': 'https://m.media-amazon.com/images/M/MV5BZTZmMWU3ZTUtM2U4Ni00YmNhLTkwODktN2IzNzkyZmRlYjZjXkEyXkFqcGc@._V1_FMjpg_UX1000_.jpg',
  'La banda del patio/Especiales': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/la_banda_del_patio.jpg',
  'La banda del patio/T1': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/la_banda_del_patio.jpg',
  'La banda del patio/T2': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/la_banda_del_patio.jpg',
  'La banda del patio/T3': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/la_banda_del_patio.jpg',
  'La banda del patio/T4': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/la_banda_del_patio.jpg',
  'La banda del patio/T5': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/la_banda_del_patio.jpg',
  'La banda del patio/T6': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/la_banda_del_patio.jpg',
  'El Zapatero y la Princesa (El Ladrón de Bagdad)': 'https://image.tmdb.org/t/p/w500/3OKtFuTxahr7hokPB9aO38qgOfc.jpg',
  'The Thief and the Cobbler Recobbled Cut Mark 4 WIP 19⁄09⁄13': 'https://image.tmdb.org/t/p/w500/3OKtFuTxahr7hokPB9aO38qgOfc.jpg',
  'The Thief and the Cobbler Recobbled Cut Mark 5 WIP 06⁄20⁄23': 'https://image.tmdb.org/t/p/w500/3OKtFuTxahr7hokPB9aO38qgOfc.jpg',
  'Gyakuten Saiban - Ace Attorney': 'https://m.media-amazon.com/images/I/71rWSoCx8fL._AC_UF894,1000_QL80_.jpg',
  'Gyakuten Saiban - Ace Attorney/s1': 'https://m.media-amazon.com/images/I/71rWSoCx8fL._AC_UF894,1000_QL80_.jpg',
  'Gyakuten Saiban - Ace Attorney/s2': 'https://m.media-amazon.com/images/I/71rWSoCx8fL._AC_UF894,1000_QL80_.jpg',
  'Monster': 'https://m.media-amazon.com/images/M/MV5BYzU2MWQ5NGQtYmNlMC00ZjJkLWJmODItZDM5MDM3YmUyMWJkXkEyXkFqcGc@._V1_FMjpg_UX1000_.jpg',
  'Overlord/s1': 'https://m.media-amazon.com/images/M/MV5BYjNjNDBmZjAtMGZiMS00ODBkLWFjYWItZWQ1ZjEwOGNmZDBjXkEyXkFqcGc@._V1_.jpg',
  'Overlord/s2': 'https://m.media-amazon.com/images/M/MV5BYjNjNDBmZjAtMGZiMS00ODBkLWFjYWItZWQ1ZjEwOGNmZDBjXkEyXkFqcGc@._V1_.jpg',
  'Overlord/s3': 'https://m.media-amazon.com/images/M/MV5BYjNjNDBmZjAtMGZiMS00ODBkLWFjYWItZWQ1ZjEwOGNmZDBjXkEyXkFqcGc@._V1_.jpg',
  'Overlord/s4': 'https://m.media-amazon.com/images/M/MV5BYjNjNDBmZjAtMGZiMS00ODBkLWFjYWItZWQ1ZjEwOGNmZDBjXkEyXkFqcGc@._V1_.jpg',
  'Overlord/Ovas + special/Ovelord Ovas + special': 'https://m.media-amazon.com/images/M/MV5BYjNjNDBmZjAtMGZiMS00ODBkLWFjYWItZWQ1ZjEwOGNmZDBjXkEyXkFqcGc@._V1_.jpg',
  'Steins;Gate Movie Fuka Ryouiki no Déjà vu': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/sgmovie.jpg',
};

const FILE_TITLE_ALIASES = {
  'El jovencito Frankenstein': "Young Frankenstein",
  'La vida de Brian BDrip': "Monty Python's Life of Brian",
  'Los caballeros de la mesa cuadrada': 'Monty Python and the Holy Grail',
  'El sentido de la vida': "Monty Python's The Meaning of Life",
  'El gigante de hierro': 'The Iron Giant',
  'La sustancia': 'The Substance',
  'Idiocracia': 'Idiocracy',
  'Rebelión en la granja': 'Animal Farm',
  'El Planeta Salvaje': 'Fantastic Planet',
  'Gigante': 'Giant',
  'Super Mario Bros La': 'The Super Mario Bros Movie',
  'Taron y el caldero magico': 'The Black Cauldron',
  'Tim Burton James Y El Melocoton Gigante': 'James and the Giant Peach',
  'Una Navidad con Mickey': "Mickey's Christmas Carol",
  'Duelo silencioso': 'The Quiet Duel',
  'El Angel Borracho': 'Drunken Angel',
  'La fortaleza escondida': 'The Hidden Fortress',
  'Los canallas duermen en paz': 'The Bad Sleep Well',
  'Trono de sangre': 'Throne of Blood',
  'Los sueños de Akira Kurosawa': "Akira Kurosawa's Dreams",
  'Tygra Hielo y Fuego': 'Fire and Ice',
  'Los surfistas nazis deben morir': 'Surf Nazis Must Die',
  'La mesita del comedor': 'The Coffee Table',
  'Premutos El Angel Caido': 'Premutos',
  'Operación Ogro': 'Ogro',
  'El Condon Asesino': 'Killer Condom',
  'Cheap aka Down and Dirty Duck': 'Down and Dirty Duck',
  'Asterix El Galo': 'Asterix the Gaul',
  'Asterix Y Cleopatra': 'Asterix and Cleopatra',
  'Las doce pruebas de Asterix': 'The Twelve Tasks of Asterix',
  'Astérix Y la sorpresa del César': 'Asterix vs Caesar',
  'Asterix En Bretaña': 'Asterix in Britain',
  'Asterix Y el golpe del menhir': 'Asterix and the Big Fight',
  'Asterix En America': 'Asterix Conquers America',
  'Astérix Y los vikingos': 'Asterix and the Vikings',
  'Astérix En los juegos olimpicos': 'Asterix at the Olympic Games',
  'Asterix La residencia de los dioses': 'Asterix The Mansions of the Gods',
  'Astérix El secreto de la poción mágica': 'Asterix The Secret of the Magic Potion',
  'Astérix y Obélix y El ReinoMedio': 'Asterix and Obelix The Middle Kingdom',
  'El Acorazado Potemkin': 'Battleship Potemkin',
  'La Linea General': 'The General Line',
  'Ivan El Terrible I': 'Ivan the Terrible Part I',
  'Ivan El Terrible II': 'Ivan the Terrible Part II',
  '¿Qué he hecho yo para merecer esto': 'What Have I Done to Deserve This',
  'Pinocho la leyenda': 'The Adventures of Pinocchio',
};

const FILE_POSTER_URLS = {
  'Primer Festival de Mortadelo y Filemón Estudios Vara 1969': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/festival_primero.jpg',
  'Segundo Festival de Mortadelo y Filemón Estudios Vara 1970': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/festival_segundo.jpg',
  'Tercer Festival de Mortadelo y Filemón Estudios Vara 1971': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/festival_tercero.jpg',
  'Pokémon - P01 - Mewtwo Vs Mew': 'https://m.media-amazon.com/images/M/MV5BNDg0ZDk2N2QtZDQzYi00ZTljLWExODgtZWQ2Y2YzZTA1NjVjXkEyXkFqcGc@._V1_SX300.jpg',
  'Pokémon - P01.1 - Mewtwo El regreso': 'https://m.media-amazon.com/images/M/MV5BMTM4NTAxMTQ4OV5BMl5BanBnXkFtZTYwNTM2MjI5._V1_SX300.jpg',
  'Pokémon - P02 - El poder de uno': 'https://m.media-amazon.com/images/M/MV5BOTE0NzY5MGUtZDdjMi00OTMyLThiYmEtOTc5NWY0NTE3NDA0XkEyXkFqcGc@._V1_SX300.jpg',
  'Pokémon - P03 - El Hechizo de los Unown': 'https://m.media-amazon.com/images/M/MV5BMTk0NzM3MDY1OV5BMl5BanBnXkFtZTYwNTkwODc5._V1_SX300.jpg',
  'Pokémon - P04 - Celebi, la Voz del Bosque': 'https://m.media-amazon.com/images/M/MV5BZjgyMzI2ODgtNGEyNC00N2U0LTgzMDQtMzgwMDI5YWFlYTliXkEyXkFqcGc@._V1_SX300.jpg',
  'Pokémon - P05 - Héroes, Latios y Latias': 'https://m.media-amazon.com/images/M/MV5BYWJlMGQxNDYtZTc5NC00MzlhLWI1MTItZmU1NjY1MTRlZjFjXkEyXkFqcGc@._V1_SX300.jpg',
  'Pokémon - P06 - Jirachi y los Deseos SUB': 'https://m.media-amazon.com/images/M/MV5BNjVmYTZkZjUtMGVhNS00NjQwLWIyM2UtYWNkZjNiYTY1ZjhhXkEyXkFqcGc@._V1_SX300.jpg',
  'Pokémon - P07 - El Destino de Deoxys SUB': 'https://image.tmdb.org/t/p/w500/3UV4evNh70gvPZB9KJEoh3a9B6I.jpg',
  'Pokémon - P08 - Lucario y el Misterio de Mew': 'https://m.media-amazon.com/images/M/MV5BODg1NzkzODMtMmNjYi00YWNmLWI3OGUtZjc0YzVjMjU5YzJmXkEyXkFqcGc@._V1_SX300.jpg',
  'Pokémon - P09 - Ranger y el Templo del Mar': 'https://m.media-amazon.com/images/M/MV5BMTczNjg3MDgyOV5BMl5BanBnXkFtZTgwMTc2MzQ2NjE@._V1_SX300.jpg',
  'Pokémon - P10 - El desafío de Darkrai': 'https://m.media-amazon.com/images/M/MV5BMTQ4MTYzODUzMF5BMl5BanBnXkFtZTgwMTcxOTk0MDE@._V1_SX300.jpg',
  'Pokémon - P11 - Giratina y el Defensor de los Cielos': 'https://m.media-amazon.com/images/M/MV5BMzFlYWUxN2QtMjZlNC00ZDBlLTljYzEtMTJkYzEyODM3Nzc3XkEyXkFqcGc@._V1_SX300.jpg',
  'Pokémon - P12 - Arceus y la Joya de la Vida': 'https://m.media-amazon.com/images/M/MV5BNzI5Y2NlZGYtOTM5NS00NmI1LWI3YWUtZWY5OTdhMTI5MTVlXkEyXkFqcGc@._V1_SX300.jpg',
  'Pokémon - P13 - Zoroark, el Maestro de las Ilusiones': 'https://m.media-amazon.com/images/M/MV5BOGM4ZGZiMWEtMzIxOS00M2I4LWJkNGQtMzY1YTQzOWM4N2U3XkEyXkFqcGc@._V1_SX300.jpg',
  'Pokémon - P14 - Blanco, Victini y Zekrom': 'https://m.media-amazon.com/images/M/MV5BZjkzNDVjZWYtYTljNS00YmQxLWFkY2UtN2E0NGJlNzE0NDM2XkEyXkFqcGc@._V1_SX300.jpg',
  'Pokémon - P14 - Negro, Victini y Reshiram': 'https://m.media-amazon.com/images/M/MV5BNmMwMzljYTgtY2NmNS00M2FhLWI0YzMtY2Y3MzlmMzBhYTE1XkEyXkFqcGc@._V1_SX300.jpg',
  'Pokémon - P15 - kyurem vs el Espadachín Místico': 'https://m.media-amazon.com/images/M/MV5BNDY4NjA4MjYxNV5BMl5BanBnXkFtZTgwMjM0MDgxMDI@._V1_SX300.jpg',
  'Pokémon - P16 - Genesect y el despertar de una leyenda': 'https://m.media-amazon.com/images/M/MV5BOGQ4MmY0ZWEtNmI4NC00NWZlLWE5ZjEtNWUxNjg2MTY0ZGI3XkEyXkFqcGc@._V1_SX300.jpg',
  'Pokémon - P17 - Diancie y la crisálida de la destrucción': 'https://m.media-amazon.com/images/M/MV5BZmIxNTYzODctY2ZlNS00Njc1LWFkMGUtNTI1MTlhZTFjMjNjXkEyXkFqcGc@._V1_SX300.jpg',
  'Pokémon - P18 - Hoopa y un duelo histórico': 'https://m.media-amazon.com/images/M/MV5BOTc4MzA2OTg1OF5BMl5BanBnXkFtZTgwNzcyNDAwODE@._V1_SX300.jpg',
  'Pokémon - P19 - Volcanion y la maravilla mecánica': 'https://m.media-amazon.com/images/M/MV5BMTk0NzI2Y2YtOGVjYi00YTUwLWEwNmEtODk1YjlhYzQ0ZTY5XkEyXkFqcGc@._V1_SX300.jpg',
  'Pokémon - P20 - ¡Te elijo a ti!': 'https://m.media-amazon.com/images/M/MV5BYTI5M2RmMWUtOGFlMC00M2YxLThiZjUtMjZkNjI3NWQ5NjkwXkEyXkFqcGc@._V1_SX300.jpg',
  'Pokémon - P21 - El Poder De todos': 'https://m.media-amazon.com/images/M/MV5BNWZiMGUzNTMtNmFkMS00YWQwLTgwOTYtNTA4YWFhNjBkM2Q2XkEyXkFqcGc@._V1_SX300.jpg',
  'Pokémon - P22 - Las cronicas de Arceus': 'https://image.tmdb.org/t/p/w500/aGH8biv7gRGeLyxg5Sn4WPcskxV.jpg',
  'Pokémon - P23 - Los secretos de la selva': 'https://m.media-amazon.com/images/M/MV5BY2NlMTFlNjMtNTg2Yi00MzkwLTk2NDUtMWNjZjU2MmEwOTkzXkEyXkFqcGc@._V1_SX300.jpg',
  '1 Dragon Ball Z La batalla de los dioses castellano': 'https://m.media-amazon.com/images/M/MV5BNTkwZTkzZDEtMmFjYy00Y2FmLTkxOTgtZWExMjAwMjZlYmM4XkEyXkFqcGc@._V1_SX300.jpg',
  '2 Dragon ball Z La resurrecion de F castellano': 'https://m.media-amazon.com/images/M/MV5BYjViOWI4ZmMtYzI3Zi00ZDBhLWFiMTUtMTQyMzNlN2RjZWM1XkEyXkFqcGc@._V1_QL75_UY562_CR8,0,380,562_.jpg',
  '3 Dragon Ball Super Broly': 'https://m.media-amazon.com/images/M/MV5BMTA5MTc1M2EtZWQ2Ni00ZmU2LTg3MzQtOTliMjE4OGM0ZWFiXkEyXkFqcGc@._V1_SX300.jpg',
  '4 Dragon Ball Super- Super Hero': 'https://m.media-amazon.com/images/M/MV5BNzA2NmEwZGQtNWI1Ni00MTEyLTlkZDUtZDc5ZTJiOGYyNDQ5XkEyXkFqcGc@._V1_SX300.jpg',
  'Dragon Ball Z OVA Especial El Plan para Exterminar a los saiyajins': 'https://image.tmdb.org/t/p/w500/fAwrVa1RA4RGnGvbx34KhlWdKIw.jpg',
  'Dragon Ball Z OVA Especial Episodio de Bardock': 'https://m.media-amazon.com/images/M/MV5BYmVlODQ4NGEtNzdhMi00NzJjLWIxNTctOThjNTMyMjU1ZWNkXkEyXkFqcGdeQXVyMjUyMTE3MTc@._V1_SX300.jpg',
  'Dragon Ball Z OVA 01 Devuelvanme a mi Gohan 1080p': 'https://m.media-amazon.com/images/M/MV5BNDliM2QwMmQtNGYwZi00ZjkyLWFjMDYtOTdhZjA2Y2M0ZWJkXkEyXkFqcGc@._V1_SX300.jpg',
  'Dragon Ball Z OVA 02 - El Hombre Más Fuerte De Este Mundo': 'https://image.tmdb.org/t/p/w500/3ipNfb1BIs6xGORZETfL2rYUy4w.jpg',
  'Dragon Ball Z OVA 03 - La batalla más grande del mundo': 'https://m.media-amazon.com/images/M/MV5BMTJiMGJlNDQtZDkwZS00MDNiLWIyMDUtYWYyMzI1MmQ0ODFhXkEyXkFqcGc@._V1_SX300.jpg',
  'Dragon Ball Z OVA 04 - Goku es un Super Saiyajin': 'https://m.media-amazon.com/images/M/MV5BNjE0OTMzZmQtZmYxMi00YzcxLTkzZmYtOTEwMDlkZjI2YTE3XkEyXkFqcGc@._V1_SX300.jpg',
  'Dragon Ball Z OVA 05 - Los rivales mas poderosos': 'https://image.tmdb.org/t/p/w500/1hXkEacbCRYYau4dLv4UZPWxKr5.jpg',
  'Dragon Ball Z OVA 06 - Los Guerreros Mas Poderosos': 'https://m.media-amazon.com/images/M/MV5BMTA3OGNiYzItNGNlYy00NGRiLWEwODUtMTJjZTMxNzVjYTY1XkEyXkFqcGc@._V1_SX300.jpg',
  'Dragon Ball Z OVA 07 - La pelea de los Tres Saiyajins': 'https://m.media-amazon.com/images/M/MV5BMmIyYWMwMzgtNzY4NC00MjM5LTkxNWMtMDg1NWE3ODMxODNlXkEyXkFqcGc@._V1_SX300.jpg',
  'Dragon Ball Z OVA 08 - El Poder Invencible': 'https://m.media-amazon.com/images/M/MV5BN2U0MzdjOTItNDg5NS00NWQ0LWE5ZWEtZmRjNDVmY2NmZDFjXkEyXkFqcGc@._V1_SX300.jpg',
  'Dragon Ball Z OVA 09 - La Galaxia Corre Peligro': 'https://m.media-amazon.com/images/M/MV5BMTY5OTM1OGMtYzEyMC00YzkxLWFiMjAtM2IxODM5YWNhNjg3XkEyXkFqcGc@._V1_SX300.jpg',
  'Dragon Ball Z OVA 10 - El Regreso del Guerrero Legendario (2)': 'https://m.media-amazon.com/images/M/MV5BYTg5Y2EyYTItOTc2OS00NWRjLWJjNzEtZjdlNzJiZDI1MmNhXkEyXkFqcGc@._V1_SX300.jpg',
  'Dragon Ball Z OVA 11 - El Combate Final': 'https://m.media-amazon.com/images/M/MV5BM2MyZjViODMtMmNiZi00Y2U5LWEyNDktOTAyYzRhNjFhNTc3XkEyXkFqcGc@._V1_SX300.jpg',
  'Dragon Ball Z OVA 12 - La Fusion De Goku y Vegeta 1080pconverted': 'https://m.media-amazon.com/images/M/MV5BNjIyNGY0OWYtY2JlNS00ODVjLWJiODEtYWNlNWZjNDMzZjUzXkEyXkFqcGc@._V1_SX300.jpg',
  'Dragon Ball Z OVA 13 - El Ataque Del Dragon': 'https://m.media-amazon.com/images/M/MV5BNjU2Mzg1NGItMzZkZS00ODYzLWEwMWItNGNiZTczM2U3M2MxXkEyXkFqcGc@._V1_SX300.jpg',
  'Dragon Ball Z OVA 2008 ¡Hey! Goku y sus': 'https://m.media-amazon.com/images/M/MV5BMmIwN2IzNDctZjEyMi00ZjU1LTk1NjYtZmRiMGFmOTVjZmFjXkEyXkFqcGdeQXVyOTU1NjkyODE@._V1_SX300.jpg',
  'Dragon Ball Z OVA Especial 1 - Bardock El padre de Goku': 'https://m.media-amazon.com/images/M/MV5BMTQwMmMwMDktMmE4Ni00YjVlLWJmNmUtZjIyMTgzMTkwZjIyXkEyXkFqcGc@._V1_SX300.jpg',
  'Dragon Ball Z OVA Especial 2 - Un futuro diferente Gohan y Trunks': 'https://m.media-amazon.com/images/M/MV5BODYxNzdlODYtYjJjMi00ZDI3LTkxYTgtNTRmNmY1ODM5ZDliXkEyXkFqcGc@._V1_SX300.jpg',
  'Dragon Ball - OVA 01 - La Leyenda de Shen Long': 'https://m.media-amazon.com/images/M/MV5BNTA5ZTBiZDEtZDk5Yi00NDA4LTk4MTItMGMwMGQ4NTBhNTc3XkEyXkFqcGc@._V1_SX300.jpg',
  'Dragon Ball - OVA 02 La Princesa Durmiente': 'https://m.media-amazon.com/images/M/MV5BZjI4ZDkwZjQtNDA5NS00OTY4LWIwNDAtMGQ0MzZjOTRkMmY5XkEyXkFqcGc@._V1_SX300.jpg',
  'Dragon Ball - OVA 03 - Una Aventura Mistica': 'https://m.media-amazon.com/images/M/MV5BMmI4YTg1MDYtZWQyYy00NjZjLWJiNTMtZjBhYmMxMzI2ZTVhXkEyXkFqcGc@._V1_SX300.jpg',
  "Fritz el gato (Fritz the cat). - Ralph Bakshi 1.972 USA Animación Comedia 75' Dual+VOSE 283 #": 'https://image.tmdb.org/t/p/w500/aZgHOb5QHvLLn4kxxBTVb0BNqW.jpg',
  'Heavy Metal': 'https://m.media-amazon.com/images/M/MV5BMjRkYWE1ZDUtYjg4Ny00YjAwLWJlZDQtZGU4MWE3ZmNmNjdmXkEyXkFqcGc@._V1_SX300.jpg',
  'TEKKEN - LA PELÍCULA': 'https://image.tmdb.org/t/p/w500/4nGHAliduj9KOFFyyeHFxbsCyUV.jpg',
  'Titan A.E.': 'https://m.media-amazon.com/images/M/MV5BMzYwZTRhMzMtMmRkNi00ODc2LWE0ODktNTUwYzVjMWJhMjViXkEyXkFqcGc@._V1_SX300.jpg',
  '1985 - Astérix Y la sorpresa del César': 'https://image.tmdb.org/t/p/w500/nVxcOIGRxeDy2MpgwPSXRQhTN45.jpg',
  '2014 - Asterix La residencia de los dioses': 'https://image.tmdb.org/t/p/w500/tuBDjGCBeDq4ypT58yfDMGaPOIb.jpg',
  '2023 - Astérix y Obélix y El ReinoMedio': 'https://image.tmdb.org/t/p/w500/gQy5hTqiioNHe85RuPcMyaio9Sp.jpg',
  'Aladdin (1992)': 'https://m.media-amazon.com/images/M/MV5BMmQwYWZjZGItYzc0OC00ZDllLTg3NjItOWIyOWYwMDljMjAyXkEyXkFqcGc@._V1_SX300.jpg',
  'Aladdin y el rey de los ladrones (1996)': 'https://m.media-amazon.com/images/M/MV5BODFkMjE5YzAtMDFkOC00ZDNhLTkwNmQtODk1Y2VhNThlNWJhXkEyXkFqcGdeQXVyNzY1NDgwNjQ@._V1_SX300.jpg',
  'Aladdin, El retorno de Jafar (1994)': 'https://image.tmdb.org/t/p/w500/dpnjhDsWimMUOMsuz2AVsqeU9vL.jpg',
  'Atlantis - El imperio perdido (2001)': 'https://image.tmdb.org/t/p/w500/uR7AKWMDTwyAub5r4QoPPiJImvx.jpg',
  'Basil, el ratón superdetective (1986) - - - LasCositas': 'https://m.media-amazon.com/images/M/MV5BMGZmNDU5OTMtYmRkNC00NDgxLTllNDAtNzFmZDEzNWIzNTViXkEyXkFqcGc@._V1_SX300.jpg',
  'Dumbo (1941)': 'https://m.media-amazon.com/images/M/MV5BNzIzZWZmM2ItNGMzOC00MGFiLTgxODgtNTQ2Mzk3ZWE1MzYxXkEyXkFqcGc@._V1_SX300.jpg',
  'El emperador y sus locuras (2000)': 'https://image.tmdb.org/t/p/w500/X9jChoAotaGU81lEraUVi8RHOe.jpg',
  'Flubber y el profesor chiflado (1997)': 'https://image.tmdb.org/t/p/w500/pvpoHSUkjERCTk0V8BYa9MLknsA.jpg',
  'La espada mágica': 'https://m.media-amazon.com/images/M/MV5BYjEzNjJkNzktYmNmMy00ZmUzLWE3OTMtZTM2ZDU3ODNjOGMyXkEyXkFqcGc@._V1_SX300.jpg',
  'La leyenda de Sleepy Hollow y el Señor Sapo': 'https://m.media-amazon.com/images/M/MV5BZDRkODhiMTMtZDg0ZC00ZTFhLTk2MDAtMWI3ZjcxMmY1OTllXkEyXkFqcGc@._V1_SX300.jpg',
  'Los Aristogatos (1970)': 'https://image.tmdb.org/t/p/w500/s9DsxlbVE1HvHnCz50GdHDBeZRy.jpg',
  'Los Rescatadores (1977 BDRip m1080p x264 Spanish-English AC3 5.1 Subs)': 'https://m.media-amazon.com/images/M/MV5BYjAxMmU2N2UtNjk1MC00YjlmLWI2YzAtYjBlMGM5NWJjOWYzXkEyXkFqcGc@._V1_SX300.jpg',
  'Los.Rescatadores.en.Cangurolandia.(1990).(Spanish.English.Subs).WEBRip.1080p.x264-AC3.DTS': 'https://m.media-amazon.com/images/M/MV5BZjIyYWVhYWUtZTdjYy00NTUxLWExY2YtYjljNWExYjYyMDUxXkEyXkFqcGc@._V1_SX300.jpg',
  'MERLIN EL ENCANTADOR ( rpegc)': 'https://m.media-amazon.com/images/M/MV5BN2U1ZDI3OGMtOTU0Ni00MTAxLTgwYWEtN2QwZDI4ZTQ5MTQ0XkEyXkFqcGc@._V1_SX300.jpg',
  'Oliver y su pandilla (1988)': 'https://image.tmdb.org/t/p/w500/31pu0jSoa6iUouojFnjjlqgOnHB.jpg',
  'Tod y Toby': 'https://m.media-amazon.com/images/M/MV5BY2IxMDIxZTAtMjEyMS00MzY3LTkyM2EtNTVlNTZmMjI1OTRlXkEyXkFqcGc@._V1_SX300.jpg',
  'Toy Story 1': 'https://image.tmdb.org/t/p/w500/jvn7wy3RSNEXnFSXLpH2of2LcV6.jpg',
  'Toy story 2': 'https://m.media-amazon.com/images/M/MV5BNzVmODlhMDEtY2YxZi00OTVjLTlkNTktN2Q2OTRlM2I4M2FhXkEyXkFqcGc@._V1_SX300.jpg',
  'Toy Story 3': 'https://m.media-amazon.com/images/M/MV5BMTgxOTY4Mjc0MF5BMl5BanBnXkFtZTcwNTA4MDQyMw@@._V1_SX300.jpg',
  'Toy Story 4': 'https://m.media-amazon.com/images/M/MV5BMTYzMDM4NzkxOV5BMl5BanBnXkFtZTgwNzM1Mzg2NzM@._V1_SX300.jpg',
  'Toy Story 5 (2026)': 'https://m.media-amazon.com/images/M/MV5BZTI1YTBiNmEtYWUxZi00YzFkLWIzNjMtMmZjMmY2NzM0ZWMzXkEyXkFqcGc@._V1_QL75_UX380_CR0,0,380,562_.jpg',
  'Toy Story Buzz Lightyear la pelicula': 'https://m.media-amazon.com/images/M/MV5BZGI3ZjUyM2ItNmFjYy00NGE3LTg2OTYtMTI2MDk0MjIxNDA1XkEyXkFqcGc@._V1_SX300.jpg',
  'Toy Story El tiempo perdido': 'https://m.media-amazon.com/images/M/MV5BOTc2OTA1MDM4M15BMl5BanBnXkFtZTgwNjczMDk5MjE@._V1_SX300.jpg',
  'Toy Story Terror': 'https://m.media-amazon.com/images/M/MV5BNDU5MWI4ZTctYTdlNi00MmQ1LTkzZGUtZmYxYWMyNmQ4MjdiXkEyXkFqcGc@._V1_SX300.jpg',
  'Toy Story Vacaciones en Hawaii': 'https://m.media-amazon.com/images/M/MV5BMTk1NzY0MTY3M15BMl5BanBnXkFtZTgwMjkzMDgwMjE@._V1_SX300.jpg',
  'Tron (1982)': 'https://m.media-amazon.com/images/M/MV5BMTA4Y2VjOWEtMWQ5MS00YWU5LTkxZTMtNzVmMDYyNWFiODU5XkEyXkFqcGc@._V1_SX300.jpg',
  'El Zapatero Y El Ladrón (Versión Del Director) - Subtitulada Al Español por VanSiriusX': 'https://image.tmdb.org/t/p/w500/3OKtFuTxahr7hokPB9aO38qgOfc.jpg',
  'Aqua Teen Hunger Force Colon': 'https://m.media-amazon.com/images/M/MV5BMTc0OTQwNzYyNF5BMl5BanBnXkFtZTcwMDc5NTM0MQ@@._V1_SX300.jpg',
  'Aquí llega Condemor, el pecador de la pradera': 'https://m.media-amazon.com/images/M/MV5BZTc1MTVjMjktMmQ3MC00ZWUzLTkzNDQtNGM0MDc5ZDFkY2ExXkEyXkFqcGc@._V1_SX300.jpg',
  'Brácula, Condemor II (Álvaro Sáenz de Heredia, Chiquito de la Calzada, Bigote Arrocet, 1997)': 'https://image.tmdb.org/t/p/w500/r0WElhXQsuERcxecPimMzgzgcTC.jpg',
  'El mono borracho en el ojo del tigre': 'https://m.media-amazon.com/images/M/MV5BMGVjNzA2Y2QtNzNlOC00ODE2LWE3NDEtMzE4NzUwNjdhZWQzXkEyXkFqcGc@._V1_SX300.jpg',
  'Karate A Muerte En Torremolinos Pedro Temboury 2001 (Reescalada 1280x720.by.VsX)': 'https://image.tmdb.org/t/p/w500/o8tUXtsXdlEy2PguPWrVh88sTTN.jpg',
  'La matanza canibal de los garrulos lisérgicos (1993)': 'https://image.tmdb.org/t/p/w500/mFdRxyQ0BimmDvcvhgsAIrjHt46.jpg',
  'Medio Flipado (Half Baked)': 'https://m.media-amazon.com/images/M/MV5BNTYyMDI1MzMtMzk3MC00MDA5LTgwZTgtZjYxZjc0ZmUwNGMxXkEyXkFqcGc@._V1_SX300.jpg',
  'La novena puerta': 'https://m.media-amazon.com/images/M/MV5BOTQ2ODM2NjktMzJjMC00MWJiLWI2MjMtMzhiOTFmMzc1ZDUyXkEyXkFqcGc@._V1_SX300.jpg',
  'La Soledad del Corredor de Fondo': 'https://m.media-amazon.com/images/M/MV5BZDM3MDA5NGMtZDQ1Yi00ZjdhLTgxNzgtY2UyN2RmNzg2YmZjXkEyXkFqcGc@._V1_SX300.jpg',
  'Memento.(Spanish.English).HDrip.XviD-AC3.by.FitoCorleone.(proteinicos.es)': 'https://image.tmdb.org/t/p/w500/fKTPH2WvH8nHTXeBYBVhawtRqtR.jpg',
  'Miedo Y Asco En Las Vegas': 'https://m.media-amazon.com/images/M/MV5BNjFkNjdiZjUtNzUzNy00NWM5LWFlNDUtNTRiYmJiZWNiYjkwXkEyXkFqcGc@._V1_SX300.jpg',
  'Naufrago en la luna (2009)': 'https://image.tmdb.org/t/p/w500/jRrdzFcJUTz9yb6A5quSQrvhJDB.jpg',
  'Tenemos que hablar de Kevin': 'https://m.media-amazon.com/images/M/MV5BMjE0NDE0MjYxNF5BMl5BanBnXkFtZTcwNjM2NTY5Ng@@._V1_SX300.jpg',
  'Una mirada a a la oscuridad (2006)': 'https://m.media-amazon.com/images/M/MV5BMThiNWRmNDQtOWM0ZC00YjI1LWFmMmMtYzBhZjMzODk4NmJmXkEyXkFqcGc@._V1_SX300.jpg',
  'Duelo silencioso..(Akira Kurosawa,1949).(Spanish.Japanese).DVD-Rip.XviD-AC3.by.Marc27.(filibusteros.com)': 'https://image.tmdb.org/t/p/w500/7XhjAEimUgiGjVzn5d3CvH5BFg1.jpg',
  'El Angel Borracho (Akira Kurosawa, 1948) (Spanish Japanese) Hdrip Xvid-Ac3 By Araubi (Proteinicos Es)': 'https://image.tmdb.org/t/p/w500/aAOyl6mo18xMSB5RcvR1BnFENRW.jpg',
  "El infierno del odio (Tengoku to jigoku). - Akira Kurosawa 1.963 Japón Negro 144' 369 #": 'https://image.tmdb.org/t/p/w500/9c87PSaPcoZzAGbJKQLAcYiqGRy.jpg',
  'La.fortaleza.escondida.(Akira.Kurosawa,.1958).(Spanish.Japanese).HDrip.XviD-AC3.by.araubi.(proteinicos.es)': 'https://image.tmdb.org/t/p/w500/qqW9ILhtVN29Bkr4ZNTjw29Q6nL.jpg',
  'Los canallas duermen en paz (1960)': 'https://image.tmdb.org/t/p/w500/8zIUesEI8a5ScJ4adThcYhm73k3.jpg',
  'los siete samurais - shichinin no samurai - seven samurai -(1954) - spanish': 'https://image.tmdb.org/t/p/w500/zr4DkzWIMjaWtj6hlsbN6dnNeTX.jpg',
  'Los sueños de Akira Kurosawa..(Akira Kurosawa.1990).(Spanish.Japanese).DVD-Rip.XviD-mp3.by.GCC.(centralclasico.com)': 'https://image.tmdb.org/t/p/w500/tn9OJznv1Ii6uXA4p6eZT5tnEo2.jpg',
  'Trono de sangre (1957)': 'https://image.tmdb.org/t/p/w500/4qggbvXbBZjvEALqEjyAQdaMTfM.jpg',
  'Yojimbo (El mercenario)(1961, Akira Kurosawa)Akantor': 'https://m.media-amazon.com/images/M/MV5BYzFkODA1N2QtY2UyMC00NTMwLWEyNzctMmE3YjIzNzE1MzY4XkEyXkFqcGc@._V1_SX300.jpg',
  'Dune (Version Extendida)(Spanish English Subs) HD1080p x264-AC3': 'https://m.media-amazon.com/images/M/MV5BMGJlMGM3NDAtOWNhMy00MWExLWI2MzEtMDQ0ZDIzZDY5ZmQ2XkEyXkFqcGc@._V1_SX300.jpg',
  'Corazón salvaje..(David Lynch.1990) DVDRip Xvid AC3-Mp3 English-Spanish': 'https://m.media-amazon.com/images/M/MV5BMjIyZTI1MzQtMmMxMS00MTkwLWFlNGMtMzQ2OThlZWNiM2YwXkEyXkFqcGc@._V1_SX300.jpg',
  'David Lynch - Inland Empire (2006)': 'https://image.tmdb.org/t/p/w500/7mP7TUoS5MQjPfjmfYMYYvlsbUy.jpg',
  'Eraserhead.(Cabeza borradora).1977.David Lynch.by Juggernaut.VOSE': 'https://image.tmdb.org/t/p/w500/j8Z0M4rUmxVFtvpN7bZ2JTASrsy.jpg',
  'Lost Highway (1997. David Lynch)(Carretera perdida).(Spanish.English.Subs).BDrip.1080p.HDR.HEVC.10b-AC3.by.nara': 'https://image.tmdb.org/t/p/w500/vFIhGJuUfCSGTFj5fgLCbBAtxt2.jpg',
  'Mulholland.Drive.(2001).(Spanish.English.spanishSub.englishsub).HD.1080p.x264-AC3.by.Rowdy.(emulesonic.com)': 'https://m.media-amazon.com/images/M/MV5BNjliY2UwMjQtYjVlNi00NzExLTg1MDMtMjE2OTYwYjI0NTcxXkEyXkFqcGc@._V1_SX300.jpg',
  'Terciopelo azul (Blue velvet) (David Lynch,1986)': 'https://image.tmdb.org/t/p/w500/rzcigN8ujeVJiEKGP3y3mJybvii.jpg',
  'The Elephant Man (David Lynch, 1980) 1080p': 'https://m.media-amazon.com/images/M/MV5BMGE3MDZhNmMtMmUxZS00MDJmLTgxYmQtOGU4ODU0Y2JmNDI1XkEyXkFqcGc@._V1_SX300.jpg',
  '1966 - 1996 - The Short Films Of David Lynch (David Lynch, 1966~1996) x264 (576P) Ac3 (Eng) Sub (Ita) By Sparco (1)': 'https://image.tmdb.org/t/p/w500/86WCJiXMvPaXEnN02sFjiAbhdB.jpg',
  'Corto The amputee.(1974.David.Lynch).(English.Spanishsub).DVD-Rip.XviD-mp3.by.jose1969.(exploradoresp2p.com)': 'https://image.tmdb.org/t/p/w500/6yRz5TOhNCbpOQ76daKSPh8x3Fe.jpg',
  'Abierto Hasta El Amanecer (1996) Robert Rodriguez - George Clooney, Harvey Keitel, Juliette Lewis, Quentin Tarantino - Spanish - Thriller AcciÃ³n Terror FantÃ¡stico Comedia Negra': 'https://image.tmdb.org/t/p/w500/4hPWRrWGFD6WuuzihqDbYMS51pc.jpg',
  'Four Rooms (1995)': 'https://m.media-amazon.com/images/M/MV5BMmNlMjE5YTEtZTU1My00MDc1LTgwNzctNTZlYmJmNTM3ZjYzXkEyXkFqcGc@._V1_SX300.jpg',
  'Pulp Fiction (1994)': 'https://m.media-amazon.com/images/M/MV5BYTViYTE3ZGQtNDBlMC00ZTAyLTkyODMtZGRiZDg0MjA2YThkXkEyXkFqcGc@._V1_QL75_UY562_CR3,0,380,562_.jpg',
  'Reservoir Dogs.(Reservoir Dogs).(Quentin Tarantino, 1992).H5534H.F137887F.(Spanish.English.Subs).Micro4K.2160p.x265.HDR10.Dolby.Vision.10Bits-AC3.by.lagartish': 'https://m.media-amazon.com/images/M/MV5BMmMzYjg4NDctYWY0Mi00OGViLWIzMTMtYWNlZGY5ZDJmYjk3XkEyXkFqcGc@._V1_SX300.jpg',
  'Serguei Eisenstein 1923 El Diario de Glumov': 'https://m.media-amazon.com/images/M/MV5BZmU3MTEzNjEtYTRiZi00ZmY4LTkwNzYtNDFmYTk1NWY3ZjAyXkEyXkFqcGdeQXVyMjYxMzY2NDk@._V1_SX300.jpg',
  'Serguei Eisenstein 1937 El Prado de Bezhin (Bezhin Meadow) (inacabada)': 'https://image.tmdb.org/t/p/w500/tkzxPNzPlfgV38FJqNrudRg6xa1.jpg',
  'Asalto al banco central (1983)': 'https://image.tmdb.org/t/p/w500/84UTUCUF7KFvkoTIjS7teiHWmRK.jpg',
  'El Pico 2': 'https://image.tmdb.org/t/p/w500/fc4lQVxiWIuPAw1d6jpg5UaMOiO.jpg',
  'Los violadores del amanecer (1978)': 'https://image.tmdb.org/t/p/w500/13PaVZDDSd717Q0aFh7P4I9Smin.jpg',
  'Perros callejeros 2 (1979)': 'https://m.media-amazon.com/images/M/MV5BMzFlY2MzYWItMzExZC00N2U3LTk5M2EtZmVjNDdhYmM4NWRmXkEyXkFqcGc@._V1_SX300.jpg',
  '2001 Odisea en el Espacio - Stanley Kubrick (1968) 7,7': 'https://image.tmdb.org/t/p/w500/pGabanxaE2YvN4jhZuSN3oXO0mi.jpg',
  'El Resplandor (Version Extendida) (1980) new': 'https://image.tmdb.org/t/p/w500/mm003Mj2e9kJRsrxiVdPn2BSBPh.jpg',
  'La Chaqueta Metálica (1987) - new': 'https://image.tmdb.org/t/p/w500/6CX7BcyD8Xd5AQ7myNs0UE4mu6c.jpg',
  'La.naranja.mecanica.(1971.Stanley.Kubrick).(Spanish.English.Subs).BDrip.1080p.x264.AC3.by.Nostrom0 new': 'https://image.tmdb.org/t/p/w500/p40pYh2EBPoyVyqw6qy2PAZkFVA.jpg',
  'Christine (1983) (Español)': 'https://m.media-amazon.com/images/M/MV5BYTQxZjlhNzUtMGJkMS00ODMwLWI0NzMtZGZiYzRmODE5ODI2XkEyXkFqcGc@._V1_SX300.jpg',
  'Cujo de Stephen King (1983) (25 Anniversary Edition) (Spanish English Subs) Bdrip 720p X264-AC3': 'https://image.tmdb.org/t/p/w500/x8PUdXCGSM6iDzzMonLRJukgGci.jpg',
  'El cementerio viviente 2 (Pet Sematary Two) (1993)': 'https://image.tmdb.org/t/p/w500/A1qXTzGHIyCQmJbmEZL47KIqRhL.jpg',
  'El.cementerio.viviente.(Pet.sematary.1989).(Spanish.English.Subs).BDrip.720p.x264-AC3.by.rodosky.(proteinicos.es)': 'https://image.tmdb.org/t/p/w500/rjL6WhvdnaEqwMfM3Crscjs0nNP.jpg',
  'It (Eso) (1990)': 'https://image.tmdb.org/t/p/w500/uuTYA9LIlIRCFMgFlxWb1KznfEx.jpg',
  'La Rebelion De Las Maquinas - Maximum Overdrive - 8 Days Of Terror - 1986 (Stephen King) (Spa-Eng) Emilio Estévez': 'https://image.tmdb.org/t/p/w500/8lROOm3zgANbYZwEKaTqVfHIJsE.jpg',
  'Maleficio (Thinner Stephen King 1996).720p.BluRay.x264.(Spanish.English)': 'https://image.tmdb.org/t/p/w500/qGj0B5yx9FPTjTKODOUzccjhG5F.jpg',
  'Proverbio Chino (2006)': 'https://image.tmdb.org/t/p/w500/sAg6tJtLT5zq6oveDqlQ6zRy0YJ.jpg',
  'The Magic Pear Tree (1968) Directed by Charles Swenson- Oscar Nominated Short': 'https://image.tmdb.org/t/p/w500/8OS0ztKcD8qjINACg7Mx3UltABV.jpg',
  'Trapito (Manuel García Ferré, 1975)': 'https://image.tmdb.org/t/p/w500/pFKLGKMIPQVPi6entlTnubx9OPD.jpg',
  'Operación Ogro (Gillo Pontecorvo,1979)': 'https://m.media-amazon.com/images/M/MV5BMjRiMWYyMjYtMjA5MS00Y2U0LTk0NmItMDQ0MjRhZTNmOTE2XkEyXkFqcGc@._V1_SX300.jpg',
  'Padre coraje (2002) (Benito Zambrano).dvdrip.x264.ac3.castleaco': 'https://m.media-amazon.com/images/M/MV5BY2RhMjIzN2EtY2IzZC00MzU0LTk5NjYtZDZiODAxYmNmMjY1XkEyXkFqcGc@._V1_SX300.jpg',
  'El caso Almeria (1984)': 'https://image.tmdb.org/t/p/w500/lVs02YmwvbHO9HuK5myv7Smf2gN.jpg',
  'El Pico (1983)': 'https://image.tmdb.org/t/p/w500/mlDv6yZ2Qoyq92xvmC56SQ2X2D1.jpg',
  'La estanquera de Vallecas (1987)': 'https://image.tmdb.org/t/p/w500/iTNv9ZlNFVsPevNS7yEyHvna5nf.jpg',
  'Perras Callejeras (1985)': 'https://image.tmdb.org/t/p/w500/aM8fZRllfZabWqvJD4Ig3n2PjrP.jpg',
  'Yo el Vaquilla (1985)': 'https://image.tmdb.org/t/p/w500/giOeARCc0nw27IJSFpTs0RrBJo4.jpg',
  'El Infierno (La Divina comedia de Dante) (Con rótulos originales) (1911)': 'https://image.tmdb.org/t/p/w500/2XlfmegPej7MqVXd82WbO2Zvf5L.jpg',
  'El Infierno (La Divina comedia de Dante) (Rótulos en español) (1911)': 'https://image.tmdb.org/t/p/w500/2XlfmegPej7MqVXd82WbO2Zvf5L.jpg',
  'El laberinto del Fauno - 2006 -': 'https://image.tmdb.org/t/p/w500/gWPkUFGlO7ZIiArUcWRBmvAwVjB.jpg',
  'Serguei Eisenstein 1924 La Huelga': 'https://image.tmdb.org/t/p/w500/qsULy0fRUwqvrX4JJhGrqKXpeNa.jpg',
  'Serguei Eisenstein 1927 Octubre': 'https://image.tmdb.org/t/p/w500/4HTqU5e3gQbiZwyXIa1ywb6aNlH.jpg',
  '7 Vírgenes (2005)': 'https://image.tmdb.org/t/p/w500/g3o2jxOM3IpYuT7RPACFNeChYHR.jpg',
  'Colegas (1982)': 'https://image.tmdb.org/t/p/w500/hAlIzdwCGKCFwr3BOE6S86NzsWi.jpg',
  'Días contados (1994)': 'https://image.tmdb.org/t/p/w500/qf1IQifbxAqZGKItFDgYBHIemRV.jpg',
  'El diputado (1978)': 'https://image.tmdb.org/t/p/w500/1zObGiy4FgTZx1IDam53s1lN44E.jpg',
  'Historias Del Kronen (1995)': 'https://image.tmdb.org/t/p/w500/vulTVwoMoy1IE1IRJhihHYQ6H2H.jpg',
  'La Reina Del Mate (1984)': 'https://image.tmdb.org/t/p/w500/b7IKfFlhIwex57td6b1kAGaQxTs.jpg',
  'Perros Callejeros (1977)': 'https://image.tmdb.org/t/p/w500/fbUlbqOYsFHQMHYsew4b0gtQw9S.jpg',
  'Ratas de la ciudad (1985)': 'https://image.tmdb.org/t/p/w500/6hnCjxxGkfMFRSZL017eRHZX5Hi.jpg',
  'Todos Me Llaman Gato (1981)': 'https://image.tmdb.org/t/p/w500/dZHfMB92FzzLf1vjt1ZhFNhBgMb.jpg',
  'Super Mario Bros La pelicula (2023)': 'https://image.tmdb.org/t/p/w500/4CDkQMpNDTtVKwS0BBZw5RIXDtY.jpg',
  'Resurrección (1999) HD 1080 - Película Completa en Español (Castellano). #peliculas #2025 #1999': 'https://m.media-amazon.com/images/M/MV5BM2I5NWM1NzAtOTU4MC00Mzk2LTliZjItNjA1MDgwMTJjZmQ2XkEyXkFqcGc@._V1_.jpg',
  'Una mirada a a la oscuridad (2006)': 'https://play-lh.googleusercontent.com/WEcGXUB97Jy1c5QvUyyT19vgsydiu0woE-DigscTrici7dIux2W_KJ8oCmtDuhyRa_P7Or8nb-Jo-0RPwP4',
  'Relatos de Disney Vol. I El Principe Y El Mendigo - La Leyenda De Sleepy Hollow': 'https://image.tmdb.org/t/p/w500/hn985uJJtaBIu46lFLVYeYZd1GT.jpg',
  'Relatos de Disney Vol. II El Patito Feo Y Otros cuentos': 'https://image.tmdb.org/t/p/w500/cLUM6AHSK4HnUtT78jlAznWQ3T3.jpg',
  'Relatos de Disney Vol. III Donald En El País De Las Matemáticas - Franklin y yo - 24 Inventos Modernos': 'https://image.tmdb.org/t/p/w500/1VIk3O5qX80FQAvGKueJeg3cYH7.jpg',
  'Relatos de Disney Vol. IV La Liebre Y La Tortuga - Otros Cortos': 'https://image.tmdb.org/t/p/w500/9CQ22jfqaV9rq6gPnAC53oQ0EIn.jpg',
  'Relatos de Disney Vol. V Los Tres Cerditos - Fernandito El Toro - Los Tres Mosqueteros Ciegos': 'https://image.tmdb.org/t/p/w500/mooNeFE8ziSsaY8GhP2i1JSQVrm.jpg',
  'Relatos de Disney Vol. VI El Dragon Chiflado - Mickey Y Las Habichuelas Magicas': 'https://image.tmdb.org/t/p/w500/o3pxSdoO3XZhCBHKvk6AjdsdBkb.jpg',
  'The Thief and the Cobbler Recobbled Cut (Traducido y subtitulado por VanSiriusX)': 'https://image.tmdb.org/t/p/w500/3OKtFuTxahr7hokPB9aO38qgOfc.jpg',
  'Angerla Kirkwook - It\'s time to blah blah': 'https://freight.cargo.site/t/original/i/426b2110e0d3b4a593e0288f3b1882626deb424d18ef2e93dcc3c28006479240/Illo24_Experiment1_Concept_V2_Web.jpg',
  'Yoji Kuri — AU FOU!': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/au_fou.png',
  'THE ELECTRIC WIZARD - EPISODE FOUR - THE CULT OF DOOM MOUNTAIN (1080p 12fps H264-128kbit AAC)': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/electric_wizard.png',
  'THE ELECTRIC WIZARD - EPISODE THREE - THE COSMIC REALM (1080p 12fps H264-128kbit AAC)': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/electric_wizard.png',
  'THE ELECTRIC WIZARD - EPISODE TWO - THRASHWORLD (1080p 12fps H264-128kbit AAC)': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/electric_wizard.png',
  'THE ELECTRIC WIZARD (1080p 12fps H264-128kbit AAC)': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/electric_wizard.png',
  'THE SOCKS AND SQUIMMY SHOW - EPISODE ONE - THE VISITOR (1080p 12fps H264-128kbit AAC)': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/socks_squimmy.png',
  'Blue Shining (Stanley Kubrick x David Lynch) on Vimeo': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/blue_shining.png',
  'Chicos Perversos (1983)': 'https://preview.redd.it/bad-boys-1983-v0-qrcz1hs8wqje1.jpeg?width=1080&crop=smart&auto=webp&s=c8fbadb915d5c0c97d8ac98c54938ba934284a11',
  'Perros callejeros III': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/perros_callejeros_3.jpg',
  'Perros callejeros Tres días de libertad (1995) Cierre final': 'https://image.tmdb.org/t/p/w500/E9YGCZuRxGBXTTVdVq8bhSetLO.jpg',
  'La Malcriada - Mr. Pizza Serie Completa': 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRteKKUo4SMvHTIL8OixHTgrLToN_bnrXfgeUsN-PGWuqGzKN1_jzvS_120GV1VgfE&s=10&ec=121902086',
  'Chocolate (1980)': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/chocolate_1980.jpg',
  'Our War Game (2000) - WEBDL-1080p Proper': 'https://m.media-amazon.com/images/M/MV5BNWNmOTY5Y2YtNGNiNi00M2IxLTlhYjktNDIwMzcyYzE0MDdkXkEyXkFqcGc@._V1_.jpg',
  'Street Fighter II Animated Movie': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/sf2_animated_movie.jpg',
  'Super Mario Bros (La Pelicula) (1993)': 'https://es.web.img3.acsta.net/medias/nmedia/18/86/19/98/20435979.jpg',
  'Phoenix Wright Ace Attorney (2012) (dual cast+jap)': 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQ_YDLiurUy9YbiRUbgnDId6bf5D9zWHkbkqPtfJ0Z22Q&s=10',
};

const CHILD_INHERIT_GROUP_ICON = new Set([
  'Festivales por capis',
  'Dragon Ball Z - Selecta Vision/1. Saga Saiyan (1-35)',
  'Dragon Ball Z - Selecta Vision/2.Saga Freezer (36-107)',
  'Dragon Ball Z - Selecta Vision/3.Saga Garlick Jr. (108-117)',
  'Dragon Ball Z - Selecta Vision/4.Saga Androides y Cell (118-194)',
  'Dragon Ball Z - Selecta Vision/5.Saga del Otro Mundo (195-199)',
  'Dragon Ball Z - Selecta Vision/6.Saga Buu (200-291)',
  'Tres amigos y Jerry',
]);

function groupInheritsChildIcon(group) {
  for (const name of CHILD_INHERIT_GROUP_ICON) {
    if (group === name || group.endsWith('/' + name) || group.includes(name + '/')) return true;
  }
  return false;
}

const FILE_CLEANNAME_ALIASES = {
  '1999 - Astérix y Obélix - Contra el César': 'Asterix and Obelix vs Caesar',
  '2002 - Astérix y Obélix - Misión Cleopatra': 'Asterix and Obelix Mission Cleopatra',
  '2012 - Astérix y Obélix - Al servicio de su majestad': 'Asterix and Obelix God Save Britannia',
  'Howard Un nuevo heroe 1986 Lea Thompson,Jeffrey Jones Ficcion Extraterrestres': 'Howard the Duck',
  'Pinocho, la leyenda (1996) m720p x264 MP3 2.0 EspaÃ±ol': 'The Adventures of Pinocchio',
};

function generateSearchVariants(title) {
  const normalized = normalizeTitle(title);
  const variants = [];

  if (TITLE_ALIASES[normalized]) {
    variants.push(TITLE_ALIASES[normalized]);
  }

  variants.push(normalized);

  const seasonStripped = normalized
    .replace(/\s*(?:s\d+|t\d+|season\s*\d+|temporada\s*\d+)\s*$/i, '')
    .trim();
  if (seasonStripped !== normalized && seasonStripped.length > 2) {
    variants.unshift(seasonStripped);
    if (TITLE_ALIASES[seasonStripped]) variants.unshift(TITLE_ALIASES[seasonStripped]);
  }

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

const RATE_LIMIT = '__RATE_LIMIT__';
const WIKIDATA_FAILED = '__WIKIDATA_FAILED__';
const WIKIDATA_RETRY_WAIT_MS = 60000;
const WIKIDATA_MAX_RETRIES = 4;

function omdbSearchSingle(title, apiKey) {
  return new Promise((resolve) => {
    const url = `https://www.omdbapi.com/?t=${encodeURIComponent(title)}&apikey=${apiKey}`;
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (/limit/i.test(json.Error || '')) {
            resolve(RATE_LIMIT);
          } else if (json.Response === 'True' && json.Poster && json.Poster !== 'N/A') {
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

async function omdbSearchSingleWithRetry(title, apiKey) {
  for (let attempt = 0; attempt <= OMD_MAX_RETRIES; attempt++) {
    const poster = await omdbSearchSingle(title, apiKey);
    if (poster !== RATE_LIMIT) return poster;
    if (attempt < OMD_MAX_RETRIES) {
      console.log(`  OMDb rate-limited (reintento ${attempt + 1}/${OMD_MAX_RETRIES}) en "${title}". Esperando ${OMD_RETRY_WAIT_MS / 1000}s...`);
      await sleep(OMD_RETRY_WAIT_MS);
    }
  }
  return RATE_LIMIT;
}

async function omdbSearch(title, apiKey) {
  const variants = generateSearchVariants(title);
  for (const variant of variants) {
    const poster = await omdbSearchSingleWithRetry(variant, apiKey);
    if (poster === RATE_LIMIT) return RATE_LIMIT;
    if (poster) return poster;
    await sleep(OMD_DELAY_MS);
  }
  return null;
}

const TMDB_IMG = 'https://image.tmdb.org/t/p/w500';

const WIKIDATA_MEDIA_TYPES = new Set([
  'Q11424',      // film
  'Q506240',     // television film
  'Q202866',     // animated film
  'Q29168811',   // animated feature film
  'Q5398426',    // television series
  'Q117467246',  // animated television series
  'Q63952888',   // anime television series
  'Q20650540',   // anime film
  'Q1261214',    // television special
  'Q526877',     // web series
  'Q1107',       // anime
]);

function wikidataGet(url) {
  return new Promise((resolve) => {
    https.get(url, { headers: { 'User-Agent': 'terabox-m3u/1.0 (github actions)' } }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', () => resolve(null));
  });
}

function isThrottled(body) {
  if (!body || typeof body !== 'string') return false;
  return /too many requests|rate limit/i.test(body) || !body.trim().startsWith('{');
}

const GENERIC_IMAGE_TOKENS = [
  'animation disc', 'blank television', 'flag of', 'mad scientist', 'smirc',
  'question book', 'question mark', 'nuvola', 'symbol', 'icon', 'commons-logo',
  'wiki-logo', 'ambox', 'stop hand', 'crystal', 'star', 'x mark', 'check mark',
  'redirect', 'category', 'portal', 'template', 'logo', 'map of', 'location',
  'coat of arms', 'placeholder', 'disambig', 'spacer', 'transparent',
];

const NON_POSTER_PATTERNS = /(?:^|[_\-\s])(?:logo|logotype|logo_|sign|slogan|cosplay|promo|promotional|title card|titlecard|opening|ending|frame|screenshot|screencap|photocard|photograph|photo_|_photo|cast photo|characters|copyright|trailer|tv spot|scene|capture|still|wallpaper|banner|header|logo\.svg)(?:$|[_\-\s])/i;

function isLikelyNonPoster(filename) {
  const f = filename.replace(/^960px-/i, '');
  if (NON_POSTER_PATTERNS.test(f)) return true;
  if (/\.svg($|\.)/i.test(f)) return true;
  if (/logo/i.test(f)) return true;
  if (/(?:cast|cosplay|panel|convention|office|showroom|broadway|building|street|store|electricity)/i.test(f)) return true;
  if (/(?:statue|fan art|fanart|by_\w+_|-by-|_test|test\.|cropped|crop\)|crop\.jpg|crop\.jpeg|title_card|_film\b|foot\.png|foot_|characters\.|characters_|_characters|tree_house|painting|wheatfield|_crows|artist|portrait|photo of|imagen de)/i.test(f)) return true;
  if (/(?:tartakovsky|quintel|van gogh|gribble|happy kittens)/i.test(f)) return true;
  if (/(?:_title\.jpg|_title\.png|_screen|_screenshot|all_3_|_3_eds|adam_west|1965|promo|logotype|_logo\.png)/i.test(f)) return true;
  if (/(?:^|_)(?:snorks|triptank|king_of_the_hill|codename|rocket_power|medabots)(?:$|_|\.)/i.test(f)) return true;
  return false;
}

async function wikipediaPageImage(lang, title) {
  const thumb = await wikipediaLeadImage(lang, title);
  if (thumb) return thumb;
  return wikipediaArticleImages(lang, title);
}

async function wikipediaLeadImage(lang, title) {
  const url = `https://${lang}.wikipedia.org/w/api.php?action=query&prop=pageimages&titles=${encodeURIComponent(title)}&format=json&pithumbsize=600`;
  const body = await wikidataGet(url);
  await sleep(WIKIDATA_DELAY_MS);
  if (!body) return null;
  if (isThrottled(body)) return RATE_LIMIT;
  try {
    const json = JSON.parse(body);
    const pages = json.query && json.query.pages;
    if (!pages) return null;
    for (const p of Object.values(pages)) {
      if (p.thumbnail && p.thumbnail.source) {
        const fn = decodeURIComponent(p.thumbnail.source.split('/').pop().replace(/\?.*$/, ''));
        if (!isLikelyNonPoster(fn)) return p.thumbnail.source;
      }
    }
  } catch (e) {
    // ignore
  }
  return null;
}

async function wikipediaArticleImages(lang, title) {
  const url = `https://${lang}.wikipedia.org/w/api.php?action=query&generator=images&titles=${encodeURIComponent(title)}&gimlimit=30&prop=imageinfo&iiprop=url&iiurlwidth=600&format=json`;
  const body = await wikidataGet(url);
  await sleep(WIKIDATA_DELAY_MS);
  if (!body) return null;
  if (isThrottled(body)) return RATE_LIMIT;
  let pages = {};
  try {
    pages = (JSON.parse(body).query && JSON.parse(body).query.pages) || {};
  } catch (e) {
    return null;
  }
  const titleTokens = title.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 2);
  const candidates = [];
  for (const p of Object.values(pages)) {
    const file = p.title || '';
    const lower = file.toLowerCase();
    if (!lower.endsWith('.jpg') && !lower.endsWith('.jpeg') && !lower.endsWith('.png')) continue;
    if (GENERIC_IMAGE_TOKENS.some(t => lower.includes(t))) continue;
    if (isLikelyNonPoster(file)) continue;
    const info = p.imageinfo && p.imageinfo[0];
    if (!info || !info.thumburl) continue;
    const score = titleTokens.some(t => lower.includes(t)) ? 1 : 0;
    candidates.push({ score, thumburl: info.thumburl, file });
  }
  candidates.sort((a, b) => b.score - a.score);
  return candidates.length ? candidates[0].thumburl : null;
}

async function wikidataSearchSingle(title) {
  const langs = ['es', 'en'];
  for (const lang of langs) {
    const searchUrl = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(title)}&language=${lang}&type=item&format=json&limit=5`;
    const body = await wikidataGet(searchUrl);
    await sleep(WIKIDATA_DELAY_MS);
    if (!body) continue;
    if (isThrottled(body)) return RATE_LIMIT;
    let items = [];
    try {
      items = JSON.parse(body).search || [];
    } catch (e) {
      continue;
    }
    const ids = items.map(i => i.id).slice(0, 5);
    if (ids.length === 0) continue;

    const entUrl = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${ids.join('|')}&props=claims|sitelinks&format=json`;
    const entBody = await wikidataGet(entUrl);
    await sleep(WIKIDATA_DELAY_MS);
    if (!entBody) continue;
    if (isThrottled(entBody)) return RATE_LIMIT;
    let entities = {};
    try {
      entities = JSON.parse(entBody).entities || {};
    } catch (e) {
      continue;
    }

    for (const id of ids) {
      const ent = entities[id];
      if (!ent || !ent.claims) continue;
      const p31 = ent.claims.P31 || [];
      const isMedia = p31.some(c =>
        c.mainsnak && c.mainsnak.datavalue &&
        WIKIDATA_MEDIA_TYPES.has(c.mainsnak.datavalue.value.id)
      );
      if (!isMedia) continue;
      const p18 = ent.claims.P18 && ent.claims.P18[0];
      if (p18 && p18.mainsnak && p18.mainsnak.datavalue) {
        const file = p18.mainsnak.datavalue.value.replace(/ /g, '_');
        if (!isLikelyNonPoster(file)) {
          return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=600`;
        }
      }
      const sitelinks = ent.sitelinks || {};
      const esWiki = sitelinks.eswiki && sitelinks.eswiki.title;
      if (esWiki) {
        const img = await wikipediaPageImage('es', esWiki);
        if (img === RATE_LIMIT) return RATE_LIMIT;
        if (img && !isLikelyNonPoster(decodeURIComponent(img.split('/').pop().replace(/\?.*$/, '')))) return img;
      }
      const enWiki = sitelinks.enwiki && sitelinks.enwiki.title;
      if (enWiki) {
        const img = await wikipediaPageImage('en', enWiki);
        if (img === RATE_LIMIT) return RATE_LIMIT;
        if (img && !isLikelyNonPoster(decodeURIComponent(img.split('/').pop().replace(/\?.*$/, '')))) return img;
      }
    }
  }
  return null;
}

async function wikidataSearch(title) {
  const variants = generateSearchVariants(title);
  for (const variant of variants) {
    const poster = await wikidataSearchSingle(variant);
    if (poster) return poster;
    if (poster === RATE_LIMIT) return RATE_LIMIT;
    await sleep(WIKIDATA_DELAY_MS);
  }
  return null;
}

async function wikidataSearchWithRetry(title) {
  for (let attempt = 1; attempt <= WIKIDATA_MAX_RETRIES; attempt++) {
    const poster = await wikidataSearch(title);
    if (poster !== RATE_LIMIT) return poster;
    if (attempt < WIKIDATA_MAX_RETRIES) {
      console.log(`  Wikidata rate-limited (intento ${attempt}/${WIKIDATA_MAX_RETRIES}). Esperando ${WIKIDATA_RETRY_WAIT_MS / 1000}s...`);
      await sleep(WIKIDATA_RETRY_WAIT_MS);
    }
  }
  return RATE_LIMIT;
}

async function wikidataSearchSingleWithRetry(title) {
  for (let attempt = 1; attempt <= WIKIDATA_MAX_RETRIES; attempt++) {
    const poster = await wikidataSearchSingle(title);
    if (poster !== RATE_LIMIT) return poster;
    if (attempt < WIKIDATA_MAX_RETRIES) {
      console.log(`  Wikidata rate-limited en archivos (intento ${attempt}/${WIKIDATA_MAX_RETRIES}). Esperando ${WIKIDATA_RETRY_WAIT_MS / 1000}s...`);
      await sleep(WIKIDATA_RETRY_WAIT_MS);
    }
  }
  return RATE_LIMIT;
}

function tmdbSearchSingle(title, apiKey) {
  return new Promise((resolve) => {
    const url = `https://api.themoviedb.org/3/search/movie?api_key=${apiKey}&query=${encodeURIComponent(title)}&language=es&include_adult=true`;
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          if (res.statusCode === 429) {
            resolve(RATE_LIMIT);
            return;
          }
          const json = JSON.parse(data);
          if (json.results && json.results.length > 0) {
            const movie = json.results.find(r => r.poster_path) || json.results[0];
            if (movie && movie.poster_path) {
              resolve(TMDB_IMG + movie.poster_path);
              return;
            }
          }
          resolve(null);
        } catch (e) {
          resolve(null);
        }
      });
    }).on('error', () => resolve(null));
  });
}

async function tmdbSearch(title, apiKey) {
  const variants = generateSearchVariants(title);
  for (const variant of variants) {
    const poster = await tmdbSearchSingle(variant, apiKey);
    if (poster === RATE_LIMIT) return RATE_LIMIT;
    if (poster) return poster;
    await sleep(OMD_DELAY_MS);
  }
  return null;
}

async function searchWithFallback(title, omdbKey, tmdbKey) {
  let poster = null;
  let omdbDown = false;
  if (omdbKey) {
    poster = await omdbSearch(title, omdbKey);
    if (poster === RATE_LIMIT) {
      omdbDown = true;
      if (tmdbKey) {
        console.log('  Cuota OMDb agotada, usando TMDB como respaldo...');
        poster = await tmdbSearch(title, tmdbKey);
      }
    }
  } else if (tmdbKey) {
    poster = await tmdbSearch(title, tmdbKey);
  }
  if (poster === RATE_LIMIT || omdbDown) {
    return RATE_LIMIT;
  }
  if (!poster) {
    const w = await wikidataSearch(title);
    if (w !== RATE_LIMIT) poster = w;
  }
  return poster;
}

async function searchSingleWithFallback(title, omdbKey, tmdbKey) {
  let poster = null;
  let omdbDown = false;
  if (omdbKey) {
    poster = await omdbSearchSingleWithRetry(title, omdbKey);
    if (poster === RATE_LIMIT) {
      omdbDown = true;
      if (tmdbKey) {
        console.log('  Cuota OMDb agotada, usando TMDB como respaldo...');
        poster = await tmdbSearchSingle(title, tmdbKey);
      }
    }
  } else if (tmdbKey) {
    poster = await tmdbSearchSingle(title, tmdbKey);
  }
  if (poster === RATE_LIMIT || omdbDown) {
    return RATE_LIMIT;
  }
  if (!poster) {
    const w = await wikidataSearchSingle(title);
    if (w !== RATE_LIMIT) poster = w;
  }
  return poster;
}

const KNOWN_DIRECTORS = [
  'akira kurosawa', 'alfred hitchcock', 'david lynch', 'quentin tarantino',
  'quentin taran tantarantino', 'sergei eisenstein', 'serguei eisenstein',
  'stanley kubrick', 'stephen king', 'ralph bakshi', 'mel brooks', 'jerry lewis',
  'tob browning', 'olaf ittenbach', 'manuel garcia ferre', 'pedro temboury',
  'caye casas', 'gillo pontecorvo', 'benito zambrano', 'joy batchelor',
  'john halas', 'robert rodriguez', 'jack nicholson', 'lea thompson',
  'jeffrey jones', 'emilio estevez', 'david lochary', 'divine'
];

function isKnownDirector(name) {
  const n = name.toLowerCase().trim();
  return KNOWN_DIRECTORS.some(d => n === d || n.startsWith(d + ' '));
}

function stripMovieNoise(text) {
  return text
    .replace(/(\d)\.(\d{3})/g, '$1$2')
    .replace(/[._]+/g, ' ')
    .replace(/\b(?:v\.?o\.?s\.?e|vose|vos|v\.?o|sub(?:s|titl\w+)?|spanish|english|espanol|español|jap(?:onese|ones|on|onés|onesa)?|japonés|japones|japón|castellano|dual|remux|remaster\w*|restaur\w*|reescal\w*|hd|fullhd|uhd|\d{3,4}p|4k|8k|blu-?ray|brrip|web-?rip|web-?dl|hdtv|hdr?rip|dvd-?rip|dvd|xvid|x26[45]|h\.?26[45]|hevc|ac-?3|dts|aac|mp-?3|mhd|internal|proper|repack|readnfo|ia|vengas|etc|pelicula|película|complet\w*|versi\w*n|edici\w*|extendid\w*|anniversary|edition|traducid\w*|subtitulad\w*|originales?|inacabad\w*|rpegc|akantor)\b/gi, ' ')
    .replace(/\b\d{1,2}[,.]\d\b/g, ' ')
    .replace(/\b(?:19\d{2}|20\d{2})\b/g, ' ')
    .replace(/[(),;'"*#]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isJunkParen(inner) {
  const t = inner.trim();
  const low = t.toLowerCase();
  if (!t) return true;
  if (/(?:\.?\s*(?:com|es|org|net|info)\b|by[\s.])/.test(low)) return true;
  if (/(\d{3,4}p|4k|8k|rip|remux|spanish|english|jap|castellano|vose|dual|sub|director)/i.test(low)) return true;
  if (/^\d{4}\b/.test(low)) return true;
  if (/,\s*(?:19|20)\d{2}/.test(low)) return true;
  if (isKnownDirector(low.replace(/^[\+\-]+/, ''))) return true;
  if (/^[\+\-]?[a-zñáéíóú]{2,15}$/.test(t) && !/^[A-ZÑÁÉÍÓÚ]/.test(t)) return true;
  return false;
}

function stripByPhrases(text) {
  return text
    .replace(/(?:^|\s)by\s+[\w.\-]+\s*/gi, ' ')
    .replace(/(?:^|\s)por\s+\w+\s*/gi, ' ')
    .replace(/(?:^|\s)\w+\.(?:com|es|org|net|info)\b\s*/gi, ' ')
    .replace(/\s+by$/gi, ' ')
    .replace(/\s+por$/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function movieTitleCandidates(fileName) {
  let raw = fileName
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(new RegExp('\\\\.(?:' + VIDEO_EXTENSIONS.map(e => e.slice(1)).join('|') + ')$', 'i'), '')
    .replace(/(\d)\.(\d{3})/g, '$1$2')
    .replace(/[._]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const segments = raw.split(/\s*[-–—]\s*/).map(s => s.trim()).filter(s => s.length > 1);
  if (segments.length === 0) segments.push(raw);

  const candidates = [];

  for (const seg of segments) {
    const keptParens = [...seg.matchAll(/\(([^)]+)\)/g)]
      .map(m => m[1])
      .filter(inner => !isJunkParen(inner))
      .map(inner => stripByPhrases(stripMovieNoise(inner)))
      .filter(x => x.length > 2 && !isKnownDirector(x));

    let cleaned = seg
      .replace(/(\([^)]*\))/g, (m) => isJunkParen(m.slice(1, -1)) ? ' ' : m)
      .replace(new RegExp('^\\s*(?:' + KNOWN_DIRECTORS.join('|') + ')\\s+', 'i'), ' ')
      .replace(/\s+/g, ' ')
      .trim();
    cleaned = stripByPhrases(stripMovieNoise(cleaned));

    const beforeParen = stripByPhrases(stripMovieNoise(seg.split('(')[0].replace(new RegExp('^\\s*(?:' + KNOWN_DIRECTORS.join('|') + ')\\s+', 'i'), ' ')));

    if (beforeParen.length > 2 && !isKnownDirector(beforeParen)) candidates.push(beforeParen);
    candidates.push(...keptParens);
    if (cleaned.length > 2 && !isKnownDirector(cleaned)) candidates.push(cleaned);
  }

  return [...new Set(candidates)]
    .filter(c => c.length >= 3 && c.toLowerCase().trim() !== 'rip')
    .slice(0, 3);
}

async function fetchFilePosters(files, apiKey, maxFetch = 400, tmdbKey) {
  const cache = loadPosterCache();
  const posters = {};
  let fetched = 0;
  let cached = 0;
  let missed = 0;
  let omdbDown = false;

  const toFetch = [];
  const toFetchWikidata = [];

  for (const file of files) {
    const key = 'FILE::' + file.cleanName;
    const candidates = movieTitleCandidates(file.cleanName);
    const cleanAlias = FILE_CLEANNAME_ALIASES[file.cleanName];
    const hasAlias = !!cleanAlias || candidates.some(c => FILE_TITLE_ALIASES[normalizeTitle(c)]);
    if (Object.prototype.hasOwnProperty.call(cache, key)) {
      const cachedVal = cache[key];
      if (cachedVal === WIKIDATA_FAILED) {
        cached++;
        continue;
      }
      if (cachedVal) {
        posters[file.cleanName] = cachedVal;
        cached++;
        continue;
      }
      if (hasAlias) {
        toFetch.push(file);
      } else {
        toFetchWikidata.push(file);
      }
      continue;
    }

    toFetch.push(file);
  }

  for (const file of toFetch) {
    if (fetched >= maxFetch) {
      console.log(`  Límite de ${maxFetch} fetch alcanzado. Resto quedará para próximos runs.`);
      break;
    }
    const key = 'FILE::' + file.cleanName;
    const candidates = movieTitleCandidates(file.cleanName);
    const cleanAlias = FILE_CLEANNAME_ALIASES[file.cleanName];

    let found = null;
    let completed = true;
    const queries = cleanAlias ? [cleanAlias] : [];
    for (const cand of candidates) {
      if (fetched >= maxFetch) { completed = false; break; }
      const alias = FILE_TITLE_ALIASES[normalizeTitle(cand)];
      if (alias) queries.push(alias);
      queries.push(cand);
    }
    for (const query of queries) {
      if (fetched >= maxFetch) { completed = false; break; }
      let poster;
      if (omdbDown) {
        poster = tmdbKey ? await tmdbSearchSingle(query, tmdbKey) : await wikidataSearchSingle(query);
      } else {
        poster = await searchSingleWithFallback(query, apiKey, tmdbKey);
      }
      await sleep(OMD_DELAY_MS);
      fetched++;
      if (poster === RATE_LIMIT) {
        console.log('  Cuota diaria OMDb agotada. No se cachea y se detiene.');
        completed = false;
        found = null;
        omdbDown = true;
        break;
      }
      if (poster) { found = poster; break; }
    }

    if (completed) {
      cache[key] = found;
      if (found) {
        posters[file.cleanName] = found;
      } else {
        missed++;
      }
    }
  }

  for (const file of toFetchWikidata) {
    const key = 'FILE::' + file.cleanName;
    const candidates = movieTitleCandidates(file.cleanName);
    const query = candidates[0] || file.cleanName;
    const poster = await wikidataSearchSingleWithRetry(query);
    await sleep(WIKIDATA_DELAY_MS);
    if (poster === RATE_LIMIT) {
      console.log('  Wikidata sin respuesta tras reintentos en archivos. Sin marcar fallos; se reintentará en próximos runs.');
      break;
    }
    if (poster) {
      posters[file.cleanName] = poster;
      cache[key] = poster;
      fetched++;
    } else {
      cache[key] = WIKIDATA_FAILED;
      missed++;
    }
  }

  savePosterCache(cache);
  console.log(`  Portadas por archivo: ${fetched} fetch, ${cached} cache, ${missed} sin resultado`);
  return posters;
}

async function fetchPosters(groups, apiKey, tmdbKey) {
  const cache = loadPosterCache();
  const posters = {};
  let fetched = 0;
  let cached = 0;
  let missed = 0;
  let omdbDown = false;

  const toFetch = [];
  const toFetchWikidata = [];

  for (const group of groups) {
    if (CUSTOM_POSTERS[group]) {
      posters[group] = CUSTOM_POSTERS[group];
      cache[group] = CUSTOM_POSTERS[group];
      cached++;
      continue;
    }

    if (Object.prototype.hasOwnProperty.call(cache, group)) {
      const cachedVal = cache[group];
      const hasAlias = !!TITLE_ALIASES[normalizeTitle(group)];
      if (cachedVal === WIKIDATA_FAILED) {
        if (hasAlias) {
          toFetch.push(group);
        } else {
          cached++;
        }
        continue;
      }
      if (cachedVal) {
        posters[group] = cachedVal;
        cached++;
        continue;
      }
      if (hasAlias) {
        toFetch.push(group);
      } else {
        toFetchWikidata.push(group);
      }
      continue;
    }

    toFetch.push(group);
  }

  for (const group of toFetch) {
    let poster;
    if (omdbDown) {
      poster = tmdbKey ? await tmdbSearch(group, tmdbKey) : await wikidataSearch(group);
    } else {
      poster = await searchWithFallback(group, apiKey, tmdbKey);
    }
    await sleep(OMD_DELAY_MS);

    if (poster === RATE_LIMIT) {
      if (!omdbDown) console.log('  Cuota diaria OMDb agotada. No se cachea y se detiene.');
      omdbDown = true;
      if (tmdbKey) {
        poster = await wikidataSearch(group);
        await sleep(OMD_DELAY_MS);
        if (poster === RATE_LIMIT) poster = null;
      } else {
        break;
      }
    }

    if (poster) {
      posters[group] = poster;
      cache[group] = poster;
      fetched++;
      if ((fetched + cached) % 10 === 0) {
        console.log(`  Portadas: ${fetched + cached}/${groups.length} (fetch: ${fetched}, cache: ${cached})`);
      }
    } else {
      posters[group] = null;
      cache[group] = null;
      missed++;
    }
  }

  for (const group of toFetchWikidata) {
    const poster = await wikidataSearchWithRetry(group);
    await sleep(WIKIDATA_DELAY_MS);
    if (poster === RATE_LIMIT) {
      console.log('  Wikidata sin respuesta tras reintentos. Sin marcar fallos; se reintentará en próximos runs.');
      break;
    }
    if (poster) {
      posters[group] = poster;
      cache[group] = poster;
      fetched++;
      if ((fetched + cached) % 10 === 0) {
        console.log(`  Portadas: ${fetched + cached}/${groups.length} (fetch: ${fetched}, cache: ${cached})`);
      }
    } else {
      posters[group] = null;
      cache[group] = WIKIDATA_FAILED;
      missed++;
    }
  }

  savePosterCache(cache);
  console.log(`  Portadas obtenidas: ${fetched + cached}/${groups.length} (fetch: ${fetched}, cache: ${cached}, sin resultado: ${missed})`);
  return posters;
}

async function listDirectory(tb, dirPath, page = 1) {
  const MAX_LIST_RETRIES = 3;
  for (let attempt = 1; attempt <= MAX_LIST_RETRIES; attempt++) {
    try {
      const result = await tb.getRemoteDir(dirPath, page);
      await sleep(DELAY_MS);
      if (result && result.list && result.list.length > 0) return result;
      if (attempt < MAX_LIST_RETRIES) {
        console.warn(`  Listado vacio de ${dirPath} (intento ${attempt}/${MAX_LIST_RETRIES}). Reintentando...`);
        await sleep(10000 * attempt);
      }
    } catch (error) {
      console.error(`Error listing ${dirPath} page ${page} (intento ${attempt}/${MAX_LIST_RETRIES}):`, error.message);
      if (attempt < MAX_LIST_RETRIES) await sleep(10000 * attempt);
    }
  }
  return null;
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
        console.error(`⚠️  No se pudo listar ${dirPath} (pagina ${page}) tras reintentos. El arbol bajo esta carpeta se omitira en este run.`);
      }
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

function generateJSON(files, rootFolder, posters, filePosters) {
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
      groupsMap[group] = { name: group, image: groupImg, info: '', stations: [] };
    }
    let poster = posters && posters[searchName] ? posters[searchName] : null;
    if (!poster && fallbackName) poster = posters && posters[fallbackName] ? posters[fallbackName] : null;
    if (filePosters && filePosters[file.cleanName]) poster = filePosters[file.cleanName];
    if (FILE_POSTER_URLS && FILE_POSTER_URLS[file.cleanName]) poster = FILE_POSTER_URLS[file.cleanName];
    if (!poster) {
      const cachedFilePoster = posterCache['FILE::' + file.cleanName];
      if (cachedFilePoster && cachedFilePoster !== WIKIDATA_FAILED) poster = cachedFilePoster;
    }
    if (groupInheritsChildIcon(group)) poster = groupsMap[group].image || null;
    const station = { name: file.cleanName, url: file.dlink };
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
  try {
    if (fs.existsSync(prevListPath)) {
      const prev = JSON.parse(fs.readFileSync(prevListPath, 'utf-8'));
      prevStationCount = (prev.groups || []).reduce((sum, g) => sum + (g.stations || []).length, 0);
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

  console.log('Buscando portadas por archivo para grupos sin portada...');
  const filesNeedingFilePoster = filesWithLinks.filter(f => {
    const { searchName, fallbackName } = getGroupFromPath(f.path, rootFolder);
    const g = posters && posters[searchName] ? posters[searchName] : null;
    const fb = !g && fallbackName ? posters && posters[fallbackName] : null;
    if (g || fb) return false;
    if (!/\b(?:19|20)\d{2}\b/.test(f.cleanName)) return false;
    if (/S\d+E\d+|E\d{2,3}\b/i.test(f.cleanName)) return false;
    return true;
  });
  console.log(`Archivos en grupos sin portada que parecen películas: ${filesNeedingFilePoster.length}`);

  let filePosters = {};
  if ((omdbKey || tmdbKey) && filesNeedingFilePoster.length > 0) {
    console.log(`\nBuscando portadas por archivo para ${filesNeedingFilePoster.length} archivos...`);
    filePosters = await fetchFilePosters(filesNeedingFilePoster, omdbKey, 400, tmdbKey);
    console.log('');
  }

  console.log('Generando lista JSON...');
  const jsonContent = generateJSON(filesWithLinks, rootFolder, posters, filePosters);
  
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
