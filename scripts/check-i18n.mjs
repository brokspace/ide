// Checks that every translation in theia-extensions/product/i18n has exactly
// the keys of nls.json, which `yarn i18n:extract` generates from the sources.
//
//   node scripts/check-i18n.mjs

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('../theia-extensions/product/i18n/', import.meta.url));
const keys = (object, prefix = '') => Object.entries(object).flatMap(([key, value]) =>
    typeof value === 'object' ? keys(value, `${prefix}${key}/`) : [`${prefix}${key}`]);
const load = file => new Set(keys(JSON.parse(readFileSync(join(dir, file), 'utf8'))));

const source = load('nls.json');
let failed = false;
for (const file of readdirSync(dir).filter(f => /^nls\..+\.json$/.test(f))) {
    const translated = load(file);
    const missing = [...source].filter(key => !translated.has(key));
    const extra = [...translated].filter(key => !source.has(key));
    if (missing.length || extra.length) {
        failed = true;
        console.error(`${file}:`);
        missing.forEach(key => console.error(`  missing ${key}`));
        extra.forEach(key => console.error(`  unused  ${key}`));
    } else {
        console.log(`${file}: ${translated.size} keys`);
    }
}
process.exit(failed ? 1 : 0);
