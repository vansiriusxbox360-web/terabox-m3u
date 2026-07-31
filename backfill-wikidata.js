const path = require('path');
const fs = require('fs');
const index = require(path.join(__dirname, 'index.js'));

const CACHE_PATH = path.join(__dirname, 'posters-cache.json');
const WIKIDATA_DELAY_MS = 1200;
const RETRY_WAIT_MS = 90000;
const MAX_RETRIES = 6;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function isThrottled(body) {
  if (!body || typeof body !== 'string') return false;
  return /too many requests|rate limit/i.test(body) || !body.trim().startsWith('{');
}

async function wikidataGet(url) {
  return new Promise((resolve) => {
    https.get(url, { headers: { 'User-Agent': 'terabox-m3u/1.0 (local backfill)' } }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve(data));
    }).on('error', () => resolve(null));
  });
}
const https = require('https');

async function wikidataSearchSingle(title) {
  const langs = ['es', 'en'];
  for (const lang of langs) {
    const searchUrl = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(title)}&language=${lang}&type=item&format=json&limit=5`;
    const body = await wikidataGet(searchUrl);
    await sleep(WIKIDATA_DELAY_MS);
    if (!body) continue;
    if (isThrottled(body)) return '__RATE_LIMIT__';
    let items = [];
    try { items = JSON.parse(body).search || []; } catch (e) { continue; }
    const ids = items.map((i) => i.id).slice(0, 5);
    if (ids.length === 0) continue;
    const entUrl = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${ids.join('|')}&props=claims|sitelinks&format=json`;
    const entBody = await wikidataGet(entUrl);
    await sleep(WIKIDATA_DELAY_MS);
    if (!entBody) continue;
    if (isThrottled(entBody)) return '__RATE_LIMIT__';
    let entities = {};
    try { entities = JSON.parse(entBody).entities || {}; } catch (e) { continue; }
    for (const id of ids) {
      const ent = entities[id];
      if (!ent || !ent.claims) continue;
      const p31 = ent.claims.P31 || [];
      const isMedia = p31.some((c) =>
        c.mainsnak && c.mainsnak.datavalue &&
        WIKIDATA_MEDIA_TYPES.has(c.mainsnak.datavalue.value.id)
      );
      if (!isMedia) continue;
      const p18 = ent.claims.P18 && ent.claims.P18[0];
      if (p18 && p18.mainsnak && p18.mainsnak.datavalue) {
        const file = p18.mainsnak.datavalue.value.replace(/ /g, '_');
        return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=600`;
      }
      const sitelinks = ent.sitelinks || {};
      const esWiki = sitelinks.eswiki && sitelinks.eswiki.title;
      if (esWiki) {
        const img = await wikipediaPageImage('es', esWiki);
        if (img === '__RATE_LIMIT__') return '__RATE_LIMIT__';
        if (img) return img;
      }
      const enWiki = sitelinks.enwiki && sitelinks.enwiki.title;
      if (enWiki) {
        const img = await wikipediaPageImage('en', enWiki);
        if (img === '__RATE_LIMIT__') return '__RATE_LIMIT__';
        if (img) return img;
      }
    }
  }
  return null;
}

const WIKIDATA_MEDIA_TYPES = new Set([
  'Q11424', 'Q506240', 'Q202866', 'Q29168811', 'Q5398426',
  'Q117467246', 'Q63952888', 'Q20650540', 'Q1261214', 'Q526877', 'Q1107',
]);

const GENERIC_IMAGE_TOKENS = [
  'animation disc', 'blank television', 'flag of', 'mad scientist', 'smirc',
  'question book', 'question mark', 'nuvola', 'symbol', 'icon', 'commons-logo',
  'wiki-logo', 'ambox', 'stop hand', 'crystal', 'star', 'x mark', 'check mark',
  'redirect', 'category', 'portal', 'template', 'logo', 'map of', 'location',
  'coat of arms', 'placeholder', 'disambig', 'spacer', 'transparent',
];

async function wikipediaPageImage(lang, title) {
  const t = await wikipediaLeadImage(lang, title);
  if (t) return t;
  return wikipediaArticleImages(lang, title);
}

async function wikipediaLeadImage(lang, title) {
  const url = `https://${lang}.wikipedia.org/w/api.php?action=query&prop=pageimages&titles=${encodeURIComponent(title)}&format=json&pithumbsize=600`;
  const body = await wikidataGet(url);
  await sleep(WIKIDATA_DELAY_MS);
  if (!body) return null;
  if (isThrottled(body)) return '__RATE_LIMIT__';
  try {
    const json = JSON.parse(body);
    const pages = json.query && json.query.pages;
    if (!pages) return null;
    for (const p of Object.values(pages)) {
      if (p.thumbnail && p.thumbnail.source) return p.thumbnail.source;
    }
  } catch (e) {}
  return null;
}

async function wikipediaArticleImages(lang, title) {
  const url = `https://${lang}.wikipedia.org/w/api.php?action=query&generator=images&titles=${encodeURIComponent(title)}&gimlimit=30&prop=imageinfo&iiprop=url&iiurlwidth=600&format=json`;
  const body = await wikidataGet(url);
  await sleep(WIKIDATA_DELAY_MS);
  if (!body) return null;
  if (isThrottled(body)) return '__RATE_LIMIT__';
  let pages = {};
  try {
    pages = (JSON.parse(body).query && JSON.parse(body).query.pages) || {};
  } catch (e) { return null; }
  const titleTokens = title.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2);
  const candidates = [];
  for (const p of Object.values(pages)) {
    const file = p.title || '';
    const lower = file.toLowerCase();
    if (!lower.endsWith('.jpg') && !lower.endsWith('.jpeg') && !lower.endsWith('.png')) continue;
    if (GENERIC_IMAGE_TOKENS.some((t) => lower.includes(t))) continue;
    const info = p.imageinfo && p.imageinfo[0];
    if (!info || !info.thumburl) continue;
    const score = titleTokens.some((t) => lower.includes(t)) ? 1 : 0;
    candidates.push({ score, thumburl: info.thumburl, file });
  }
  candidates.sort((a, b) => b.score - a.score);
  return candidates.length ? candidates[0].thumburl : null;
}

function generateSearchVariants(title) {
  const normalized = index.normalizeTitle(title);
  const variants = [];
  if (index.TITLE_ALIASES && index.TITLE_ALIASES[normalized]) variants.push(index.TITLE_ALIASES[normalized]);
  variants.push(normalized);
  const seasonStripped = normalized
    .replace(/\s*(?:s\d+|t\d+|season\s*\d+|temporada\s*\d+)\s*$/i, '')
    .trim();
  if (seasonStripped !== normalized && seasonStripped.length > 2) {
    variants.unshift(seasonStripped);
    if (index.TITLE_ALIASES && index.TITLE_ALIASES[seasonStripped]) variants.unshift(index.TITLE_ALIASES[seasonStripped]);
  }
  const dashSplit = normalized.split(/\s*[-–—]\s*/);
  if (dashSplit.length >= 2 && dashSplit[0].trim().length > 2) variants.push(dashSplit[0].trim());
  const plusSplit = normalized.split(/\s*\+\s*/);
  if (plusSplit.length >= 2 && plusSplit[0].trim().length > 2) variants.push(plusSplit[0].trim());
  const noArticles = normalized.replace(/^(?:El|La|Los|Las|Un|Una|Le|Les|The|A|An)\s+/i, '').trim();
  if (noArticles !== normalized && noArticles.length > 2) variants.push(noArticles);
  return [...new Set(variants)];
}

async function wikidataSearch(title) {
  const variants = generateSearchVariants(title);
  for (const variant of variants) {
    const poster = await wikidataSearchSingle(variant);
    if (poster) return poster;
    if (poster === '__RATE_LIMIT__') return '__RATE_LIMIT__';
    await sleep(WIKIDATA_DELAY_MS);
  }
  return null;
}

async function searchWithRetry(fn, title, what) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const poster = await fn(title);
    if (poster !== '__RATE_LIMIT__') return poster;
    if (attempt < MAX_RETRIES) {
      console.log(`  [${what}] rate-limited (intento ${attempt}/${MAX_RETRIES}). Esperando ${RETRY_WAIT_MS / 1000}s...`);
      await sleep(RETRY_WAIT_MS);
    }
  }
  return '__RATE_LIMIT__';
}

