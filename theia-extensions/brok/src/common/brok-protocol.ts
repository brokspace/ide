// *****************************************************************************
// Copyright (C) 2026 Brokspace contributors.
//
// SPDX-License-Identifier: MIT
// *****************************************************************************

import { RpcServer } from '@theia/core/lib/common/messaging/proxy-factory';

/**
 * The IDE talks to Brokspace through the `brok` CLI and its `--json` output
 * (docs/integrations.md in brokspace/brok): one contract for the IDE, other
 * editors and scripts.
 */
export const BROK_SERVICE_PATH = '/services/brokspace';

/** Oldest brok with the JSON output the IDE relies on (memory, links, config). */
export const MINIMUM_BROK_VERSION = '0.3.0';

export interface BrokInfo {
    /** Whether a working `brok` was found. */
    found: boolean;
    /** The executable used (absolute when bundled or configured). */
    path: string;
    version?: string;
    /** Why `brok` could not be used. */
    error?: string;
}

/** `brok status --json`. */
export interface BrokStatus {
    version: string;
    initialized: boolean;
    root?: string;
    daemon?: { running: boolean };
    backends?: string[];
    embeddings?: { enabled: boolean; model: string; dimensions: number };
    llm?: { provider: string; model?: string | null; base_url?: string | null };
    index?: IndexPartition[];
    shards?: ShardInfo[];
    links?: LinkStatus[];
    memory?: { enabled: boolean; sessions: boolean; global: boolean; counts: Record<MemoryScope, number> };
}

export type MemoryScope = 'private' | 'shared' | 'global';
export type MemoryKind = 'note' | 'decision' | 'fact' | 'session' | 'handoff';

/** One entry of `brok memory list --json`. */
export interface Memory {
    id: string;
    title: string;
    kind: MemoryKind | 'link';
    scope: MemoryScope;
    tags: string[];
    created: string;
    updated: string;
    source?: string;
    body: string;
    /** Absolute path of the Markdown file. */
    path: string;
}

/** What to remember (`brok memory add`). */
export interface MemoryInput {
    title: string;
    body?: string;
    kind?: MemoryKind;
    scope?: MemoryScope;
    tags?: string[];
    /** Replaces the memory with this id (same scope). */
    id?: string;
    /** Who writes it: `ide` by default. */
    source?: string;
}

/** One entry of `brok link list --json`. */
export interface LinkStatus {
    name: string;
    kind: 'local' | 'git';
    /** The sources, relative to the workspace when possible. */
    root: string;
    /** Absolute directory of the sources. */
    path: string;
    git?: string;
    branch?: string;
    description?: string;
    memory: boolean;
    index: 'own' | 'managed';
    exists: boolean;
    files: number;
    chunks: number;
    error?: string;
}

/** What to link (`brok link add`). */
export interface LinkInput {
    name: string;
    /** A directory or a git URL. */
    target: string;
    branch?: string;
    description?: string;
    memory?: boolean;
}

export interface IndexPartition {
    tier: string;
    path: string;
    files: number;
    chunks: number;
    backend: string;
    semantic: boolean;
}

export interface ShardInfo {
    name: string;
    version: string;
    description: string;
    state: 'enabled' | 'disabled' | 'skills' | 'missing-binary';
    source?: string | null;
}

/** A shard's `shard.json` (the fields the IDE shows). */
export interface ShardManifest {
    name: string;
    version: string;
    description: string;
    authors?: string[];
    license?: string | null;
    repository?: string | null;
    runtime?: string;
    skills?: string[];
    permissions?: {
        filesystem?: { read?: string[]; write?: string[] };
        network?: boolean;
        process?: string[];
        env?: string[];
    };
    subscribes_to?: string[];
    publishes_to?: string[];
}

/** `brok shard info <name>`: the manifest and where the shard comes from. */
export interface ShardDetails {
    manifest: ShardManifest;
    source?: string;
    binary?: string;
    skills: string[];
}

