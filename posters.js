const https = require('https');
const { TITLE_ALIASES, FILE_TITLE_ALIASES, FILE_POSTER_URLS, FILE_CLEANNAME_ALIASES } = require('./data.js');
const {
  sleep,
  normalizeTitle,
  generateSearchVariants,
  loadPosterCache,
  savePosterCache,
  VIDEO_EXTENSIONS,
} = require('./util.js');

// Busqueda de caratulas y metadatos (extraido de index.js).
// Requiere data.js (tablas) y util.js (helpers). No tocar la logica a mano.

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

function omdbMetaSingle(title, apiKey) {
  return new Promise((resolve) => {
    const url = `https://www.omdbapi.com/?t=${encodeURIComponent(title)}&plot=full&apikey=${apiKey}`;
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (/limit/i.test(json.Error || '')) {
            resolve(RATE_LIMIT);
          } else if (json.Response === 'True') {
            resolve({
              plot: json.Plot && json.Plot !== 'N/A' ? json.Plot : '',
              rating: json.imdbRating && json.imdbRating !== 'N/A' ? parseFloat(json.imdbRating) : 0,
              year: json.Year && json.Year !== 'N/A' ? String(json.Year) : '',
              genre: json.Genre && json.Genre !== 'N/A' ? json.Genre : '',
              director: json.Director && json.Director !== 'N/A' ? json.Director : '',
              type: json.Type === 'series' ? 'series' : json.Type === 'movie' ? 'movie' : '',
              source: 'omdb',
            });
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

function tmdbMetaSingle(title, apiKey) {
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
            const movie = json.results.find(r => r.overview || r.vote_count > 0) || json.results[0];
            if (movie) {
              resolve({
                plot: movie.overview || '',
                rating: movie.vote_average ? movie.vote_average : 0,
                year: movie.release_date ? String(movie.release_date).substring(0, 4) : '',
                genre: '',
                director: '',
                type: movie.media_type === 'tv' ? 'series' : 'movie',
                source: 'tmdb',
              });
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

async function tmdbMetaSearch(title, apiKey) {
  const variants = generateSearchVariants(title);
  for (const variant of variants) {
    const meta = await tmdbMetaSingle(variant, apiKey);
    if (meta === RATE_LIMIT) return RATE_LIMIT;
    if (meta) return meta;
    await sleep(OMD_DELAY_MS);
  }
  return null;
}

async function omdbMetaSearch(title, apiKey) {
  const variants = generateSearchVariants(title);
  for (const variant of variants) {
    const meta = await omdbMetaSingleWithRetry(variant, apiKey);
    if (meta === RATE_LIMIT) return RATE_LIMIT;
    if (meta) return meta;
    await sleep(OMD_DELAY_MS);
  }
  return null;
}

async function omdbMetaSingleWithRetry(title, apiKey) {
  for (let attempt = 0; attempt <= OMD_MAX_RETRIES; attempt++) {
    const meta = await omdbMetaSingle(title, apiKey);
    if (meta !== RATE_LIMIT) return meta;
    if (attempt < OMD_MAX_RETRIES) {
      await sleep(OMD_RETRY_WAIT_MS);
    }
  }
  return RATE_LIMIT;
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

module.exports = {
  RATE_LIMIT,
  WIKIDATA_FAILED,
  WIKIDATA_RETRY_WAIT_MS,
  WIKIDATA_MAX_RETRIES,
  omdbSearch,
  omdbSearchSingle,
  omdbMetaSearch,
  omdbMetaSingle,
  omdbSearchSingleWithRetry,
  omdbMetaSingleWithRetry,
  tmdbSearch,
  tmdbSearchSingle,
  tmdbMetaSearch,
  tmdbMetaSingle,
  wikidataSearch,
  wikidataSearchSingle,
  wikidataSearchWithRetry,
  wikidataSearchSingleWithRetry,
  searchWithFallback,
  searchSingleWithFallback,
  isLikelyNonPoster,
  movieTitleCandidates,
  fetchFilePosters,
  fetchPosters,
};
