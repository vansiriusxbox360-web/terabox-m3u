const d = require('./data.js');
console.log('data.js CUSTOM_POSTERS present:', 'CUSTOM_POSTERS' in d);

const idx = require('./index.js');
console.log('index CUSTOM_POSTERS on idx:', idx.CUSTOM_POSTERS !== undefined);
console.log('index exports length:', Object.keys(idx).length);