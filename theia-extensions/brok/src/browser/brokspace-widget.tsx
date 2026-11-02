// *****************************************************************************
// Copyright (C) 2026 Brokspace contributors.
//
// SPDX-License-Identifier: MIT
// *****************************************************************************

import * as React from '@theia/core/shared/react';
import { CommandService } from '@theia/core/lib/common/command';
import { nls } from '@theia/core/lib/common/nls';
import { codicon, Message } from '@theia/core/lib/browser/widgets/widget';
import { ReactWidget } from '@theia/core/lib/browser/widgets/react-widget';
import { OpenerService, open } from '@theia/core/lib/browser/opener-service';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { BrokService, MINIMUM_BROK_VERSION, SearchHit, ShardDetails, ShardInfo, SkillInfo } from '../common/brok-protocol';
import { BrokspaceCommands } from './brokspace-commands';
import { BrokspaceMemory, memoryUri, resolveHitPath } from './brokspace-memory';
import { BrokspaceModel, BrokspaceState } from './brokspace-model';

type Ready = Extract<BrokspaceState, { kind: 'ready' }>;

/** A part of the Brokspace view container: re-renders when brok's status changes. */
@injectable()
abstract class BrokspacePart extends ReactWidget {

    @inject(BrokspaceModel) protected readonly model: BrokspaceModel;
    @inject(BrokService) protected readonly service: BrokService;
    @inject(CommandService) protected readonly commands: CommandService;

    @postConstruct()
    protected init(): void {
        this.addClass('bk-part');
        this.toDispose.push(this.model.onDidChange(state => this.onStateChange(state)));
        this.update();
    }

    protected onStateChange(_state: BrokspaceState): void {
        this.update();
    }

    protected run(command: string, ...args: unknown[]): void {
        this.commands.executeCommand(command, ...args);
    }

    protected iconButton(icon: string, title: string, onClick: () => void): React.ReactNode {
        return <button className={`bk-icon-button ${codicon(icon)}`} title={title} aria-label={title}
            onClick={e => { e.stopPropagation(); onClick(); }} />;
    }

    protected empty(text: string, actions: { label: string; command: string; primary?: boolean }[] = []): React.ReactNode {
        return <div className='bk-empty'>
            <p>{text}</p>
            {actions.length > 0 && <div className='bk-empty-actions'>
                {actions.map(action => <button key={action.command} className={`theia-button ${action.primary ? 'main' : 'secondary'}`}
                    onClick={() => this.run(action.command)}>{action.label}</button>)}
            </div>}
        </div>;
    }
}

/** Status, search and the agent's quick actions; guides setup until brok is ready. */
@injectable()
export class BrokspaceOverviewWidget extends BrokspacePart {

    static readonly ID = 'brokspace-overview';

    @inject(OpenerService) protected readonly opener: OpenerService;

    protected query = '';
    protected hits: SearchHit[] = [];
    protected searching = false;
    protected searchMessage: string | undefined;
    protected searchInput: HTMLInputElement | undefined;

