// *****************************************************************************
// Copyright (C) 2026 Brokspace contributors.
//
// SPDX-License-Identifier: MIT
// *****************************************************************************

import * as React from '@theia/core/shared/react';
import { CommandService } from '@theia/core/lib/common/command';
import { codicon } from '@theia/core/lib/browser/widgets/widget';
import { ReactWidget } from '@theia/core/lib/browser/widgets/react-widget';
import { Message } from '@theia/core/lib/browser/widgets/widget';
import { OpenerService, open } from '@theia/core/lib/browser/opener-service';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { BrokService, SearchHit, SkillInfo } from '../common/brok-protocol';
import { BrokspaceCommands } from './brokspace-commands';
import { BrokspaceModel, BrokspaceState } from './brokspace-model';

/** The Brokspace view in the left sidebar. */
@injectable()
export class BrokspaceWidget extends ReactWidget {

    static readonly ID = 'brokspace-view';
    static readonly LABEL = 'Brokspace';

    @inject(BrokspaceModel) protected readonly model: BrokspaceModel;
    @inject(BrokService) protected readonly service: BrokService;
    @inject(CommandService) protected readonly commands: CommandService;
    @inject(OpenerService) protected readonly opener: OpenerService;

    protected query = '';
    protected hits: SearchHit[] = [];
    protected searching = false;
    protected searchError: string | undefined;
    protected skills: SkillInfo[] = [];
    protected searchInput: HTMLInputElement | null = null;

    @postConstruct()
    protected init(): void {
        this.id = BrokspaceWidget.ID;
        this.title.label = BrokspaceWidget.LABEL;
        this.title.caption = 'Brokspace: search, agents, skills and shards';
        this.title.iconClass = 'brokspace-view-icon';
        this.title.closable = true;
        this.addClass('brokspace-widget');
        this.toDispose.push(this.model.onDidChange(state => {
            if (state.kind === 'ready' && !this.skills.length) {
                this.loadSkills();
            }
            this.update();
        }));
        this.update();
    }

