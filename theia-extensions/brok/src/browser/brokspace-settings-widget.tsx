// *****************************************************************************
// Copyright (C) 2026 Brokspace contributors.
//
// SPDX-License-Identifier: MIT
// *****************************************************************************

import * as React from '@theia/core/shared/react';
import { CommandService } from '@theia/core/lib/common/command';
import { MessageService } from '@theia/core/lib/common/message-service';
import { nls } from '@theia/core/lib/common/nls';
import { codicon, Message } from '@theia/core/lib/browser/widgets/widget';
import { ReactWidget } from '@theia/core/lib/browser/widgets/react-widget';
import { OpenerService, open } from '@theia/core/lib/browser/opener-service';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { FileDialogService } from '@theia/filesystem/lib/browser/file-dialog/file-dialog-service';
import { BrokConfig, BrokService, LinkInput, LinkStatus, LlmProvider, Memory, MemoryKind, MemoryScope } from '../common/brok-protocol';
import { BrokspaceCommands } from './brokspace-commands';
import { BrokspaceMemory, MEMORY_SCOPES, memoryUri } from './brokspace-memory';
import { BrokspaceModel } from './brokspace-model';

export type SettingsSection = 'overview' | 'model' | 'search' | 'memory' | 'links' | 'agents' | 'diagnostics';

const SECTIONS: { id: SettingsSection; icon: string }[] = [
    { id: 'overview', icon: 'home' },
    { id: 'model', icon: 'hubot' },
    { id: 'search', icon: 'search' },
    { id: 'memory', icon: 'library' },
    { id: 'links', icon: 'link' },
    { id: 'agents', icon: 'plug' },
    { id: 'diagnostics', icon: 'pulse' },
];

const MEMORY_KINDS: MemoryKind[] = ['note', 'decision', 'fact', 'handoff', 'session'];

/**
 * Brokspace settings, in the editor area: the workspace at a glance, the
 * LLM, search and index, memory, linked workspaces, coding agents and
 * diagnostics. Every change goes through `brok config` (validated, written
 * to brok.yml at once); the page asks to restart brok when it runs.
 */
@injectable()
export class BrokspaceSettingsWidget extends ReactWidget {

    static readonly ID = 'brokspace-settings';

    @inject(BrokspaceModel) protected readonly model: BrokspaceModel;
    @inject(BrokspaceMemory) protected readonly memory: BrokspaceMemory;
    @inject(BrokService) protected readonly service: BrokService;
    @inject(CommandService) protected readonly commands: CommandService;
    @inject(MessageService) protected readonly messages: MessageService;
    @inject(OpenerService) protected readonly opener: OpenerService;
    @inject(FileDialogService) protected readonly fileDialog: FileDialogService;

    protected section: SettingsSection = 'overview';
    protected config: BrokConfig | undefined;
    protected configError: string | undefined;
    /** Key → outcome of its last change. */
    protected feedback = new Map<string, { ok: boolean; text: string }>();
    protected needsRestart = false;
    protected busy = new Set<string>();

    protected memoryFilter = '';
    protected memoryScope: MemoryScope | 'all' = 'all';
    protected draft: { title: string; body: string; kind: MemoryKind; scope: MemoryScope; tags: string } = emptyDraft();
    protected showDraft = false;
    protected linkDraft: LinkInput & { open: boolean } = emptyLink();

    @postConstruct()
    protected init(): void {
        this.id = BrokspaceSettingsWidget.ID;
        this.title.label = nls.localize('brokspace/settings/title', 'Brokspace Settings');
        this.title.caption = this.title.label;
        this.title.iconClass = codicon('settings-gear');
        this.title.closable = true;
        this.addClass('bk-settings-widget');
        this.toDispose.push(this.model.onDidChange(() => this.update()));
        this.toDispose.push(this.memory.onDidChange(() => this.update()));
        this.loadConfig();
        this.update();
    }

    /** Shows a section; `links` with `addLink` opens the form to link a workspace. */
    showSection(section: SettingsSection, options: { addLink?: boolean; addMemory?: boolean } = {}): void {
        this.section = section;
        if (options.addLink) {
            this.linkDraft.open = true;
        }
        if (options.addMemory) {
            this.showDraft = true;
        }
        if (section === 'memory') {
            this.memory.ensureLoaded();
        }
        this.update();
    }