async function main() {
  const cache = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
  let nullKeys = Object.keys(cache).filter((k) => cache[k] === null);
  const maxItems = parseInt(process.argv[2] || '0', 10);
  if (maxItems > 0) nullKeys = nullKeys.slice(0, maxItems);
  console.log(`Nulls a procesar: ${nullKeys.length}`);

  let hits = 0;
  let fails = 0;
  for (let i = 0; i < nullKeys.length; i++) {
    const key = nullKeys[i];
    const isFile = key.startsWith('FILE::');
    const raw = isFile ? key.slice(6) : key;
    let poster;
    if (isFile) {
      const candidates = index.movieTitleCandidates(raw);
      const query = (candidates && candidates[0]) || raw;
      poster = await searchWithRetry(wikidataSearchSingle, query, 'archivo');
    } else {
      poster = await searchWithRetry(wikidataSearch, raw, 'grupo');
    }
    if (poster === '__RATE_LIMIT__') {
      console.log('  Rate limit persistente. Parando; el resto quedará para otra pasada.');
      break;
    }
    if (poster) {
      cache[key] = poster;
      hits++;
      console.log(`  [${i + 1}/${nullKeys.length}] ${hits + fails} OK | +${key}: ${poster.slice(0, 70)}`);
    } else {
      cache[key] = '__WIKIDATA_FAILED__';
      fails++;
      if ((hits + fails) % 10 === 0) console.log(`  [${i + 1}/${nullKeys.length}] hits=${hits} fails=${fails}`);
    }
    if ((i + 1) % 15 === 0) {
      fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2), 'utf-8');
      console.log(`  [checkpoint ${i + 1}/${nullKeys.length}] cache guardado`);
    }
  }

  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2), 'utf-8');
  console.log(`\nBackfill terminado. HITS=${hits} FAILS=${fails}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
