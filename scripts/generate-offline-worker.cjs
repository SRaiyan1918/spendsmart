const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

function renderWorker(source, assets, version) {
  return source
    .replace(/^const CACHE_NAME = .*; \/\/ BUILD_CACHE_NAME$/m, `const CACHE_NAME = ${JSON.stringify(`spendsmart-offline-${version}`)}; // BUILD_CACHE_NAME`)
    .replace(/^const PRECACHE_ASSETS = .*; \/\/ BUILD_PRECACHE$/m, `const PRECACHE_ASSETS = ${JSON.stringify(assets)}; // BUILD_PRECACHE`);
}

if (require.main === module) {
  const root = path.resolve(__dirname, '..');
  const build = path.join(root, 'build');
  const assets = [];
  function walk(directory, prefix = '') {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const relative = prefix + entry.name;
      if (entry.isDirectory()) walk(path.join(directory, entry.name), relative + '/');
      else if (!relative.endsWith('.map') && !relative.endsWith('.LICENSE.txt') && relative !== 'sw-budget.js') assets.push(relative);
    }
  }
  walk(build);
  assets.sort();
  const source = fs.readFileSync(path.join(root, 'public/sw-budget.js'), 'utf8');
  const hash = createHash('sha256').update(source);
  const entries = assets.map(asset => {
    const bytes = fs.readFileSync(path.join(build, asset));
    hash.update(asset).update(bytes);
    return { url: asset, integrity: 'sha256-' + createHash('sha256').update(bytes).digest('base64') };
  });
  const version = hash.digest('hex').slice(0, 16);
  fs.writeFileSync(path.join(build, 'sw-budget.js'), renderWorker(source, entries, version));
  console.log(`Offline PWA: ${assets.length} files precached; release ${version}`);
}

module.exports = { renderWorker };