    protected override onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg);
        this.node.focus();
        this.model.refresh();
        this.loadConfig();
    }

    protected async loadConfig(): Promise<void> {
        const root = this.model.root;
        if (!root || this.model.state.kind !== 'ready') {
            return;
        }
        try {
            this.config = await this.service.config(root);
            this.configError = undefined;
        } catch (error) {
            this.configError = message(error);
        }
        this.update();
    }

    // ------------------------------------------------------------------ layout

    protected render(): React.ReactNode {
        const state = this.model.state;
        if (state.kind !== 'ready') {
            return <div className='bk-settings-empty'>
                <span className={`bk-card-icon ${codicon('settings-gear')}`} />
                <p>{nls.localize('brokspace/settings/notReady', 'Brokspace settings appear once Brokspace is set up in this folder.')}</p>
                <button className='theia-button main' onClick={() => this.run(BrokspaceCommands.SHOW.id)}>
                    {nls.localize('brokspace/settings/openBrokspace', 'Open Brokspace')}
                </button>
            </div>;
        }
        return <div className='bk-settings'>
            <nav className='bk-settings-nav' aria-label={this.title.label}>
                {SECTIONS.map(({ id, icon }) => <button key={id} className={`bk-settings-tab ${this.section === id ? 'bk-settings-tab-on' : ''}`}
                    aria-current={this.section === id ? 'page' : undefined} onClick={() => this.showSection(id)}>
                    <span className={codicon(icon)} /><span>{sectionTitle(id)}</span>
                </button>)}
            </nav>
            <main className='bk-settings-main'>
                <header className='bk-settings-header'>
                    <h1>{sectionTitle(this.section)}</h1>
                    <p>{sectionDescription(this.section)}</p>
                </header>
                {this.needsRestart && state.status.daemon?.running && <div className='bk-banner'>
                    <span className={codicon('info')} />
                    <span>{nls.localize('brokspace/settings/restartNeeded', 'Brokspace is running with the previous settings.')}</span>
                    <button className='theia-button main' onClick={() => this.restart()}>
                        {nls.localize('brokspace/settings/restartNow', 'Restart now')}
                    </button>
                </div>}
                {this.configError && <div className='bk-banner bk-banner-error'>
                    <span className={codicon('error')} /><span>{this.configError}</span>
                </div>}
                {this.renderSection()}
            </main>
        </div>;
    }

    protected renderSection(): React.ReactNode {
        switch (this.section) {
            case 'overview': return this.renderOverview();
            case 'model': return this.renderModel();
            case 'search': return this.renderSearch();
            case 'memory': return this.renderMemory();
            case 'links': return this.renderLinks();
            case 'agents': return this.renderAgents();
            case 'diagnostics': return this.renderDiagnostics();
        }
    }

    // ------------------------------------------------------------------ sections

    protected renderOverview(): React.ReactNode {
        const state = this.model.state;
        if (state.kind !== 'ready') {
            return undefined;
        }
        const { status } = state;
        const running = !!status.daemon?.running;
        const files = (status.index ?? []).reduce((sum, p) => sum + p.files, 0);
        const hybrid = (status.index ?? []).some(p => p.semantic);
        const counts = status.memory?.counts;
        const memories = counts ? counts.private + counts.shared + counts.global : 0;
        const tile = (icon: string, label: string, value: string, section?: SettingsSection) =>
            <button className='bk-tile' disabled={!section} onClick={() => section && this.showSection(section)}>
                <span className={`bk-tile-icon ${codicon(icon)}`} />
                <span className='bk-tile-label'>{label}</span>
                <span className='bk-tile-value' title={value}>{value}</span>
            </button>;
        return <>
            <div className='bk-tiles'>
                {tile(running ? 'pass-filled' : 'circle-large-outline', nls.localize('brokspace/settings/service', 'Service'),
                    running ? nls.localize('brokspace/view/running', 'Running') : nls.localize('brokspace/view/stopped', 'Stopped'))}
                {tile('hubot', nls.localize('brokspace/settings/model', 'AI model'),
                    status.llm?.model ? `${status.llm.model} · ${status.llm.provider}` : nls.localize('brokspace/settings/noModel', 'None: local answers'), 'model')}
                {tile('database', nls.localize('brokspace/settings/index', 'Index'),
                    nls.localize('brokspace/view/indexFacts', '{0} files · {1}', files.toLocaleString(),
                        hybrid ? nls.localize('brokspace/view/hybrid', 'hybrid') : nls.localize('brokspace/view/text', 'text')), 'search')}
                {tile('library', nls.localize('brokspace/settings/memories', 'Memories'),
                    status.memory?.enabled === false ? nls.localize('brokspace/settings/off', 'Off') : memories.toLocaleString(), 'memory')}
                {tile('link', nls.localize('brokspace/settings/links', 'Linked workspaces'), String(status.links?.length ?? 0), 'links')}
                {tile('extensions', nls.localize('brokspace/settings/shards', 'Shards'), String(status.shards?.length ?? 0))}
            </div>
            <div className='bk-settings-group'>
                <div className='bk-setting'>
                    <div className='bk-setting-text'>
                        <div className='bk-setting-label'>{nls.localize('brokspace/settings/workspace', 'Workspace')}</div>
                        <div className='bk-setting-description bk-mono'>{status.root}</div>
                    </div>
                    <div className='bk-setting-control bk-buttons'>
                        <button className='theia-button secondary' onClick={() => this.openConfigFile()}>
                            {nls.localize('brokspace/settings/openConfig', 'Open brok.yml')}
                        </button>
                    </div>
                </div>
                <div className='bk-setting'>
                    <div className='bk-setting-text'>
                        <div className='bk-setting-label'>{nls.localize('brokspace/settings/service', 'Service')}</div>
                        <div className='bk-setting-description'>{nls.localize('brokspace/settings/serviceText',
                            'The background brok keeps the index in step with your edits and runs the agent and shards.')}</div>
                    </div>
                    <div className='bk-setting-control bk-buttons'>
                        {running
                            ? <>
                                <button className='theia-button secondary' onClick={() => this.restart()}>{BrokspaceCommands.RESTART.label}</button>
                                <button className='theia-button secondary' onClick={() => this.run(BrokspaceCommands.STOP.id)}>{BrokspaceCommands.STOP.label}</button>
                            </>
                            : <button className='theia-button main' onClick={() => this.run(BrokspaceCommands.START.id)}>{BrokspaceCommands.START.label}</button>}
                    </div>
                </div>
            </div>
        </>;
    }

    protected renderModel(): React.ReactNode {
        const config = this.config;
        if (!config) {
            return this.loadingConfig();
        }
        // The default first, then the others by name.
        const providers = Object.entries(config.llm.providers)
            .sort(([a], [b]) => Number(b === config.llm.default) - Number(a === config.llm.default) || a.localeCompare(b));
        return <>
            <div className='bk-settings-group'>
                {this.select('llm.default', config.llm.default, providers.map(([name, p]) => [name, `${name} · ${p.model}`]),
                    nls.localize('brokspace/settings/defaultProvider', 'Default model'),
                    nls.localize('brokspace/settings/defaultProviderText', 'Every question, review and skill goes through brok to this provider.'))}
            </div>
            {providers.map(([name, provider]) => this.renderProvider(name, provider, name === config.llm.default))}
            <p className='bk-settings-note'>
                {nls.localize('brokspace/settings/providersNote',
                    'Providers are OpenAI-compatible endpoints: Ollama, LM Studio or a hosted API. API keys stay in environment variables; brok.yml only names the variable.')}
            </p>
            <div className='bk-buttons'>
                <button className='theia-button secondary' onClick={() => this.addProvider()}>
                    <span className={codicon('add')} /> {nls.localize('brokspace/settings/addProvider', 'Add provider')}
                </button>
                <button className='theia-button secondary' onClick={() => this.run(BrokspaceCommands.DOCTOR.id)}>
                    {nls.localize('brokspace/settings/checkModel', 'Check the connection')}
                </button>
            </div>
        </>;
    }

    protected renderProvider(name: string, provider: LlmProvider, isDefault: boolean): React.ReactNode {
        const key = `llm.providers.${name}`;
        return <section key={name} className='bk-settings-group'>
            <div className='bk-group-head'>
                <span className='bk-group-title'>{name}</span>
                {isDefault && <span className='bk-badge bk-badge-accent'>{nls.localize('brokspace/settings/default', 'default')}</span>}
                <span className='bk-spacer' />
                {!isDefault && <>
                    <button className='bk-link-button' onClick={() => this.save('llm.default', name)}>
                        {nls.localize('brokspace/settings/makeDefault', 'Make default')}
                    </button>
                    {this.iconButton('trash', nls.localize('brokspace/settings/removeProvider', 'Remove {0}', name), () => this.unset(key))}
                </>}
            </div>
            {this.text(`${key}.model`, provider.model, nls.localize('brokspace/settings/modelName', 'Model'), '', 'qwen2.5-coder:7b')}
            {this.text(`${key}.base_url`, provider.base_url, nls.localize('brokspace/settings/baseUrl', 'Base URL'), '', 'http://localhost:11434/v1')}
            {this.text(`${key}.api_key_env`, provider.api_key_env ?? '', nls.localize('brokspace/settings/apiKeyEnv', 'API key variable'),
                nls.localize('brokspace/settings/apiKeyEnvText', 'Name of the environment variable that holds the key (never the key itself).'),
                'OPENAI_API_KEY', true)}
        </section>;
    }

    protected renderSearch(): React.ReactNode {
        const config = this.config;
        if (!config) {
            return this.loadingConfig();
        }
        return <>
            <div className='bk-settings-group'>
                {this.toggle('embeddings.enabled', config.embeddings.enabled, nls.localize('brokspace/settings/semantic', 'Search by meaning'),
                    nls.localize('brokspace/settings/semanticText',
                        'A local embedding model ({0}) finds code by meaning, not only by words. Turning it on or off rebuilds the index.', config.embeddings.model))}
                {this.number('search.limit', config.search.limit, nls.localize('brokspace/settings/limit', 'Results per search'),
                    nls.localize('brokspace/settings/limitText', 'Also how much context a question gets.'), 1, 50, 1)}
                {this.number('search.cold_weight', config.search.cold_weight, nls.localize('brokspace/settings/coldWeight', 'Weight outside the current repository'),
                    nls.localize('brokspace/settings/coldWeightText', 'Results from other submodules and nested repositories are scaled by this (0 to 1).'), 0, 1, 0.05)}
                {this.number('search.link_weight', config.search.link_weight, nls.localize('brokspace/settings/linkWeight', 'Weight of linked workspaces'),
                    nls.localize('brokspace/settings/linkWeightText', 'Results from linked workspaces are scaled by this (0 to 1), so your code wins ties.'), 0, 1, 0.05)}
            </div>
            <div className='bk-settings-group'>
                {this.toggle('workspace.submodules', config.workspace.submodules, nls.localize('brokspace/settings/submodules', 'Index submodules separately'),
                    nls.localize('brokspace/settings/submodulesText', 'Git submodules and nested repositories get their own small index, quick to update.'))}
                {this.number('index.max_file_kb', config.index.max_file_kb, nls.localize('brokspace/settings/maxFile', 'Largest file (KB)'),
                    nls.localize('brokspace/settings/maxFileText', 'Bigger files are skipped.'), 16, 16384, 16)}
                {this.list('index.exclude', config.index.exclude, nls.localize('brokspace/settings/exclude', 'Skip these files'),
                    nls.localize('brokspace/settings/excludeText', 'Glob patterns, one per line. .gitignore is always honored too.'))}
            </div>
            <div className='bk-buttons'>
                <button className='theia-button secondary' onClick={() => this.run(BrokspaceCommands.REINDEX.id)}>{BrokspaceCommands.REINDEX.label}</button>
            </div>
        </>;
    }

    protected renderMemory(): React.ReactNode {
        const config = this.config;
        if (!config) {
            return this.loadingConfig();
        }
        const enabled = config.memory.enabled;
        return <>
            <div className='bk-settings-group'>
                {this.toggle('memory.enabled', enabled, nls.localize('brokspace/settings/memoryEnabled', 'Remember between sessions'),
                    nls.localize('brokspace/settings/memoryEnabledText', 'Decisions, facts and notes are found with your code by questions, searches and coding agents.'))}
                {this.toggle('memory.sessions', config.memory.sessions, nls.localize('brokspace/settings/memorySessions', 'Remember chat sessions'),
                    nls.localize('brokspace/settings/memorySessionsText',
                        'Each chat with the Brokspace agent is saved as a private memory, so the next one can build on it.'), !enabled)}
                {this.toggle('memory.global', config.memory.global, nls.localize('brokspace/settings/memoryGlobal', 'Use my global memories'),
                    nls.localize('brokspace/settings/memoryGlobalText', 'Your personal memories, shared by every workspace (preferences, conventions).'), !enabled)}
            </div>
            {enabled && this.renderMemories()}
        </>;
    }

    protected renderMemories(): React.ReactNode {
        const filter = this.memoryFilter.trim().toLowerCase();
        const memories = this.memory.memories.filter(m => (this.memoryScope === 'all' || m.scope === this.memoryScope)
            && (!filter || `${m.title}\n${m.body}\n${m.tags.join(' ')}`.toLowerCase().includes(filter)));
        return <section className='bk-settings-group'>
            <div className='bk-group-head'>
                <span className='bk-group-title'>{nls.localize('brokspace/settings/memories', 'Memories')}</span>
                <span className='bk-spacer' />
                <button className='theia-button main bk-compact' onClick={() => { this.showDraft = !this.showDraft; this.update(); }}>
                    <span className={codicon(this.showDraft ? 'close' : 'add')} /> {nls.localize('brokspace/settings/newMemory', 'New memory')}
                </button>
            </div>
            {this.showDraft && this.renderDraft()}
            <div className='bk-filters'>
                <input className='theia-input bk-grow' placeholder={nls.localize('brokspace/settings/filterMemories', 'Filter memories')}
                    value={this.memoryFilter} spellCheck={false} onChange={e => { this.memoryFilter = e.currentTarget.value; this.update(); }} />
                <div className='bk-chips' role='radiogroup'>
                    {(['all', ...MEMORY_SCOPES] as const).map(scope => <button key={scope} role='radio' aria-checked={this.memoryScope === scope}
                        className={`bk-chip ${this.memoryScope === scope ? 'bk-chip-on' : ''}`}
                        onClick={() => { this.memoryScope = scope; this.update(); }}>
                        {scope === 'all' ? nls.localize('brokspace/settings/all', 'All') : scopeLabel(scope)}
                    </button>)}
                </div>
            </div>
            {this.memory.error && <div className='bk-error'>{this.memory.error}</div>}
            {!this.memory.isLoaded
                ? <div className='bk-muted'>{nls.localize('brokspace/view/loading', 'Loading…')}</div>
                : memories.length === 0
                    ? <div className='bk-muted'>{this.memory.memories.length
                        ? nls.localize('brokspace/settings/noMatchingMemories', 'No memory matches.')
                        : nls.localize('brokspace/settings/noMemories', 'Nothing remembered yet. Add a decision here, or ask your coding agent to remember something.')}</div>
                    : <ul className='bk-memory-list'>{memories.map(m => this.renderMemoryItem(m))}</ul>}
        </section>;
    }

    protected renderMemoryItem(memory: Memory): React.ReactNode {
        return <li key={`${memory.scope}:${memory.id}`} className='bk-memory'>
            <button className='bk-memory-main' title={memory.path} onClick={() => open(this.opener, memoryUri(memory))}>
                <span className='bk-memory-title'>{memory.title}</span>
                <span className='bk-memory-body'>{firstLine(memory.body)}</span>
                <span className='bk-memory-meta'>
                    <span className={`bk-badge bk-kind-${memory.kind}`}>{kindLabel(memory.kind)}</span>
                    <span className='bk-badge'>{scopeLabel(memory.scope)}</span>
                    {memory.tags.map(tag => <span key={tag} className='bk-tag'>#{tag}</span>)}
                    <span className='bk-memory-date'>{memory.updated.slice(0, 10)}</span>
                </span>
            </button>
            <span className='bk-memory-actions'>
                {this.iconButton('trash', nls.localize('brokspace/settings/forget', 'Forget'), () => this.forget(memory))}
            </span>
        </li>;
    }

    protected renderDraft(): React.ReactNode {
        const draft = this.draft;
        const set = (patch: Partial<typeof draft>) => { this.draft = { ...draft, ...patch }; this.update(); };
        return <form className='bk-draft' onSubmit={e => { e.preventDefault(); this.saveDraft(); }}>
            <input className='theia-input' autoFocus placeholder={nls.localize('brokspace/settings/memoryTitle', 'What to remember, in one line')}
                value={draft.title} onChange={e => set({ title: e.currentTarget.value })} />
            <textarea className='theia-input' rows={4} placeholder={nls.localize('brokspace/settings/memoryBody', 'Details: why, where, what to watch out for (Markdown)')}
                value={draft.body} onChange={e => set({ body: e.currentTarget.value })} />
            <div className='bk-draft-row'>
                <select className='theia-select' value={draft.kind} aria-label={nls.localize('brokspace/settings/kind', 'Kind')}
                    onChange={e => set({ kind: e.currentTarget.value as MemoryKind })}>
                    {MEMORY_KINDS.filter(k => k !== 'session').map(kind => <option key={kind} value={kind}>{kindLabel(kind)}</option>)}
                </select>
                <select className='theia-select' value={draft.scope} aria-label={nls.localize('brokspace/settings/scope', 'Who sees it')}
                    onChange={e => set({ scope: e.currentTarget.value as MemoryScope })}>
                    {MEMORY_SCOPES.map(scope => <option key={scope} value={scope}>{scopeDescription(scope)}</option>)}
                </select>
                <input className='theia-input bk-grow' placeholder={nls.localize('brokspace/settings/tags', 'Tags, separated by commas')}
                    value={draft.tags} onChange={e => set({ tags: e.currentTarget.value })} />
                <button type='submit' className='theia-button main' disabled={!draft.title.trim() || this.busy.has('memory')}>
                    {nls.localize('brokspace/settings/remember', 'Remember')}
                </button>
            </div>
        </form>;
    }

    protected renderLinks(): React.ReactNode {
        const state = this.model.state;
        const links = state.kind === 'ready' ? state.status.links ?? [] : [];
        return <>
            {links.length === 0 && !this.linkDraft.open && <div className='bk-settings-group bk-empty-group'>
                <p>{nls.localize('brokspace/settings/noLinks',
                    'Working on a service that calls another one? Link it: questions and searches then know both, and their memories.')}</p>
            </div>}
            {links.map(link => this.renderLink(link))}
            {this.linkDraft.open ? this.renderLinkDraft() : <div className='bk-buttons'>
                <button className='theia-button main' onClick={() => { this.linkDraft.open = true; this.update(); }}>
                    <span className={codicon('link')} /> {nls.localize('brokspace/settings/linkWorkspace', 'Link a workspace')}
                </button>
                {links.length > 0 && <button className='theia-button secondary' disabled={this.busy.has('sync')} onClick={() => this.syncLinks()}>
                    <span className={codicon('sync')} /> {nls.localize('brokspace/settings/syncAll', 'Sync all')}
                </button>}
            </div>}
        </>;
    }

    protected renderLink(link: LinkStatus): React.ReactNode {
        const syncing = this.busy.has(`sync:${link.name}`);
        return <section key={link.name} className='bk-settings-group'>
            <div className='bk-group-head'>
                <span className={codicon(link.kind === 'git' ? 'repo' : 'folder')} />
                <span className='bk-group-title'>{link.name}</span>
                <span className='bk-badge'>{link.kind === 'git' ? 'git' : nls.localize('brokspace/settings/localFolder', 'folder')}</span>
                {link.index === 'own' && <span className='bk-badge'
                    title={nls.localize('brokspace/settings/ownIndexText', 'A Brokspace workspace: its own index and memories are used.')}>
                    Brokspace</span>}
                <span className='bk-spacer' />
                {this.iconButton(syncing ? 'loading codicon-modifier-spin' : 'sync', nls.localize('brokspace/settings/sync', 'Sync'), () => this.syncLinks(link.name))}
                {this.iconButton('trash', nls.localize('brokspace/settings/unlink', 'Unlink {0}', link.name), () => this.removeLink(link))}
            </div>
            {link.description && <p className='bk-settings-note'>{link.description}</p>}
            <dl className='bk-props'>
                <dt>{nls.localize('brokspace/settings/location', 'Location')}</dt><dd className='bk-mono' title={link.path}>{link.git ?? link.root}</dd>
                {link.branch && <><dt>{nls.localize('brokspace/settings/branch', 'Branch')}</dt><dd>{link.branch}</dd></>}
                <dt>{nls.localize('brokspace/settings/index', 'Index')}</dt>
                <dd className={link.error ? 'bk-warn' : ''}>{link.error ?? nls.localize('brokspace/settings/linkIndexed', '{0} files, {1} chunks',
                    link.files.toLocaleString(), link.chunks.toLocaleString())}</dd>
                <dt>{nls.localize('brokspace/settings/memories', 'Memories')}</dt>
                <dd>{link.memory ? nls.localize('brokspace/settings/searched', 'searched') : nls.localize('brokspace/settings/notSearched', 'not searched')}</dd>
            </dl>
        </section>;
    }

    protected renderLinkDraft(): React.ReactNode {
        const draft = this.linkDraft;
        const isGit = /:\/\/|^git@|\.git$/.test(draft.target.trim());
        const set = (patch: Partial<typeof draft>) => { this.linkDraft = { ...draft, ...patch }; this.update(); };
        const busy = this.busy.has('link');
        return <form className='bk-settings-group bk-draft' onSubmit={e => { e.preventDefault(); this.addLink(); }}>
            <div className='bk-group-head'><span className='bk-group-title'>{nls.localize('brokspace/settings/linkWorkspace', 'Link a workspace')}</span></div>
            <label className='bk-field'>
                <span>{nls.localize('brokspace/settings/linkTarget', 'Folder or git URL')}</span>
                <div className='bk-draft-row'>
                    <input className='theia-input bk-grow bk-mono' autoFocus placeholder='../checkout · https://github.com/acme/checkout.git'
                        value={draft.target} onChange={e => {
                            const target = e.currentTarget.value;
                            set({ target, name: draft.name || suggestName(target) });
                        }} />
                    <button type='button' className='theia-button secondary' onClick={() => this.chooseFolder()}>
                        {nls.localize('brokspace/settings/chooseFolder', 'Choose folder…')}
                    </button>
                </div>
            </label>
            <div className='bk-draft-row'>
                <label className='bk-field bk-grow'>
                    <span>{nls.localize('brokspace/settings/linkName', 'Name')}</span>
                    <input className='theia-input' placeholder='checkout' value={draft.name} onChange={e => set({ name: e.currentTarget.value })} />
                </label>
                {isGit && <label className='bk-field bk-grow'>
                    <span>{nls.localize('brokspace/settings/branch', 'Branch')}</span>
                    <input className='theia-input' placeholder='main' value={draft.branch ?? ''} onChange={e => set({ branch: e.currentTarget.value })} />
                </label>}
            </div>
            <label className='bk-field'>
                <span>{nls.localize('brokspace/settings/linkDescription', 'How this workspace uses it (optional, helps the AI)')}</span>
                <input className='theia-input' placeholder={nls.localize('brokspace/settings/linkDescriptionPlaceholder', 'Carts and payments; we call its createOrder API')}
                    value={draft.description ?? ''} onChange={e => set({ description: e.currentTarget.value })} />
            </label>
            <label className='bk-check'>
                <input type='checkbox' checked={draft.memory !== false} onChange={e => set({ memory: e.currentTarget.checked })} />
                <span>{nls.localize('brokspace/settings/linkMemory', 'Search its memories too')}</span>
            </label>
            <div className='bk-buttons'>
                <button type='submit' className='theia-button main' disabled={busy || !draft.name.trim() || !draft.target.trim()}>
                    {busy ? nls.localize('brokspace/settings/linking', 'Linking and indexing…') : nls.localize('brokspace/settings/link', 'Link and index')}
                </button>
                <button type='button' className='theia-button secondary' disabled={busy} onClick={() => { this.linkDraft = emptyLink(); this.update(); }}>
                    {nls.localize('brokspace/prompt/cancel', 'Cancel')}
                </button>
            </div>
        </form>;
    }

    protected renderAgents(): React.ReactNode {
        const action = (icon: string, title: string, text: string, label: string, command: string) =>
            <div className='bk-setting'>
                <span className={`bk-setting-icon ${codicon(icon)}`} />
                <div className='bk-setting-text'>
                    <div className='bk-setting-label'>{title}</div>
                    <div className='bk-setting-description'>{text}</div>
                </div>
                <div className='bk-setting-control'>
                    <button className='theia-button secondary' onClick={() => this.run(command)}>{label}</button>
                </div>
            </div>;
        return <div className='bk-settings-group'>
            {action('plug', nls.localize('brokspace/settings/connectAgents', 'Connect coding agents'),
                nls.localize('brokspace/settings/connectAgentsText',
                    'Gives Claude Code, Cursor, VS Code / Copilot and Codex Brokspace search and memory over MCP, plus the skills.'),
                nls.localize('brokspace/settings/connect', 'Connect'), BrokspaceCommands.CONNECT_AGENTS.id)}
            {action('export', BrokspaceCommands.EXPORT_SKILLS.label ?? '',
                nls.localize('brokspace/settings/exportSkillsText', 'Copies the skills to .claude/skills and .agents/skills again, after you add or change one.'),
                nls.localize('brokspace/settings/export', 'Export'), BrokspaceCommands.EXPORT_SKILLS.id)}
            {action('library', nls.localize('brokspace/settings/browseShards', 'Shards'),
                nls.localize('brokspace/settings/browseShardsText', 'Shards add integrations and skill packs. Manage them in the Brokspace view.'),
                nls.localize('brokspace/settings/manage', 'Manage'), BrokspaceCommands.SHOW.id)}
        </div>;
    }

    protected renderDiagnostics(): React.ReactNode {
        const state = this.model.state;
        if (state.kind !== 'ready') {
            return undefined;
        }
        return <>
            <div className='bk-settings-group'>
                <dl className='bk-props bk-props-wide'>
                    <dt>brok</dt><dd className='bk-mono'>{state.info.version} · {state.info.path}</dd>
                    <dt>{nls.localize('brokspace/settings/backends', 'Backends')}</dt><dd>{(state.status.backends ?? []).join(', ') || '—'}</dd>
                    <dt>{nls.localize('brokspace/settings/embeddings', 'Embeddings')}</dt>
                    <dd>{state.status.embeddings?.enabled ? `${state.status.embeddings.model} · ${state.status.embeddings.dimensions}d`
                        : nls.localize('brokspace/settings/off', 'Off')}</dd>
                    {(state.status.index ?? []).map(p => <React.Fragment key={`${p.tier}:${p.path}`}>
                        <dt>{p.tier === 'cold' ? nls.localize('brokspace/settings/root', 'Root') : p.path}</dt>
                        <dd>{nls.localize('brokspace/settings/partition', '{0} files · {1} chunks · {2}', p.files.toLocaleString(), p.chunks.toLocaleString(), p.backend)}</dd>
                    </React.Fragment>)}
                </dl>
            </div>
            <div className='bk-buttons'>
                <button className='theia-button main' onClick={() => this.run(BrokspaceCommands.DOCTOR.id)}>{BrokspaceCommands.DOCTOR.label}</button>
                <button className='theia-button secondary' onClick={() => this.run(BrokspaceCommands.SHOW_LOGS.id)}>{BrokspaceCommands.SHOW_LOGS.label}</button>
                <button className='theia-button secondary' onClick={() => this.openConfigFile()}>{nls.localize('brokspace/settings/openConfig', 'Open brok.yml')}</button>
            </div>
        </>;
    }

    // ------------------------------------------------------------------ controls

    protected row(key: string, label: string, description: string, control: React.ReactNode): React.ReactNode {
        const feedback = this.feedback.get(key);
        return <div className='bk-setting' key={key}>
            <div className='bk-setting-text'>
                <label className='bk-setting-label' htmlFor={`bk-${key}`}>{label}</label>
                {description && <div className='bk-setting-description'>{description}</div>}
                {feedback && <div className={feedback.ok ? 'bk-saved' : 'bk-error'}>{feedback.text}</div>}
            </div>
            <div className='bk-setting-control'>{control}</div>
        </div>;
    }

    protected toggle(key: string, value: boolean, label: string, description: string, disabled = false): React.ReactNode {
        return this.row(key, label, description,
            <input id={`bk-${key}`} type='checkbox' role='switch' className='bk-switch' checked={value} disabled={disabled || this.busy.has(key)}
                onChange={e => this.save(key, e.currentTarget.checked)} />);
    }

    protected number(key: string, value: number, label: string, description: string, min: number, max: number, step: number): React.ReactNode {
        const commit = (input: HTMLInputElement) => {
            const next = Number(input.value);
            if (input.value !== '' && Number.isFinite(next) && next !== value) {
                this.save(key, Math.min(max, Math.max(min, next)));
            }
        };
        return this.row(key, label, description,
            <input id={`bk-${key}`} key={`${key}:${value}`} type='number' className='theia-input bk-number' defaultValue={value} min={min} max={max} step={step}
                onBlur={e => commit(e.currentTarget)} onKeyDown={e => e.key === 'Enter' && commit(e.currentTarget)} />);
    }

    protected text(key: string, value: string, label: string, description: string, placeholder = '', optional = false): React.ReactNode {
        const commit = (input: HTMLInputElement) => {
            const next = input.value.trim();
            if (next === value) {
                return;
            }
            if (!next && optional) {
                this.unset(key);
            } else if (next) {
                this.save(key, next);
            }
        };
        return this.row(key, label, description,
            <input id={`bk-${key}`} key={`${key}:${value}`} className='theia-input bk-text' defaultValue={value} placeholder={placeholder} spellCheck={false}
                onBlur={e => commit(e.currentTarget)} onKeyDown={e => e.key === 'Enter' && commit(e.currentTarget)} />);
    }

    protected list(key: string, values: string[], label: string, description: string): React.ReactNode {
        const commit = (area: HTMLTextAreaElement) => {
            const next = area.value.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
            if (next.join('\n') !== values.join('\n')) {
                this.save(key, next);
            }
        };
        return this.row(key, label, description,
            <textarea id={`bk-${key}`} key={`${key}:${values.join('|')}`} className='theia-input bk-textarea bk-mono' rows={Math.min(10, values.length + 1)}
                defaultValue={values.join('\n')} spellCheck={false} onBlur={e => commit(e.currentTarget)} />);
    }

    protected select(key: string, value: string, options: [string, string][], label: string, description: string): React.ReactNode {
        return this.row(key, label, description,
            <select id={`bk-${key}`} className='theia-select' value={value} disabled={this.busy.has(key)} onChange={e => this.save(key, e.currentTarget.value)}>
                {options.map(([id, text]) => <option key={id} value={id}>{text}</option>)}
            </select>);
    }

    protected iconButton(icon: string, title: string, onClick: () => void): React.ReactNode {
        return <button type='button' className={`bk-icon-button ${codicon(icon)}`} title={title} aria-label={title}
            onClick={e => { e.stopPropagation(); onClick(); }} />;
    }

    protected loadingConfig(): React.ReactNode {
        return <div className='bk-muted'>{this.configError ? '' : nls.localize('brokspace/view/loading', 'Loading…')}</div>;
    }

    // ------------------------------------------------------------------ actions

    protected run(command: string, ...args: unknown[]): void {
        this.commands.executeCommand(command, ...args);
    }

    protected async save(key: string, value: unknown): Promise<void> {
        await this.change(key, root => this.service.setConfig(root, key, value));
    }

    protected async unset(key: string): Promise<void> {
        await this.change(key, root => this.service.unsetConfig(root, key));
    }

    protected async change(key: string, apply: (root: string) => Promise<void>): Promise<void> {
        const root = this.model.root;
        if (!root) {
            return;
        }
        this.busy.add(key);
        this.update();
        try {
            await apply(root);
            this.feedback.set(key, { ok: true, text: nls.localize('brokspace/settings/saved', 'Saved') });
            this.needsRestart = true;
            setTimeout(() => {
                if (this.feedback.get(key)?.ok) {
                    this.feedback.delete(key);
                    this.update();
                }
            }, 2500);
        } catch (error) {
            this.feedback.set(key, { ok: false, text: message(error) });
        } finally {
            this.busy.delete(key);
            await this.loadConfig();
            this.model.refresh();
        }
    }

    protected async restart(): Promise<void> {
        this.needsRestart = false;
        this.update();
        await this.commands.executeCommand(BrokspaceCommands.RESTART.id);
    }

    protected async saveDraft(): Promise<void> {
        const draft = this.draft;
        this.busy.add('memory');
        this.update();
        try {
            await this.memory.save({
                title: draft.title, body: draft.body, kind: draft.kind, scope: draft.scope,
                tags: draft.tags.split(',').map(tag => tag.trim()).filter(Boolean),
            });
            this.draft = emptyDraft();
            this.showDraft = false;
        } catch (error) {
            this.messages.error(message(error));
        } finally {
            this.busy.delete('memory');
            this.update();
        }
    }

    protected async forget(memory: Memory): Promise<void> {
        const forget = nls.localize('brokspace/settings/forget', 'Forget');
        const answer = await this.messages.warn(nls.localize('brokspace/settings/forgetConfirm', 'Forget "{0}"?', memory.title),
            forget, nls.localize('brokspace/prompt/cancel', 'Cancel'));
        if (answer === forget) {
            await this.memory.forget(memory).catch(error => this.messages.error(message(error)));
        }
    }

    protected async chooseFolder(): Promise<void> {
        const uri = await this.fileDialog.showOpenDialog({
            title: nls.localize('brokspace/settings/chooseFolder', 'Choose folder…'), canSelectFolders: true, canSelectFiles: false,
        });
        if (uri) {
            const target = uri.path.fsPath();
            this.linkDraft = { ...this.linkDraft, target, name: this.linkDraft.name || suggestName(target) };
            this.update();
        }
    }

    protected async addLink(): Promise<void> {
        const root = this.model.root;
        const { open: _open, ...link } = this.linkDraft;
        if (!root) {
            return;
        }
        this.busy.add('link');
        this.update();
        try {
            await this.service.addLink(root, { ...link, name: link.name.trim(), target: link.target.trim() });
            this.linkDraft = emptyLink();
            this.messages.info(nls.localize('brokspace/settings/linked', 'Linked {0}. Questions and searches now include it.', link.name));
        } catch (error) {
            this.messages.error(message(error));
        } finally {
            this.busy.delete('link');
            await this.model.refresh();
            this.update();
        }
    }

    protected async removeLink(link: LinkStatus): Promise<void> {
        const root = this.model.root;
        const unlink = nls.localize('brokspace/settings/unlinkAction', 'Unlink');
        const answer = await this.messages.warn(nls.localize('brokspace/settings/unlinkConfirm',
            'Unlink {0}? Its folder is not touched; the copy and index Brokspace keeps for it are deleted.', link.name),
            unlink, nls.localize('brokspace/prompt/cancel', 'Cancel'));
        if (root && answer === unlink) {
            await this.service.removeLink(root, link.name).catch(error => this.messages.error(message(error)));
            await this.model.refresh();
        }
    }

    protected async syncLinks(name?: string): Promise<void> {
        const root = this.model.root;
        if (!root) {
            return;
        }
        const key = name ? `sync:${name}` : 'sync';
        this.busy.add(key);
        this.update();
        try {
            const failed = (await this.service.syncLinks(root, name ? [name] : [])).filter(result => result.error);
            if (failed.length) {
                this.messages.warn(failed.map(result => `${result.name}: ${result.error}`).join('\n'));
            }
        } catch (error) {
            this.messages.error(message(error));
        } finally {
            this.busy.delete(key);
            await this.model.refresh();
            this.update();
        }
    }

    protected async addProvider(): Promise<void> {
        await this.commands.executeCommand(BrokspaceCommands.ADD_PROVIDER.id);
        await this.loadConfig();
    }

    protected openConfigFile(): void {
        const root = this.model.rootUri;
        if (root) {
            open(this.opener, root.resolve('.brokspace/brok.yml'));
        }
    }
}

export function sectionTitle(section: SettingsSection): string {
    switch (section) {
        case 'overview': return nls.localize('brokspace/settings/overview', 'Overview');
        case 'model': return nls.localize('brokspace/settings/model', 'AI model');
        case 'search': return nls.localize('brokspace/settings/searchIndex', 'Search and index');
        case 'memory': return nls.localize('brokspace/settings/memory', 'Memory');
        case 'links': return nls.localize('brokspace/settings/links', 'Linked workspaces');
        case 'agents': return nls.localize('brokspace/settings/agents', 'Coding agents');
        case 'diagnostics': return nls.localize('brokspace/settings/diagnostics', 'Diagnostics');
    }
}

function sectionDescription(section: SettingsSection): string {
    switch (section) {
        case 'overview': return nls.localize('brokspace/settings/overviewText', 'This workspace at a glance.');
        case 'model': return nls.localize('brokspace/settings/modelText', 'The LLM brok sends questions to. Without one, Brokspace answers from the local index.');
        case 'search': return nls.localize('brokspace/settings/searchText', 'What gets indexed and how results are ranked.');
        case 'memory': return nls.localize('brokspace/settings/memoryText',
            'What Brokspace remembers between sessions: private to you, shared with your team through git, or global to all your workspaces.');
        case 'links': return nls.localize('brokspace/settings/linksText',
            'Other workspaces this one depends on, on this machine or as git repositories. Their code and memories are searched with yours.');
        case 'agents': return nls.localize('brokspace/settings/agentsText', 'Brokspace in the coding agents you already use.');
        case 'diagnostics': return nls.localize('brokspace/settings/diagnosticsText', 'Versions, index details and health checks.');
    }
}

export function kindLabel(kind: Memory['kind']): string {
    switch (kind) {
        case 'note': return nls.localize('brokspace/memory/note', 'Note');
        case 'decision': return nls.localize('brokspace/memory/decision', 'Decision');
        case 'fact': return nls.localize('brokspace/memory/fact', 'Fact');
        case 'session': return nls.localize('brokspace/memory/session', 'Session');
        case 'handoff': return nls.localize('brokspace/memory/handoff', 'Handoff');
        case 'link': return nls.localize('brokspace/memory/link', 'Link');
    }
}

export function scopeLabel(scope: MemoryScope): string {
    switch (scope) {
        case 'private': return nls.localize('brokspace/memory/private', 'Private');
        case 'shared': return nls.localize('brokspace/memory/shared', 'Shared');
        case 'global': return nls.localize('brokspace/memory/global', 'Global');
    }
}

export function scopeDescription(scope: MemoryScope): string {
    switch (scope) {
        case 'private': return nls.localize('brokspace/memory/privateText', 'Private: only me, this workspace');
        case 'shared': return nls.localize('brokspace/memory/sharedText', 'Shared: my team, through git');
        case 'global': return nls.localize('brokspace/memory/globalText', 'Global: me, every workspace');
    }
}

function emptyDraft(): { title: string; body: string; kind: MemoryKind; scope: MemoryScope; tags: string } {
    return { title: '', body: '', kind: 'note', scope: 'private', tags: '' };
}

function emptyLink(): LinkInput & { open: boolean } {
    return { name: '', target: '', branch: '', description: '', memory: true, open: false };
}

/** `../checkout`, `https://github.com/acme/checkout.git` -> `checkout` */
export function suggestName(target: string): string {
    const last = target.trim().replace(/[\\/]+$/, '').split(/[\\/:]/).pop() ?? '';
    return last.replace(/\.git$/, '').replace(/[^A-Za-z0-9._-]/g, '-').replace(/^[.-]+/, '').slice(0, 64);
}

export function firstLine(text: string): string {
    return text.split('\n').map(line => line.replace(/^[#>*\-\s]+/, '').trim()).find(Boolean) ?? '';
}

function message(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