    protected override onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg);
        (this.searchInput ?? this.node).focus();
        this.model.refresh();
    }

    focusSearch(): void {
        this.searchInput?.focus();
        this.searchInput?.select();
    }

    protected async loadSkills(): Promise<void> {
        const root = this.model.root;
        if (root) {
            try {
                this.skills = await this.service.skills(root);
                this.update();
            } catch {
                // Skills are optional in the view.
            }
        }
    }

    protected render(): React.ReactNode {
        const state = this.model.state;
        return <div className='bk-view'>
            {this.renderHeader(state)}
            {this.renderBody(state)}
        </div>;
    }

    protected renderHeader(state: BrokspaceState): React.ReactNode {
        const running = state.kind === 'ready' && state.status.daemon?.running;
        const pill = state.kind === 'ready'
            ? <span className={`bk-pill ${running ? 'bk-pill-on' : ''}`}>{running ? 'Running' : 'Stopped'}</span>
            : undefined;
        return <div className='bk-header'>
            <div className='bk-mark' />
            <div className='bk-title'>Brokspace</div>
            {pill}
            <button className={`bk-icon-button ${codicon('refresh')}`} title='Refresh' onClick={() => this.model.refresh()} />
        </div>;
    }

    protected renderBody(state: BrokspaceState): React.ReactNode {
        switch (state.kind) {
            case 'loading':
                return <div className='bk-empty'>Loading…</div>;
            case 'no-folder':
                return this.card('Open a folder', 'Brokspace works on the folder you open: one repository or a folder of several.',
                    'Open Folder…', () => this.commands.executeCommand('workspace:openFolder'));
            case 'no-brok':
                return this.card('brok was not found', `The IDE could not run ${state.info.path}. ${state.info.error ?? ''}`,
                    'Install brok', () => this.commands.executeCommand(BrokspaceCommands.INSTALL_HELP.id));
            case 'outdated':
                return this.card(`brok ${state.info.version} is too old`, 'This IDE needs brok 0.2.4 or newer. Run "brok upgrade" in a terminal.',
                    'Open Terminal', () => this.commands.executeCommand('terminal:new'));
            case 'not-initialized':
                return this.card('Set up Brokspace here', 'Indexes this folder for search, finds your local LLM and connects coding agents. '
                    + 'Downloads the search model once (about 140 MB).', 'Set Up Workspace', () => this.commands.executeCommand(BrokspaceCommands.SETUP.id));
            case 'error':
                return this.card('Something went wrong', state.message, 'Run Doctor', () => this.commands.executeCommand(BrokspaceCommands.DOCTOR.id));
            case 'ready':
                return <>
                    {this.renderWorkspace(state)}
                    {this.renderSearch()}
                    {this.renderActions()}
                    {this.renderSkills()}
                    {this.renderShards(state)}
                </>;
        }
    }

    protected card(title: string, text: string, action: string, run: () => void): React.ReactNode {
        return <div className='bk-card'>
            <div className='bk-card-title'>{title}</div>
            <div className='bk-card-text'>{text}</div>
            <button className='theia-button main bk-card-button' onClick={run}>{action}</button>
        </div>;
    }

    protected renderWorkspace(state: Extract<BrokspaceState, { kind: 'ready' }>): React.ReactNode {
        const { status } = state;
        const running = !!status.daemon?.running;
        const files = (status.index ?? []).reduce((sum, p) => sum + p.files, 0);
        const chunks = (status.index ?? []).reduce((sum, p) => sum + p.chunks, 0);
        const hybrid = (status.index ?? []).some(p => p.semantic);
        const llm = status.llm?.model ? `${status.llm.model} · ${status.llm.provider}` : status.llm?.provider ?? 'none';
        return <section className='bk-section'>
            <h3 className='bk-section-title'>Workspace</h3>
            <dl className='bk-facts'>
                <dt>Service</dt>
                <dd>
                    <span className={`bk-dot ${running ? 'bk-dot-on' : ''}`} />{running ? 'Running' : 'Stopped'}
                    <button className='bk-link' onClick={() => this.commands.executeCommand(running ? BrokspaceCommands.STOP.id : BrokspaceCommands.START.id)}>
                        {running ? 'Stop' : 'Start'}
                    </button>
                </dd>
                <dt>Index</dt>
                <dd>{files.toLocaleString()} files · {chunks.toLocaleString()} chunks · {hybrid ? 'hybrid' : 'text'}</dd>
                <dt>Model</dt>
                <dd title={status.llm?.base_url ?? ''}>{llm}</dd>
                <dt>brok</dt>
                <dd>{state.info.version}</dd>
            </dl>
        </section>;
    }

    protected renderSearch(): React.ReactNode {
        return <section className='bk-section'>
            <h3 className='bk-section-title'>Search</h3>
            <form className='bk-search' onSubmit={e => { e.preventDefault(); this.search(); }}>
                <span className={codicon('search')} />
                <input
                    ref={input => { this.searchInput = input; }}
                    className='theia-input bk-search-input'
                    placeholder='Find code by meaning or name'
                    spellCheck={false}
                    defaultValue={this.query}
                    onChange={e => { this.query = e.currentTarget.value; }}
                />
            </form>
            {this.searching && <div className='bk-muted'>Searching…</div>}
            {this.searchError && <div className='bk-error'>{this.searchError}</div>}
            <ul className='bk-hits'>
                {this.hits.map(hit => <li key={`${hit.path}:${hit.start_line}`} className='bk-hit' onClick={() => this.openHit(hit)}
                    title={hit.content}>
                    <div className='bk-hit-head'>
                        <span className='bk-hit-symbol'>{hit.symbol || hit.kind}</span>
                        <span className='bk-hit-score'>{hit.score.toFixed(2)}</span>
                    </div>
                    <div className='bk-hit-path'>{hit.path}:{hit.start_line}</div>
                    <div className='bk-hit-snippet'>{firstLine(hit.content)}</div>
                </li>)}
            </ul>
        </section>;
    }

    protected renderActions(): React.ReactNode {
        const action = (icon: string, label: string, command: string) =>
            <button className='bk-action' onClick={() => this.commands.executeCommand(command)}>
                <span className={codicon(icon)} />{label}
            </button>;
        return <section className='bk-section'>
            <h3 className='bk-section-title'>Agent</h3>
            <div className='bk-actions'>
                {action('comment-discussion', 'Ask Brokspace', BrokspaceCommands.ASK.id)}
                {action('checklist', 'Review changes', BrokspaceCommands.REVIEW.id)}
                {action('git-commit', 'Commit message', BrokspaceCommands.COMMIT_MESSAGE.id)}
            </div>
        </section>;
    }

    protected renderSkills(): React.ReactNode {
        if (!this.skills.length) {
            return undefined;
        }
        const group = (title: string, userInvoked: boolean) => {
            const skills = this.skills.filter(skill => skill.user_invoked === userInvoked);
            return skills.length ? <>
                <div className='bk-subtitle'>{title}</div>
                <ul className='bk-list'>
                    {skills.map(skill => <li key={skill.name} className='bk-row' title={skill.description}>
                        <span className='bk-row-name'>{skill.name}</span>
                        <span className='bk-row-meta'>{skill.source}</span>
                        <button className={`bk-icon-button ${codicon('play')}`} title={`Run ${skill.name}`}
                            onClick={() => this.commands.executeCommand(BrokspaceCommands.RUN_SKILL.id, skill.name)} />
                    </li>)}
                </ul>
            </> : undefined;
        };
        return <section className='bk-section'>
            <h3 className='bk-section-title'>Skills</h3>
            {group('Workflows', true)}
            {group('Used by agents', false)}
        </section>;
    }

    protected renderShards(state: Extract<BrokspaceState, { kind: 'ready' }>): React.ReactNode {
        const shards = state.status.shards ?? [];
        return <section className='bk-section'>
            <h3 className='bk-section-title'>
                Shards
                <button className={`bk-icon-button ${codicon('add')}`} title='Install a shard'
                    onClick={() => this.commands.executeCommand(BrokspaceCommands.INSTALL_SHARD.id)} />
            </h3>
            <ul className='bk-list'>
                {shards.map(shard => <li key={shard.name} className='bk-row' title={shard.description}>
                    <span className={`bk-dot ${shard.state === 'enabled' ? 'bk-dot-on' : ''}`} />
                    <span className='bk-row-name'>{shard.name}</span>
                    <span className='bk-row-meta'>{shard.version} · {shard.state}</span>
                    {shard.source !== 'builtin' && <button className={`bk-icon-button ${codicon('trash')}`} title={`Remove ${shard.name}`}
                        onClick={() => this.commands.executeCommand(BrokspaceCommands.REMOVE_SHARD.id, shard.name)} />}
                </li>)}
            </ul>
        </section>;
    }

    protected async search(): Promise<void> {
        const root = this.model.root;
        const query = this.query.trim();
        if (!root || !query) {
            return;
        }
        this.searching = true;
        this.searchError = undefined;
        this.update();
        try {
            this.hits = await this.service.search(root, query, 20);
            if (!this.hits.length) {
                this.searchError = 'No results. Try other words, or check that the index is up to date.';
            }
        } catch (error) {
            this.hits = [];
            this.searchError = error instanceof Error ? error.message : String(error);
        } finally {
            this.searching = false;
            this.update();
        }
    }

    protected openHit(hit: SearchHit): void {
        const root = this.model.rootUri;
        if (!root) {
            return;
        }
        const line = Math.max(0, hit.start_line - 1);
        open(this.opener, root.resolve(hit.path), {
            selection: { start: { line, character: 0 }, end: { line: Math.max(line, hit.end_line - 1), character: 0 } },
        });
    }
}

function firstLine(content: string): string {
    // The first line that says something: skip blanks and comment markers.
    return content.split('\n').map(line => line.trim()).find(line => line && !/^(\/\/|\/\*|\*)/.test(line)) ?? '';
}
