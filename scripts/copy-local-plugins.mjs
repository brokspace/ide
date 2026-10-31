// Copies the plugins kept in this repository (plugins-local/*, e.g. the
// Brokspace theme) next to the downloaded ones in plugins/, where both
// applications load built-in plugins from.

import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const source = join(root, 'plugins-local');
const target = join(root, 'plugins');

mkdirSync(target, { recursive: true });
for (const name of readdirSync(source)) {
    const dest = join(target, name);
    if (existsSync(dest)) {
        rmSync(dest, { recursive: true, force: true });
    }
    cpSync(join(source, name), dest, { recursive: true });
    console.log(`plugins/${name}`);
}
