// *****************************************************************************
// Copyright (C) 2026 Brokspace contributors.
//
// SPDX-License-Identifier: MIT
// *****************************************************************************

import { ChildProcess, execFile, spawn } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as readline from 'readline';
import { injectable } from '@theia/core/shared/inversify';
import {
    AnswerDone, AnswerRequest, BrokClient, BrokConfig, BrokInfo, BrokService, BrokStatus, CommandResult, LinkInput, Memory, MemoryInput,
    MemoryScope, SearchHit, ShardDetails, ShardManifest, SkillInfo
} from '../common/brok-protocol';

const EXE = process.platform === 'win32' ? 'brok.exe' : 'brok';

/**
 * Finds `brok`: `BROK_PATH` when set, the copy shipped with the IDE
 * (`BROKSPACE_BIN`, set by the Electron main process), otherwise `PATH`.
 */
export function resolveBrok(env: NodeJS.ProcessEnv = process.env): string {
    if (env.BROK_PATH) {
        return env.BROK_PATH;
    }
    if (env.BROKSPACE_BIN) {
        const bundled = path.join(env.BROKSPACE_BIN, EXE);
        if (fs.existsSync(bundled)) {
            return bundled;
        }
    }
    return 'brok';
}

/** One per frontend connection: answers stream back to that window only. */
@injectable()
export class BrokServiceImpl implements BrokService {

    protected client: BrokClient | undefined;
    protected readonly answers = new Map<string, ChildProcess>();
    protected readonly executable = resolveBrok();

    setClient(client: BrokClient | undefined): void {
        this.client = client;
    }

    dispose(): void {
        for (const child of this.answers.values()) {
            child.kill();
        }
        this.answers.clear();
    }

    async info(): Promise<BrokInfo> {
        try {
            const { stdout } = await this.exec(os.homedir(), ['--version']);
            return { found: true, path: this.executable, version: stdout.trim().split(/\s+/).pop() };
        } catch (error) {
            return { found: false, path: this.executable, error: String(error instanceof Error ? error.message : error) };
        }
    }

    async status(root: string): Promise<BrokStatus> {
        return this.json<BrokStatus>(root, ['status', '--json']);
    }

    async search(root: string, query: string, limit: number): Promise<SearchHit[]> {
        const result = await this.json<{ hits: SearchHit[] }>(root, ['search', '--json', '-n', String(limit), '--', query]);
        return result.hits ?? [];
    }

    async skills(root: string): Promise<SkillInfo[]> {
        return this.json<SkillInfo[]>(root, ['skill', 'list', '--json']);
    }

    async shardInfo(root: string, name: string): Promise<ShardDetails> {
        const { stdout } = await this.exec(root, ['shard', 'info', name]);
        return parseShardInfo(stdout);
    }

    async answer(id: string, root: string, request: AnswerRequest): Promise<AnswerDone> {
        let historyFile: string | undefined;
        const args = ((): string[] => {
            switch (request.kind) {
                case 'ask': {
                    const base = ['ask', '--json'];
                    if (request.history?.length) {
                        historyFile = path.join(os.tmpdir(), `brokspace-history-${process.pid}-${id}.json`);
                        fs.writeFileSync(historyFile, JSON.stringify(request.history));
                        base.push('--history', historyFile);
                    }
                    return [...base, '--', request.prompt];
                }
                case 'review':
                    return ['review', '--json', ...(request.staged ? ['--staged'] : []), ...(request.base ? ['--base', request.base] : [])];
                case 'skill':
                    return ['skill', 'run', '--json', request.name, '--', ...(request.input ? [request.input] : [])];
            }
        })();

        const child = spawn(this.executable, args, { cwd: root, env: this.env(), windowsHide: true });
        this.answers.set(id, child);
        let stderr = '';
        child.stderr.on('data', data => { stderr += data.toString(); });
        let done: AnswerDone | undefined;
        const lines = readline.createInterface({ input: child.stdout });
        lines.on('line', line => {
            let event: { type?: string; text?: string } & Partial<AnswerDone>;
            try {
                event = JSON.parse(line);
            } catch {
                return; // not an event (an older brok, or a stray line)
            }
            if (event.type === 'chunk' && event.text) {
                this.client?.onAnswerChunk(id, event.text);
            } else if (event.type === 'done') {
                done = { provider: event.provider, model: event.model, sources: event.sources ?? [] };
            }
        });
        try {
            const code = await new Promise<number | null>((resolve, reject) => {
                child.on('error', reject);
                child.on('close', resolve);
            });
            if (done) {
                return done;
            }
            if (child.killed) {
                throw new Error('Cancelled');
            }
            throw new Error(cleanError(stderr) || `brok exited with code ${code}`);
        } finally {
            this.answers.delete(id);
            if (historyFile) {
                fs.rm(historyFile, { force: true }, () => { /* best effort */ });
            }
        }
    }

    async cancel(id: string): Promise<void> {
        this.answers.get(id)?.kill();
    }

    async commitMessage(root: string): Promise<string> {
        const { stdout } = await this.exec(root, ['commit', '--print']);
        return stdout.trim();
    }

