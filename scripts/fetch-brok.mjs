// Downloads brok and brok-agent for the platform being packaged into
// applications/electron/resources/bin, verified against the release
// checksums. electron-builder ships that folder as resources/bin.
//
//   node scripts/fetch-brok.mjs                     # this machine
//   node scripts/fetch-brok.mjs --platform macos --arch aarch64
//   BROK_VERSION=0.2.4 BROK_AGENT_VERSION=0.2.1 node scripts/fetch-brok.mjs
//
// GITHUB_TOKEN (optional) lifts GitHub's anonymous rate limit in CI.

import { createHash } from 'node:crypto';
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, arg, i, all) =>
    arg.startsWith('--') ? [...pairs, [arg.slice(2), all[i + 1]]] : pairs, []));

const platform = args.platform ?? { win32: 'windows', darwin: 'macos', linux: 'linux' }[process.platform];
const arch = args.arch ?? { x64: 'x86_64', arm64: 'aarch64' }[process.arch];
if (!platform || !arch) {
    throw new Error(`unsupported platform ${process.platform}/${process.arch}`);
}
const exe = platform === 'windows' ? '.exe' : '';
const out = join(fileURLToPath(new URL('..', import.meta.url)), 'applications', 'electron', 'resources', 'bin');

const headers = { 'user-agent': 'brokspace-ide-build', accept: 'application/vnd.github+json' };
if (process.env.GITHUB_TOKEN) {
    headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
}

async function release(repo, version) {
    const url = version
        ? `https://api.github.com/repos/${repo}/releases/tags/v${version}`
        : `https://api.github.com/repos/${repo}/releases/latest`;
    const response = await fetch(url, { headers });
    if (!response.ok) {
        throw new Error(`${url}: ${response.status} ${response.statusText}`);
    }
    return response.json();
}

async function download(url) {
    const response = await fetch(url, { headers: { 'user-agent': headers['user-agent'] }, redirect: 'follow' });
    if (!response.ok) {
        throw new Error(`${url}: ${response.status} ${response.statusText}`);
    }
    return Buffer.from(await response.arrayBuffer());
}

async function fetchBinary(repo, program, version) {
    const rel = await release(repo, version);
    const name = `${program}-${platform}-${arch}${exe}`;
    const asset = rel.assets.find(a => a.name === name);
    const checksum = rel.assets.find(a => a.name === `${name}.sha256`);
    if (!asset || !checksum) {
        throw new Error(`${repo} ${rel.tag_name} has no ${name} (or its .sha256)`);
    }
    const expected = (await download(checksum.browser_download_url)).toString('utf8').trim().split(/\s+/)[0].toLowerCase();
    const binary = await download(asset.browser_download_url);
    const actual = createHash('sha256').update(binary).digest('hex');
    if (actual !== expected) {
        throw new Error(`${name}: checksum mismatch (expected ${expected}, got ${actual})`);
    }
    const target = join(out, `${program}${exe}`);
    writeFileSync(target, binary);
    chmodSync(target, 0o755);
    console.log(`${program} ${rel.tag_name} (${platform}-${arch}) -> ${target}`);
}

mkdirSync(out, { recursive: true });
await fetchBinary('brokspace/brok', 'brok', process.env.BROK_VERSION);
await fetchBinary('brokspace/brok-agent', 'brok-agent', process.env.BROK_AGENT_VERSION);
