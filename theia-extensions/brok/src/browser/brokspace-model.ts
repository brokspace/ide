// *****************************************************************************
// Copyright (C) 2026 Brokspace contributors.
//
// SPDX-License-Identifier: MIT
// *****************************************************************************

import { Emitter, Event } from '@theia/core/lib/common/event';
import { Disposable, DisposableCollection } from '@theia/core/lib/common/disposable';
import { URI } from '@theia/core/lib/common/uri';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import { BrokClient, BrokInfo, BrokService, BrokStatus, MINIMUM_BROK_VERSION } from '../common/brok-protocol';

/** Receives streamed answer fragments from the backend. */
@injectable()
export class BrokClientImpl implements BrokClient {
    protected readonly onAnswerChunkEmitter = new Emitter<{ id: string; text: string }>();
    readonly onAnswerChunk$: Event<{ id: string; text: string }> = this.onAnswerChunkEmitter.event;

    onAnswerChunk(id: string, text: string): void {
        this.onAnswerChunkEmitter.fire({ id, text });
    }
}

export type BrokspaceState =
    | { kind: 'loading' }
    | { kind: 'no-folder' }
    | { kind: 'no-brok'; info: BrokInfo }
    | { kind: 'outdated'; info: BrokInfo }
    | { kind: 'not-initialized'; info: BrokInfo }
    | { kind: 'ready'; info: BrokInfo; status: BrokStatus }
    | { kind: 'error'; info: BrokInfo; message: string };

/**
 * What the sidebar and the status bar show: brok's status for the first
 * workspace folder, refreshed on demand, on folder changes and every few
 * seconds while the window has focus.
 */
@injectable()
export class BrokspaceModel implements Disposable {

    static readonly REFRESH_INTERVAL_MS = 15_000;

    @inject(BrokService) protected readonly service: BrokService;
    @inject(WorkspaceService) protected readonly workspaceService: WorkspaceService;

    protected readonly onDidChangeEmitter = new Emitter<BrokspaceState>();
    readonly onDidChange: Event<BrokspaceState> = this.onDidChangeEmitter.event;
    protected readonly toDispose = new DisposableCollection(this.onDidChangeEmitter);

    protected _state: BrokspaceState = { kind: 'loading' };
    protected info: BrokInfo | undefined;
    protected refreshing: Promise<BrokspaceState> | undefined;

    get state(): BrokspaceState {
        return this._state;
    }

    @postConstruct()
    protected init(): void {
        this.toDispose.push(this.workspaceService.onWorkspaceChanged(() => this.refresh()));
        const timer = setInterval(() => {
            if (document.hasFocus()) {
                this.refresh();
            }
        }, BrokspaceModel.REFRESH_INTERVAL_MS);
        this.toDispose.push(Disposable.create(() => clearInterval(timer)));
        this.workspaceService.ready.then(() => this.refresh());
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    /** The first workspace folder as a file system path. */
    get root(): string | undefined {
        const root = this.workspaceService.tryGetRoots()[0];
        return root ? root.resource.path.fsPath() : undefined;
    }

    get rootUri(): URI | undefined {
        return this.workspaceService.tryGetRoots()[0]?.resource;
    }

    refresh(): Promise<BrokspaceState> {
        this.refreshing ??= this.doRefresh().finally(() => { this.refreshing = undefined; });
        return this.refreshing;
    }

    protected async doRefresh(): Promise<BrokspaceState> {
        const root = this.root;
        let state: BrokspaceState;
        if (!root) {
            state = { kind: 'no-folder' };
        } else {
            this.info ??= await this.service.info();
            const info = this.info;
            if (!info.found) {
                this.info = undefined; // look again next time: brok may get installed
                state = { kind: 'no-brok', info };
            } else if (!isAtLeast(info.version, MINIMUM_BROK_VERSION)) {
                state = { kind: 'outdated', info };
            } else {
                try {
                    const status = await this.service.status(root);
                    state = status.initialized ? { kind: 'ready', info, status } : { kind: 'not-initialized', info };
                } catch (error) {
                    state = { kind: 'error', info, message: error instanceof Error ? error.message : String(error) };
                }
            }
        }
        this._state = state;
        this.onDidChangeEmitter.fire(state);
        return state;
    }
}

/** Compares dotted versions (`0.2.10` >= `0.2.4`); unknown versions pass. */
export function isAtLeast(version: string | undefined, minimum: string): boolean {
    if (!version) {
        return true;
    }
    const parse = (v: string) => v.split(/[.-]/).slice(0, 3).map(part => parseInt(part, 10) || 0);
    const [a, b] = [parse(version), parse(minimum)];
    for (let i = 0; i < 3; i++) {
        if (a[i] !== b[i]) {
            return a[i] > b[i];
        }
    }
    return true;
}
