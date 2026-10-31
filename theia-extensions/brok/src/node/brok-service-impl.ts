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
    AnswerDone, AnswerRequest, BrokClient, BrokInfo, BrokService, BrokStatus, CommandResult, SearchHit, SkillInfo
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

    protected exec(cwd: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
        return new Promise((resolve, reject) => {
            execFile(this.executable, args, { cwd, env: this.env(), maxBuffer: 32 * 1024 * 1024, windowsHide: true },
                (error, stdout, stderr) => {
                    if (error) {
                        reject(new Error(cleanError(stderr) || error.message));
                    } else {
                        resolve({ stdout, stderr });
                    }
                });
        });
    }

    protected env(): NodeJS.ProcessEnv {
        // No colors or spinners: output is parsed or shown as plain text.
        return { ...process.env, NO_COLOR: '1', CLICOLOR: '0', TERM: 'dumb' };
    }
}

/** brok prints `error: <message>`; keep the message. */
export function cleanError(stderr: string): string {
    const lines = stderr.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    const error = lines.reverse().find(line => line.startsWith('error:'));
    return (error ? error.slice('error:'.length) : lines[0] ?? '').trim();
}
