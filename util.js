const fs = require('fs');
const path = require('path');
const { TITLE_ALIASES } = require('./data.js');

const VIDEO_EXTENSIONS = ['.mp4', '.mkv', '.avi', '.wmv', '.flv', '.mov', '.m4v', '.mpg', '.mpeg', '.3gp', '.webm'];

// Helpers compartidos del generador (extraidos de index.js).

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
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

module.exports = {
  sleep,
  isVideoFile,
  cleanName,
  loadPosterCache,
  savePosterCache,
  isGenericFolderName,
  normalizeTitle,
  generateSearchVariants,
  VIDEO_EXTENSIONS,
};