    @postConstruct()
    protected override init(): void {
        this.id = BrokspaceOverviewWidget.ID;
        this.title.label = nls.localize('brokspace/view/overview', 'Overview');
        super.init();
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

    protected render(): React.ReactNode {
        const state = this.model.state;
        switch (state.kind) {
            case 'loading':
                return <div className='bk-empty'><p>{nls.localize('brokspace/view/loading', 'Loading…')}</p></div>;
            case 'no-folder':
                return this.setupCard('folder-opened', nls.localize('brokspace/view/noFolderTitle', 'Open a folder'),
                    nls.localize('brokspace/view/noFolderText', 'Brokspace works on the folder you open: one repository or a folder of several.'),
                    nls.localize('brokspace/view/openFolder', 'Open Folder…'), 'workspace:openFolder');
            case 'no-brok':
                return this.setupCard('warning', nls.localize('brokspace/view/noBrokTitle', 'brok was not found'),
                    nls.localize('brokspace/view/noBrokText', 'The IDE could not run {0}. {1}', state.info.path, state.info.error ?? ''),
                    nls.localize('brokspace/view/installBrok', 'Install brok'), BrokspaceCommands.INSTALL_HELP.id);
            case 'outdated':
                return this.setupCard('warning', nls.localize('brokspace/view/outdatedTitle', 'brok {0} is too old', state.info.version ?? ''),
                    nls.localize('brokspace/view/outdatedText', 'This IDE needs brok {0} or newer. Run "brok upgrade" in a terminal.', MINIMUM_BROK_VERSION),
                    nls.localize('brokspace/view/openTerminal', 'Open Terminal'), 'terminal:new');
            case 'not-initialized':
                return this.setupCard('rocket', nls.localize('brokspace/view/setupTitle', 'Set up Brokspace here'),
                    nls.localize('brokspace/view/setupText', 'Indexes this folder for search, finds your local LLM and connects coding agents. '
                        + 'Downloads the search model once (about 140 MB).'),
                    nls.localize('brokspace/view/setupAction', 'Set Up Workspace'), BrokspaceCommands.SETUP.id);
            case 'error':
                return this.setupCard('error', nls.localize('brokspace/view/errorTitle', 'Something went wrong'), state.message,
                    nls.localize('brokspace/view/runDoctor', 'Run Doctor'), BrokspaceCommands.DOCTOR.id);
            case 'ready':
                return <div className='bk-overview'>
                    {this.renderFacts(state)}
                    {this.renderSearch()}
                    {this.renderActions()}
                </div>;
        }
    }

    protected setupCard(icon: string, title: string, text: string, action: string, command: string): React.ReactNode {
        return <div className='bk-card'>
            <span className={`bk-card-icon ${codicon(icon)}`} />
            <div className='bk-card-title'>{title}</div>
            <div className='bk-card-text'>{text}</div>
            <button className='theia-button main' onClick={() => this.run(command)}>{action}</button>
        </div>;
    }

    protected renderFacts(state: Ready): React.ReactNode {
        const { status } = state;
        const running = !!status.daemon?.running;
        const files = (status.index ?? []).reduce((sum, p) => sum + p.files, 0);
        const hybrid = (status.index ?? []).some(p => p.semantic);
        const model = status.llm?.model ? `${status.llm.model} · ${status.llm.provider}` : undefined;
        const mode = hybrid ? nls.localize('brokspace/view/hybrid', 'hybrid') : nls.localize('brokspace/view/text', 'text');
        return <ul className='bk-facts'>
            <li>
                <span className={`bk-dot ${running ? 'bk-dot-on' : ''}`} />
                <span className='bk-fact-text'>{running
                    ? nls.localize('brokspace/view/running', 'Running')
                    : nls.localize('brokspace/view/stopped', 'Stopped')}</span>
                <button className='bk-link' onClick={() => this.run(running ? BrokspaceCommands.STOP.id : BrokspaceCommands.START.id)}>
                    {running ? nls.localize('brokspace/view/stop', 'Stop') : nls.localize('brokspace/view/start', 'Start')}
                </button>
            </li>
            <li title={status.llm?.base_url ?? ''}>
                <span className={codicon('hubot')} />
                <span className='bk-fact-text'>{model ?? nls.localize('brokspace/view/noModel', 'No LLM: local search only')}</span>
            </li>
            <li>
                <span className={codicon('database')} />
                <span className='bk-fact-text'>{nls.localize('brokspace/view/indexFacts', '{0} files · {1}', files.toLocaleString(), mode)}</span>
            </li>
        </ul>;
    }

    protected renderSearch(): React.ReactNode {
        return <div className='bk-search-block'>
            <form className='bk-search' onSubmit={e => { e.preventDefault(); this.search(); }}>
                <span className={codicon('search')} />
                <input
                    ref={input => { this.searchInput = input ?? undefined; }}
                    className='theia-input bk-search-input'
                    placeholder={nls.localize('brokspace/view/searchPlaceholder', 'Search by meaning')}
                    aria-label={BrokspaceCommands.SEARCH.label}
                    spellCheck={false}
                    defaultValue={this.query}
                    onChange={e => { this.query = e.currentTarget.value; }}
                />
            </form>
            {this.searching && <div className='bk-muted'>{nls.localize('brokspace/view/searching', 'Searching…')}</div>}
            {this.searchMessage && <div className='bk-muted'>{this.searchMessage}</div>}
            {this.hits.length > 0 && <ul className='bk-hits'>
                {this.hits.map(hit => <li key={`${hit.path}:${hit.start_line}`} className='bk-hit' tabIndex={0} title={hit.content}
                    onClick={() => this.openHit(hit)} onKeyDown={e => e.key === 'Enter' && this.openHit(hit)}>
                    <div className='bk-hit-head'>
                        {hit.kind === 'memory' && <span className={codicon('library')} title={nls.localize('brokspace/view/memory', 'Memory')} />}
                        <span className='bk-hit-symbol'>{hit.symbol || hit.kind}</span>
                        <span className='bk-hit-path'>{hit.path}:{hit.start_line}</span>
                    </div>
                    <div className='bk-hit-snippet'>{firstLine(hit.content)}</div>
                </li>)}
            </ul>}
        </div>;
    }

    protected renderActions(): React.ReactNode {
        const action = (icon: string, label: string, command: string) =>
            <button className='bk-action' onClick={() => this.run(command)}>
                <span className={codicon(icon)} /><span>{label}</span>
            </button>;
        return <div className='bk-actions'>
            {action('comment-discussion', nls.localize('brokspace/view/ask', 'Ask'), BrokspaceCommands.ASK.id)}
            {action('checklist', nls.localize('brokspace/view/review', 'Review'), BrokspaceCommands.REVIEW.id)}
            {action('git-commit', nls.localize('brokspace/view/commit', 'Commit'), BrokspaceCommands.COMMIT_MESSAGE.id)}
        </div>;
    }

    protected async search(): Promise<void> {
        const root = this.model.root;
        const query = this.query.trim();
        if (!root || !query) {
            return;
        }
        this.searching = true;
        this.searchMessage = undefined;
        this.update();
        try {
            this.hits = await this.service.search(root, query, 20);
            if (!this.hits.length) {
                this.searchMessage = nls.localize('brokspace/view/noResults', 'No results. Try other words, or check that the index is up to date.');
            }
        } catch (error) {
            this.hits = [];
            this.searchMessage = error instanceof Error ? error.message : String(error);
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
        open(this.opener, resolveHitPath(root, hit.path), {
            selection: { start: { line, character: 0 }, end: { line: Math.max(line, hit.end_line - 1), character: 0 } },
        });
    }
}

/** Installed shards: state, permissions and topics, install and remove. */
@injectable()
export class BrokspaceShardsWidget extends BrokspacePart {

    static readonly ID = 'brokspace-shards';

    protected expanded = new Set<string>();
    protected details = new Map<string, ShardDetails | string>();

    @postConstruct()
    protected override init(): void {
        this.id = BrokspaceShardsWidget.ID;
        this.title.label = nls.localize('brokspace/view/shards', 'Shards');
        super.init();
    }

    protected override onStateChange(state: BrokspaceState): void {
        // Shards may have been installed, upgraded or removed: reload what is expanded.
        if (state.kind === 'ready') {
            this.details.clear();
            this.expanded.forEach(name => this.loadDetails(name));
        }
        super.onStateChange(state);
    }

    toggle(name: string): void {
        if (this.expanded.delete(name)) {
            this.update();
            return;
        }
        this.expanded.add(name);
        if (!this.details.has(name)) {
            this.loadDetails(name);
        }
        this.update();
    }

    protected async loadDetails(name: string): Promise<void> {
        const root = this.model.root;
        if (!root) {
            return;
        }
        try {
            this.details.set(name, await this.service.shardInfo(root, name));
        } catch (error) {
            this.details.set(name, error instanceof Error ? error.message : String(error));
        }
        this.update();
    }

    protected render(): React.ReactNode {
        const state = this.model.state;
        if (state.kind !== 'ready') {
            return this.empty(nls.localize('brokspace/view/shardsUnavailable', 'Shards appear once Brokspace is set up in this folder.'));
        }
        const shards = state.status.shards ?? [];
        if (!shards.length) {
            return this.empty(
                nls.localize('brokspace/view/noShards', 'No shards yet. Shards are small programs and skill packs that react to your workspace.'),
                [
                    { label: nls.localize('brokspace/view/install', 'Install'), command: BrokspaceCommands.INSTALL_SHARD.id, primary: true },
                    { label: nls.localize('brokspace/view/create', 'Create'), command: BrokspaceCommands.NEW_SHARD.id },
                ]);
        }
        return <ul className='bk-list' role='tree'>
            {shards.map(shard => this.renderShard(shard))}
        </ul>;
    }

    protected renderShard(shard: ShardInfo): React.ReactNode {
        const isOpen = this.expanded.has(shard.name);
        return <li key={shard.name} className={`bk-item ${isOpen ? 'bk-item-open' : ''}`} role='treeitem' aria-expanded={isOpen}>
            <div className='bk-row' tabIndex={0} title={shard.description}
                onClick={() => this.toggle(shard.name)} onKeyDown={e => e.key === 'Enter' && this.toggle(shard.name)}>
                <span className={`bk-chevron ${codicon(isOpen ? 'chevron-down' : 'chevron-right')}`} />
                <span className={`bk-dot ${shardDot(shard)}`} title={shardState(shard)} />
                <span className='bk-row-name'>{shard.name}</span>
                <span className='bk-row-meta'>{shard.version}</span>
                <span className='bk-row-actions'>
                    {shard.source !== 'builtin' && this.iconButton('trash', nls.localize('brokspace/view/removeShard', 'Remove {0}', shard.name),
                        () => this.run(BrokspaceCommands.REMOVE_SHARD.id, shard.name))}
                </span>
            </div>
            {isOpen && this.renderDetails(shard)}
        </li>;
    }

    protected renderDetails(shard: ShardInfo): React.ReactNode {
        const details = this.details.get(shard.name);
        if (details === undefined) {
            return <div className='bk-details bk-muted'>{nls.localize('brokspace/view/loading', 'Loading…')}</div>;
        }
        if (typeof details === 'string') {
            return <div className='bk-details bk-error'>{details}</div>;
        }
        const { manifest } = details;
        const permissions = manifest.permissions ?? {};
        const none = nls.localize('brokspace/view/none', 'none');
        const list = (values?: string[]) => values?.length ? values.join(', ') : none;
        const rows: [string, string][] = [
            [nls.localize('brokspace/view/state', 'State'), shardState(shard)],
            [nls.localize('brokspace/view/reads', 'Reads'), list(permissions.filesystem?.read)],
            [nls.localize('brokspace/view/writes', 'Writes'), list(permissions.filesystem?.write)],
            [nls.localize('brokspace/view/network', 'Network'), permissions.network
                ? nls.localize('brokspace/view/yes', 'yes') : nls.localize('brokspace/view/no', 'no')],
            [nls.localize('brokspace/view/runs', 'Runs'), list(permissions.process)],
            [nls.localize('brokspace/view/listens', 'Listens to'), list(manifest.subscribes_to)],
            [nls.localize('brokspace/view/publishes', 'Publishes'), list(manifest.publishes_to)],
            [nls.localize('brokspace/view/skills', 'Skills'), list(manifest.skills)],
            [nls.localize('brokspace/view/source', 'Source'), details.source ?? shard.source ?? none],
        ];
        return <div className='bk-details'>
            {manifest.description && <p className='bk-details-text'>{manifest.description}</p>}
            <dl className='bk-props'>
                {rows.map(([key, value]) => <React.Fragment key={key}><dt>{key}</dt><dd title={value}>{value}</dd></React.Fragment>)}
            </dl>
        </div>;
    }
}

/** Skills from the workspace, installed shards and brok itself. */
@injectable()
export class BrokspaceSkillsWidget extends BrokspacePart {

    static readonly ID = 'brokspace-skills';

    protected skills: SkillInfo[] = [];
    protected loaded = false;

    @postConstruct()
    protected override init(): void {
        this.id = BrokspaceSkillsWidget.ID;
        this.title.label = nls.localize('brokspace/view/skills', 'Skills');
        super.init();
    }

    protected override onStateChange(state: BrokspaceState): void {
        if (state.kind === 'ready' && !this.loaded) {
            this.load();
        }
        super.onStateChange(state);
    }

    protected async load(): Promise<void> {
        const root = this.model.root;
        if (!root) {
            return;
        }
        this.loaded = true;
        try {
            this.skills = await this.service.skills(root);
        } catch {
            this.loaded = false; // try again on the next refresh
        }
        this.update();
    }

    protected render(): React.ReactNode {
        if (this.model.state.kind !== 'ready') {
            return this.empty(nls.localize('brokspace/view/skillsUnavailable', 'Skills appear once Brokspace is set up in this folder.'));
        }
        if (!this.skills.length) {
            return this.empty(nls.localize('brokspace/view/noSkills', 'No skills found.'));
        }
        const group = (title: string, userInvoked: boolean) => {
            const skills = this.skills.filter(skill => skill.user_invoked === userInvoked);
            return skills.length > 0 && <>
                <div className='bk-group'>{title}</div>
                {skills.map(skill => <li key={skill.name} className='bk-item'>
                    <div className='bk-row' title={skill.description}>
                        <span className={codicon(userInvoked ? 'play-circle' : 'symbol-method')} />
                        <span className='bk-row-name'>{skill.name}</span>
                        <span className='bk-row-meta'>{skill.source}</span>
                        <span className='bk-row-actions'>
                            {this.iconButton('play', nls.localize('brokspace/view/runSkill', 'Run {0}', skill.name),
                                () => this.run(BrokspaceCommands.RUN_SKILL.id, skill.name))}
                        </span>
                    </div>
                </li>)}
            </>;
        };
        return <ul className='bk-list'>
            {group(nls.localize('brokspace/view/workflows', 'Workflows'), true)}
            {group(nls.localize('brokspace/view/usedByAgents', 'Used by agents'), false)}
        </ul>;
    }
}

export function shardState(shard: ShardInfo): string {
    switch (shard.state) {
        case 'enabled': return nls.localize('brokspace/shard/enabled', 'Enabled');
        case 'disabled': return nls.localize('brokspace/shard/disabled', 'Disabled');
        case 'skills': return nls.localize('brokspace/shard/skills', 'Skills only');
        case 'missing-binary': return nls.localize('brokspace/shard/missingBinary', 'Binary missing');
    }
}

function shardDot(shard: ShardInfo): string {
    switch (shard.state) {
        case 'enabled': return 'bk-dot-on';
        case 'skills': return 'bk-dot-info';
        case 'missing-binary': return 'bk-dot-warn';
        default: return '';
    }
}

function firstLine(content: string): string {
    // The first line that says something: skip blanks and comment markers.
    return content.split('\n').map(line => line.trim()).find(line => line && !/^(\/\/|\/\*|\*)/.test(line)) ?? '';
}

/** Recent memories: open one, forget one, remember something new. */
@injectable()
export class BrokspaceMemoryWidget extends BrokspacePart {

    static readonly ID = 'brokspace-memory';
    static readonly SHOWN = 30;

    @inject(BrokspaceMemory) protected readonly memory: BrokspaceMemory;
    @inject(OpenerService) protected readonly opener: OpenerService;

    @postConstruct()
    protected override init(): void {
        this.id = BrokspaceMemoryWidget.ID;
        this.title.label = nls.localize('brokspace/view/memory', 'Memory');
        this.toDispose.push(this.memory.onDidChange(() => this.update()));
        super.init();
    }

    protected override onAfterShow(msg: Message): void {
        super.onAfterShow(msg);
        this.memory.ensureLoaded();
    }

    protected override onStateChange(state: BrokspaceState): void {
        if (state.kind === 'ready' && this.isVisible) {
            this.memory.ensureLoaded();
        }
        super.onStateChange(state);
    }

    protected render(): React.ReactNode {
        const state = this.model.state;
        if (state.kind !== 'ready') {
            return this.empty(nls.localize('brokspace/view/memoryUnavailable', 'Memories appear once Brokspace is set up in this folder.'));
        }
        if (state.status.memory?.enabled === false) {
            return this.empty(nls.localize('brokspace/view/memoryOff', 'Memory is off in this workspace.'),
                [{ label: BrokspaceCommands.SETTINGS.label ?? '', command: BrokspaceCommands.SHOW_MEMORY.id }]);
        }
        if (!this.memory.isLoaded) {
            return <div className='bk-empty'><p>{nls.localize('brokspace/view/loading', 'Loading…')}</p></div>;
        }
        const memories = this.memory.memories;
        if (!memories.length) {
            return this.empty(nls.localize('brokspace/view/noMemories',
                'Nothing remembered yet. Decisions, facts and your chats with the agent show up here, and in every answer.'),
                [{ label: BrokspaceCommands.REMEMBER.label ?? '', command: BrokspaceCommands.REMEMBER.id, primary: true }]);
        }
        const shown = memories.slice(0, BrokspaceMemoryWidget.SHOWN);
        return <ul className='bk-list'>
            {shown.map(memory => <li key={`${memory.scope}:${memory.id}`} className='bk-item'>
                <div className='bk-row' tabIndex={0} title={`${memory.title}\n${memory.updated.slice(0, 10)} · ${memory.scope}`}
                    onClick={() => open(this.opener, memoryUri(memory))} onKeyDown={e => e.key === 'Enter' && open(this.opener, memoryUri(memory))}>
                    <span className={codicon(kindIcon(memory.kind))} />
                    <span className='bk-row-name'>{memory.title}</span>
                    <span className='bk-row-meta'>{relativeDate(memory.updated)}</span>
                    <span className='bk-row-actions'>
                        {this.iconButton('trash', nls.localize('brokspace/settings/forget', 'Forget'),
                            () => this.run(BrokspaceCommands.FORGET_MEMORY.id, memory))}
                    </span>
                </div>
            </li>)}
            {memories.length > shown.length && <li className='bk-item'>
                <button className='bk-link bk-more' onClick={() => this.run(BrokspaceCommands.SHOW_MEMORY.id)}>
                    {nls.localize('brokspace/view/moreMemories', '{0} more…', memories.length - shown.length)}
                </button>
            </li>}
        </ul>;
    }
}

export function kindIcon(kind: string): string {
    switch (kind) {
        case 'decision': return 'law';
        case 'fact': return 'lightbulb';
        case 'session': return 'comment-discussion';
        case 'handoff': return 'debug-step-over';
        case 'link': return 'link';
        default: return 'note';
    }
}

/** `today`, `3d`, `2w`, or the date. */
function relativeDate(iso: string): string {
    const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
    if (!Number.isFinite(days)) {
        return '';
    }
    if (days < 1) {
        return nls.localize('brokspace/view/today', 'today');
    }
    if (days < 14) {
        return nls.localize('brokspace/view/daysAgo', '{0}d', days);
    }
    if (days < 60) {
        return nls.localize('brokspace/view/weeksAgo', '{0}w', Math.floor(days / 7));
    }
    return iso.slice(0, 10);
}
