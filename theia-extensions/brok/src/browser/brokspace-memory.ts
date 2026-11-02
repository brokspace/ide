// *****************************************************************************
// Copyright (C) 2026 Brokspace contributors.
//
// SPDX-License-Identifier: MIT
// *****************************************************************************

import { Emitter, Event } from '@theia/core/lib/common/event';
import { DisposableCollection } from '@theia/core/lib/common/disposable';
import { URI } from '@theia/core/lib/common/uri';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { BrokService, Memory, MemoryInput, MemoryScope } from '../common/brok-protocol';
import { BrokspaceModel } from './brokspace-model';

/** Characters of each answer kept in a session memory. */
const SESSION_ANSWER_CHARS = 1_200;

/** One question and its answer, for a session memory. */
export interface SessionTurn {
    question: string;
    answer: string;
    sources: string[];
}

/**
 * Brokspace's memories in this window (`brok memory`): loaded when first
 * needed, reloaded after every change made here and when brok's status
 * says the counts changed (memories saved by coding agents or the CLI).
 */
@injectable()
export class BrokspaceMemory {

    @inject(BrokService) protected readonly service: BrokService;
    @inject(BrokspaceModel) protected readonly model: BrokspaceModel;

    protected readonly onDidChangeEmitter = new Emitter<void>();
    readonly onDidChange: Event<void> = this.onDidChangeEmitter.event;
    protected readonly toDispose = new DisposableCollection(this.onDidChangeEmitter);

    protected _memories: Memory[] = [];
    protected _error: string | undefined;
    protected loaded = false;
    protected loading: Promise<void> | undefined;
    protected counts = '';

    get memories(): Memory[] {
        return this._memories;
    }

    get error(): string | undefined {
        return this._error;
    }

    get isLoaded(): boolean {
        return this.loaded;
    }

    /** Whether brok keeps memories in this workspace. */
    get enabled(): boolean {
        const state = this.model.state;
        return state.kind === 'ready' && state.status.memory?.enabled !== false;
    }

    @postConstruct()
    protected init(): void {
        this.toDispose.push(this.model.onDidChange(state => {
            if (state.kind !== 'ready') {
                return;
            }
            const counts = JSON.stringify(state.status.memory?.counts ?? {});
            if (this.loaded && counts !== this.counts) {
                this.reload();
            }
            this.counts = counts;
        }));
    }

    /** Loads the memories once; later calls wait for the same load. */
    ensureLoaded(): Promise<void> {
        return this.loaded ? Promise.resolve() : this.reload();
    }

    reload(): Promise<void> {
        this.loading ??= this.doReload().finally(() => { this.loading = undefined; });
        return this.loading;
    }

    protected async doReload(): Promise<void> {
        const root = this.model.root;
        if (!root || !this.enabled) {
            this._memories = [];
        } else {
            try {
                this._memories = await this.service.memories(root);
                this._error = undefined;
            } catch (error) {
                this._error = error instanceof Error ? error.message : String(error);
            }
        }
        this.loaded = true;
        this.onDidChangeEmitter.fire();
    }

    async save(memory: MemoryInput): Promise<Memory | undefined> {
        const root = this.model.root;
        if (!root) {
            return undefined;
        }
        const saved = await this.service.saveMemory(root, memory);
        await this.reload();
        return saved;
    }

    async forget(memory: Pick<Memory, 'id' | 'scope'>): Promise<void> {
        const root = this.model.root;
        if (root) {
            await this.service.forgetMemory(root, memory.id, memory.scope);
            await this.reload();
        }
    }

    /**
     * Saves (or updates) the memory of a chat session: its questions, the
     * start of each answer and the sources, so later sessions can build on
     * it. Nothing happens when session memories are off in brok.yml.
     */
    async saveSession(sessionId: string, turns: SessionTurn[]): Promise<void> {
        const state = this.model.state;
        if (state.kind !== 'ready' || !turns.length || state.status.memory?.enabled === false || state.status.memory?.sessions === false) {
            return;
        }
        const body = turns.map(turn => {
            const answer = turn.answer.length > SESSION_ANSWER_CHARS ? `${turn.answer.slice(0, SESSION_ANSWER_CHARS).trimEnd()}…` : turn.answer;
            const sources = turn.sources.length ? `\n\nSources: ${turn.sources.map(source => `\`${source}\``).join(', ')}` : '';
            return `### ${turn.question}\n\n${answer}${sources}`;
        }).join('\n\n');
        await this.save({
            id: `session-${sessionId.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64)}`,
            title: oneLine(turns[0].question, 90),
            body,
            kind: 'session',
            scope: 'private',
            tags: ['chat'],
        });
    }
}

/** The file of a memory, to open in an editor. */
export function memoryUri(memory: Pick<Memory, 'path'>): URI {
    return URI.fromFilePath(memory.path);
}

/** Scopes in the order the IDE shows them. */
export const MEMORY_SCOPES: MemoryScope[] = ['private', 'shared', 'global'];

function oneLine(text: string, max: number): string {
    const line = text.replace(/\s+/g, ' ').trim();
    return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line;
}

/**
 * The file behind a search hit or a source: paths are relative to the
 * workspace root (`src/a.ts`, `../checkout/src/b.ts` for a linked
 * workspace) or absolute (global memories).
 */
export function resolveHitPath(root: URI, path: string): URI {
    if (/^([A-Za-z]:[\/]|\/)/.test(path)) {
        return URI.fromFilePath(path);
    }
    const parts = root.path.toString().replace(/\/$/, '').split('/');
    for (const part of path.split(/[\/]/)) {
        if (part === '..') {
            parts.pop();
        } else if (part && part !== '.') {
            parts.push(part);
        }
    }
    return root.withPath(parts.join('/'));
}