    async memories(root: string): Promise<Memory[]> {
        return this.json<Memory[]>(root, ['memory', 'list', '--json']);
    }

    async searchMemories(root: string, query: string, limit: number): Promise<SearchHit[]> {
        return this.json<SearchHit[]>(root, ['memory', 'search', '--json', '-n', String(limit), '--', query]);
    }

    async saveMemory(root: string, memory: MemoryInput): Promise<Memory | undefined> {
        const args = ['memory', 'add', '--json', '--stdin', '--kind', memory.kind ?? 'note', '--scope', memory.scope ?? 'private',
            '--source', memory.source ?? 'ide'];
        if (memory.id) {
            args.push('--id', memory.id);
        }
        for (const tag of memory.tags ?? []) {
            args.push('--tag', tag);
        }
        args.push('--', memory.title);
        const { stdout } = await this.exec(root, args, memory.body ?? '');
        const saved = JSON.parse(stdout) as Memory | { saved: false };
        return 'id' in saved ? saved : undefined;
    }

    async forgetMemory(root: string, id: string, scope?: MemoryScope): Promise<void> {
        await this.exec(root, ['memory', 'forget', '--json', ...(scope ? ['--scope', scope] : []), '--', id]);
    }

    async config(root: string): Promise<BrokConfig> {
        return this.json<BrokConfig>(root, ['config', 'get', '--json']);
    }

    async setConfig(root: string, key: string, value: unknown): Promise<void> {
        // JSON is YAML: strings stay strings ("true" is not a boolean), lists and maps keep their shape.
        await this.exec(root, ['config', 'set', '--', key, JSON.stringify(value)]);
    }

    async unsetConfig(root: string, key: string): Promise<void> {
        await this.exec(root, ['config', 'unset', '--', key]);
    }

    async addLink(root: string, link: LinkInput): Promise<void> {
        const args = ['link', 'add', '--json'];
        if (link.branch) {
            args.push('--branch', link.branch);
        }
        if (link.description) {
            args.push('--description', link.description);
        }
        if (link.memory === false) {
            args.push('--no-memory');
        }
        await this.exec(root, [...args, '--', link.name, link.target]);
    }

    async removeLink(root: string, name: string): Promise<void> {
        await this.exec(root, ['link', 'remove', '--json', '--', name]);
    }

    async syncLinks(root: string, names: string[] = []): Promise<{ name: string; error?: string }[]> {
        return this.json(root, ['link', 'sync', '--json', ...(names.length ? ['--', ...names] : [])]);
    }

    async run(root: string, args: string[]): Promise<CommandResult> {
        return new Promise(resolve => {
            execFile(this.executable, args, { cwd: root, env: this.env(), maxBuffer: 32 * 1024 * 1024, windowsHide: true },
                (error, stdout, stderr) => {
                    const code = error ? (typeof error.code === 'number' ? error.code : 1) : 0;
                    resolve({ code, stdout, stderr: stderr || (error && !stdout ? error.message : '') });
                });
        });
    }

    protected async json<T>(root: string, args: string[]): Promise<T> {
        const { stdout } = await this.exec(root, args);
        return JSON.parse(stdout) as T;
    }

    /** Runs brok; `input` goes to its stdin. */
    protected exec(cwd: string, args: string[], input?: string): Promise<{ stdout: string; stderr: string }> {
        return new Promise((resolve, reject) => {
            const child = execFile(this.executable, args, { cwd, env: this.env(), maxBuffer: 32 * 1024 * 1024, windowsHide: true },
                (error, stdout, stderr) => {
                    if (error) {
                        reject(new Error(cleanError(stderr) || error.message));
                    } else {
                        resolve({ stdout, stderr });
                    }
                });
            if (input !== undefined) {
                child.stdin?.end(input);
            }
        });
    }

    protected env(): NodeJS.ProcessEnv {
        // No colors or spinners: output is parsed or shown as plain text.
        return { ...process.env, NO_COLOR: '1', CLICOLOR: '0', TERM: 'dumb' };
    }
}

/**
 * `brok shard info` prints the pretty-printed `shard.json`, then
 * `source:`, `sha256:`, `binary:` and `skills:` lines.
 */
export function parseShardInfo(stdout: string): ShardDetails {
    const lines = stdout.split(/\r?\n/);
    const end = lines.findIndex(line => line === '}');
    const manifest = JSON.parse(lines.slice(0, end + 1).join('\n')) as ShardManifest;
    const details: ShardDetails = { manifest, skills: [] };
    for (const line of lines.slice(end + 1)) {
        const match = /^(source|binary|skills):\s+(.*)$/.exec(line);
        if (!match) {
            continue;
        }
        const [, key, value] = match;
        if (key === 'skills') {
            details.skills.push(value);
        } else if (key === 'source') {
            details.source = value;
        } else if (!value.startsWith('none')) {
            details.binary = value;
        }
    }
    return details;
}

/** brok prints `error: <message>`; keep the message. */
export function cleanError(stderr: string): string {
    const lines = stderr.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    const error = lines.reverse().find(line => line.startsWith('error:'));
    return (error ? error.slice('error:'.length) : lines[0] ?? '').trim();
}
