// Renders the Homebrew cask (IDE) and formula (brok CLI) from their
// templates, with versions and checksums read from the GitHub releases.
//
//   node packaging/homebrew/render.mjs --ide 0.1.0 --out ../homebrew-tap
//   node packaging/homebrew/render.mjs --brok 0.2.4 --agent 0.2.1 --out ../homebrew-tap
//
// Writes <out>/Casks/brokspace-ide.rb and/or <out>/Formula/brok.rb.
// Release assets must have `.sha256` files (the release workflows add them).

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, arg, i, all) =>
    arg.startsWith('--') ? [...pairs, [arg.slice(2), all[i + 1]]] : pairs, []));
const here = dirname(fileURLToPath(import.meta.url));
const out = args.out ?? '.';

async function sha256(repo, tag, asset) {
    const url = `https://github.com/${repo}/releases/download/${tag}/${asset}.sha256`;
    const response = await fetch(url, { redirect: 'follow', headers: { 'user-agent': 'brokspace-homebrew' } });
    if (!response.ok) {
        throw new Error(`${url}: ${response.status}`);
    }
    return (await response.text()).trim().split(/\s+/)[0];
}

function render(template, values, target) {
    let text = readFileSync(join(here, template), 'utf8');
    for (const [key, value] of Object.entries(values)) {
        text = text.replaceAll(`{{${key}}}`, value);
    }
    if (/\{\{[A-Z0-9_]+\}\}/.test(text)) {
        throw new Error(`${template}: unfilled placeholders`);
    }
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, text);
    console.log(target);
}

if (args.ide) {
    const v = args.ide;
    const tag = `v${v}`;
    render('brokspace-ide.rb.template', {
        VERSION: v,
        SHA256_ARM64: await sha256('brokspace/ide', tag, `BrokspaceIDE-${v}-macos-arm64.dmg`),
        SHA256_X64: await sha256('brokspace/ide', tag, `BrokspaceIDE-${v}-macos-x64.dmg`),
    }, join(out, 'Casks', 'brokspace-ide.rb'));
}

if (args.brok) {
    const brok = args.brok;
    const agent = args.agent;
    if (!agent) {
        throw new Error('--agent <version> is required with --brok');
    }
    const values = { BROK_VERSION: brok, AGENT_VERSION: agent };
    for (const platform of ['macos-aarch64', 'macos-x86_64', 'linux-aarch64', 'linux-x86_64']) {
        const key = platform.toUpperCase().replace('-', '_');
        values[`BROK_SHA256_${key}`] = await sha256('brokspace/brok', `v${brok}`, `brok-${platform}`);
        values[`AGENT_SHA256_${key}`] = await sha256('brokspace/brok-agent', `v${agent}`, `brok-agent-${platform}`);
    }
    render('brok.rb.template', values, join(out, 'Formula', 'brok.rb'));
}
