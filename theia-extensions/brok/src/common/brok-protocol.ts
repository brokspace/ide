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

/** Oldest brok with the JSON output the IDE relies on. */
export const MINIMUM_BROK_VERSION = '0.2.4';

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
    /** Any other brok command (start, stop, init, doctor, shard install...). */
    run(root: string, args: string[]): Promise<CommandResult>;
}

export const BrokClient = Symbol('BrokClient');
export interface BrokClient {
    onAnswerChunk(id: string, text: string): void;
}