/** One hit of `brok search --json`. */
export interface SearchHit {
    path: string;
    start_line: number;
    end_line: number;
    kind: string;
    symbol?: string | null;
    score: number;
    content: string;
    partition?: string;
}

/** One entry of `brok skill list --json`. */
export interface SkillInfo {
    name: string;
    description: string;
    user_invoked: boolean;
    source: string;
    bucket?: string | null;
}

export interface SourceRef {
    path: string;
    start_line: number;
    end_line: number;
    symbol?: string;
}

export interface ConversationTurn {
    role: 'user' | 'assistant';
    content: string;
}

/** What to stream an answer for. */
export type AnswerRequest =
    | { kind: 'ask'; prompt: string; history?: ConversationTurn[] }
    | { kind: 'review'; staged?: boolean; base?: string }
    | { kind: 'skill'; name: string; input: string };

export interface AnswerDone {
    provider?: string;
    model?: string;
    sources: SourceRef[];
}

/** `brok config get --json`: the parts of brok.yml the IDE edits. */
export interface BrokConfig {
    workspace: { submodules: boolean; links: Record<string, { path?: string; git?: string; branch?: string; description?: string; memory?: boolean }> };
    index: { include: string[]; exclude: string[]; max_file_kb: number; max_chunk_lines: number; store: string };
    embeddings: { enabled: boolean; model: string; variant: string; dimensions: number; device: string; batch_size: number };
    search: { limit: number; cold_weight: number; link_weight: number };
    memory: { enabled: boolean; sessions: boolean; global: boolean };
    llm: { default: string; providers: Record<string, LlmProvider> };
    [section: string]: unknown;
}

export interface LlmProvider {
    base_url: string;
    model: string;
    api_key_env?: string;
    temperature?: number;
    max_tokens?: number;
}

export interface CommandResult {
    code: number;
    stdout: string;
    stderr: string;
}

export const BrokService = Symbol('BrokService');
export interface BrokService extends RpcServer<BrokClient> {
    info(): Promise<BrokInfo>;
    status(root: string): Promise<BrokStatus>;
    search(root: string, query: string, limit: number): Promise<SearchHit[]>;
    skills(root: string): Promise<SkillInfo[]>;
    shardInfo(root: string, name: string): Promise<ShardDetails>;
    /**
     * Streams an answer: text fragments arrive through `BrokClient.onAnswerChunk`
     * with the same `id`; the promise resolves when the answer is complete.
     */
    answer(id: string, root: string, request: AnswerRequest): Promise<AnswerDone>;
    cancel(id: string): Promise<void>;
    /** `brok commit --print`: a commit message for the staged changes. */
    commitMessage(root: string): Promise<string>;
    /** `brok memory list --json`: every memory, newest first. */
    memories(root: string): Promise<Memory[]>;
    /** `brok memory search --json`: memories as search hits. */
    searchMemories(root: string, query: string, limit: number): Promise<SearchHit[]>;
    /** `brok memory add --json`; `undefined` when brok did not save it (session memories turned off). */
    saveMemory(root: string, memory: MemoryInput): Promise<Memory | undefined>;
    forgetMemory(root: string, id: string, scope?: MemoryScope): Promise<void>;
    /** `brok config get --json`: the whole brok.yml. */
    config(root: string): Promise<BrokConfig>;
    /** `brok config set <key> <value>` (`value` is YAML; JSON is YAML too). */
    setConfig(root: string, key: string, value: unknown): Promise<void>;
    /** `brok config unset <key>`: back to the default. */
    unsetConfig(root: string, key: string): Promise<void>;
    addLink(root: string, link: LinkInput): Promise<void>;
    removeLink(root: string, name: string): Promise<void>;
    /** `brok link sync --json`: pulls git links, re-indexes the ones brok manages. */
    syncLinks(root: string, names?: string[]): Promise<{ name: string; error?: string }[]>;
    /** Any other brok command (start, stop, init, doctor, shard install...). */
    run(root: string, args: string[]): Promise<CommandResult>;
}

export const BrokClient = Symbol('BrokClient');
export interface BrokClient {
    onAnswerChunk(id: string, text: string): void;
}
