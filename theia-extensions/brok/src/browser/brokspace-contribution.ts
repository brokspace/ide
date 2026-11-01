// *****************************************************************************
// Copyright (C) 2026 Brokspace contributors.
//
// SPDX-License-Identifier: MIT
// *****************************************************************************

import { ChatAgentLocation, ChatAgentService } from '@theia/ai-chat/lib/common';
import { ChatService } from '@theia/ai-chat/lib/common/chat-service';
import { AIChatContribution } from '@theia/ai-chat-ui/lib/browser/ai-chat-ui-contribution';
import { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application-contribution';
import { KeybindingContribution, KeybindingRegistry } from '@theia/core/lib/browser/keybinding';
import { QuickInputService } from '@theia/core/lib/browser/quick-input/quick-input-service';
import { AbstractViewContribution } from '@theia/core/lib/browser/shell/view-contribution';
import { TabBarToolbarContribution, TabBarToolbarRegistry } from '@theia/core/lib/browser/shell/tab-bar-toolbar';
import { StatusBar, StatusBarAlignment } from '@theia/core/lib/browser/status-bar/status-bar';
import { ViewContainer, ViewContainerTitleOptions } from '@theia/core/lib/browser/view-container';
import { WidgetManager } from '@theia/core/lib/browser/widget-manager';
import { Widget } from '@theia/core/lib/browser/widgets/widget';
import { WindowService } from '@theia/core/lib/browser/window/window-service';
import { CommandRegistry } from '@theia/core/lib/common/command';
import { MAIN_MENU_BAR, MenuModelRegistry } from '@theia/core/lib/common/menu';
import { MessageService } from '@theia/core/lib/common/message-service';
import { nls } from '@theia/core/lib/common/nls';
import { inject, injectable } from '@theia/core/shared/inversify';
import { OutputChannel, OutputChannelManager } from '@theia/output/lib/browser/output-channel';
import { ScmService } from '@theia/scm/lib/browser/scm-service';
import { ScmWidget } from '@theia/scm/lib/browser/scm-widget';
import { BrokService } from '../common/brok-protocol';
import { BROKSPACE_AGENT_ID } from './brokspace-chat-agent';
import { BrokspaceCommands } from './brokspace-commands';
import { BrokspaceModel, BrokspaceState } from './brokspace-model';
import { BrokspaceOverviewWidget, BrokspaceShardsWidget, BrokspaceSkillsWidget } from './brokspace-widget';

export const BROKSPACE_MENU = [...MAIN_MENU_BAR, '7_brokspace'];
export const BROKSPACE_VIEW_CONTAINER_ID = 'brokspace-view-container';
const STATUS_BAR_ID = 'brokspace-status';
const INSTALL_URL = 'https://github.com/brokspace/brok/blob/main/docs/getting-started.md#1-install-brok';
const HUB_URL = 'https://brokspace.org/docs/hub';
/** Views a fresh layout leaves out of the side bars; their commands and shortcuts still open them. */
const HIDDEN_BY_DEFAULT = ['debug', 'vsx-extensions-view-container', 'test-view-container', 'outline-view'];
/** Share of the window the agent takes in focus mode. */
const AGENT_FOCUS_WIDTH = 0.7;

export const BROKSPACE_VIEW_TITLE: ViewContainerTitleOptions = {
    label: 'Brokspace',
    iconClass: 'brokspace-view-icon',
    closeable: true,
};

@injectable()
export class BrokspaceContribution extends AbstractViewContribution<ViewContainer>
    implements FrontendApplicationContribution, TabBarToolbarContribution, KeybindingContribution {

    @inject(BrokService) protected readonly service: BrokService;
    @inject(BrokspaceModel) protected readonly model: BrokspaceModel;
    @inject(StatusBar) protected readonly statusBar: StatusBar;
    @inject(OutputChannelManager) protected readonly outputs: OutputChannelManager;
    @inject(MessageService) protected readonly messages: MessageService;
    @inject(QuickInputService) protected readonly quickInput: QuickInputService;
    @inject(WindowService) protected readonly windowService: WindowService;
    @inject(ScmService) protected readonly scm: ScmService;
    @inject(ChatService) protected readonly chatService: ChatService;
    @inject(ChatAgentService) protected readonly chatAgents: ChatAgentService;
    @inject(AIChatContribution) protected readonly chatView: AIChatContribution;
    @inject(WidgetManager) protected readonly widgets: WidgetManager;

    /** Set when this window starts without a saved layout. */
    protected freshLayout = false;
    /** What focus mode changed, to put back when it ends. */
    protected focusRestore: { leftExpanded: boolean; rightWidth: number } | undefined;

    constructor() {
        super({
            widgetId: BROKSPACE_VIEW_CONTAINER_ID,
            widgetName: BROKSPACE_VIEW_TITLE.label,
            defaultWidgetOptions: { area: 'left', rank: 150 },
            toggleCommandId: BrokspaceCommands.SHOW.id,
        });
    }

    onStart(): void {
        this.model.onDidChange(state => this.updateStatusBar(state));
        this.updateStatusBar(this.model.state);
    }

    async initializeLayout(): Promise<void> {
        this.freshLayout = true;
        await this.openView({ activate: false });
    }

    /**
     * A first layout is minimal: Explorer, Search, Source Control and
     * Brokspace on the left, the Brokspace agent on the right.
     */
    async onDidInitializeLayout(): Promise<void> {
        if (!this.freshLayout) {
            return;
        }
        for (const widget of [...this.shell.getWidgets('left'), ...this.shell.getWidgets('right')]) {
            if (HIDDEN_BY_DEFAULT.includes(widget.id)) {
                widget.close();
            }
        }
        await this.chatView.openView({ activate: false, reveal: true });
    }

    protected async overview(): Promise<BrokspaceOverviewWidget> {
        await this.openView({ activate: true, reveal: true });
        return this.widgets.getOrCreateWidget<BrokspaceOverviewWidget>(BrokspaceOverviewWidget.ID);
    }

    // ---------------------------------------------------------------- status bar

    protected updateStatusBar(state: BrokspaceState): void {
        const entry = (text: string, tooltip: string, className?: string) => this.statusBar.setElement(STATUS_BAR_ID, {
            text: `$(brokspace-mark) ${text}`,
            tooltip,
            alignment: StatusBarAlignment.LEFT,
            priority: 100,
            className,
            command: BrokspaceCommands.SHOW.id,
        });
        const attention = 'brokspace-status-attention';
        switch (state.kind) {
            case 'ready': {
                const running = state.status.daemon?.running;
                const model = state.status.llm?.model ?? '';
                const label = running ? nls.localize('brokspace/view/running', 'Running') : nls.localize('brokspace/view/stopped', 'Stopped');
                entry(model ? `${label} · ${model}` : label, running
                    ? nls.localize('brokspace/status/runningTooltip', 'Brokspace is running: the index follows your edits. Click to open.')
                    : nls.localize('brokspace/status/stoppedTooltip', 'Brokspace is stopped: start it for live indexing. Click to open.'));
                break;
            }
            case 'not-initialized':
                entry(nls.localize('brokspace/status/setUp', 'Set up'),
                    nls.localize('brokspace/status/setUpTooltip', 'This folder has no Brokspace workspace yet. Click to set it up.'), attention);
                break;
            case 'no-brok':
                entry(nls.localize('brokspace/status/noBrok', 'brok not found'),
                    nls.localize('brokspace/status/noBrokTooltip', 'Install brok to use Brokspace.'), attention);
                break;
            case 'outdated':
                entry(`brok ${state.info.version}`, nls.localize('brokspace/view/outdatedText', 'This IDE needs brok 0.2.4 or newer. Run "brok upgrade" in a terminal.'),
                    attention);
                break;
            case 'error':
                entry(nls.localize('brokspace/status/error', 'Error'), state.message, attention);
                break;
            default:
                this.statusBar.removeElement(STATUS_BAR_ID);
        }
    }

    // ---------------------------------------------------------------- commands

    override registerCommands(registry: CommandRegistry): void {
        super.registerCommands(registry);
        const ready = () => this.model.state.kind === 'ready';

        registry.registerCommand(BrokspaceCommands.SEARCH, {
            execute: async () => (await this.overview()).focusSearch(),
        });
        registry.registerCommand(BrokspaceCommands.ASK, {
            execute: async (prompt?: unknown) => {
                if (typeof prompt === 'string' && prompt.trim()) {
                    await this.sendToAgent(prompt);
                } else {
                    await this.openChat();
                }
            },
        });
        registry.registerCommand(BrokspaceCommands.TOGGLE_AGENT, { execute: () => this.toggleAgentFocus() });
        registry.registerCommand(BrokspaceCommands.REVIEW, { execute: () => this.sendToAgent('/review'), isEnabled: ready });
        registry.registerCommand(BrokspaceCommands.REVIEW_STAGED, { execute: () => this.sendToAgent('/review staged'), isEnabled: ready });
        registry.registerCommand(BrokspaceCommands.RUN_SKILL, {
            isEnabled: ready,
            execute: async (name?: unknown) => {
                const root = this.model.root;
                if (!root) {
                    return;
                }
                let skill = typeof name === 'string' ? name : undefined;
                if (!skill) {
                    const skills = await this.service.skills(root);
                    const pick = await this.quickInput.showQuickPick(
                        skills.map(s => ({ label: s.name, description: s.source, detail: s.description })),
                        { placeholder: nls.localize('brokspace/prompt/pickSkill', 'Run a skill on your LLM') });
                    skill = pick?.label;
                }
                if (!skill) {
                    return;
                }
                const input = await this.quickInput.input({
                    prompt: nls.localize('brokspace/prompt/skillInput', 'What should {0} work on?', skill),
                    placeHolder: nls.localize('brokspace/prompt/skillInputPlaceholder', 'A task, a question, a file…'),
                });
                if (input !== undefined) {
                    await this.sendToAgent(`/skill ${skill} ${input}`);
                }
            },
        });
        registry.registerCommand(BrokspaceCommands.COMMIT_MESSAGE, {
            isEnabled: () => ready() && !!this.scm.selectedRepository,
            isVisible: (widget?: Widget) => !widget || widget instanceof ScmWidget,
            execute: () => this.writeCommitMessage(),
        });
        registry.registerCommand(BrokspaceCommands.SETUP, {
            execute: () => this.runInOutput(nls.localize('brokspace/run/setup', 'Setting up Brokspace'), ['init', '--yes'],
                nls.localize('brokspace/run/setupDone', 'Brokspace is ready.')),
        });
        registry.registerCommand(BrokspaceCommands.START, {
            isEnabled: ready, execute: () => this.runQuiet(['start'], nls.localize('brokspace/run/started', 'Brokspace started.')),
        });
        registry.registerCommand(BrokspaceCommands.STOP, {
            isEnabled: ready, execute: () => this.runQuiet(['stop'], nls.localize('brokspace/run/stopped', 'Brokspace stopped.')),
        });
        registry.registerCommand(BrokspaceCommands.RESTART, {
            isEnabled: ready, execute: () => this.runQuiet(['restart'], nls.localize('brokspace/run/restarted', 'Brokspace restarted.')),
        });
        registry.registerCommand(BrokspaceCommands.REINDEX, {
            isEnabled: ready,
            execute: () => this.runInOutput(nls.localize('brokspace/run/reindex', 'Rebuilding the index'), ['index', '--rebuild'],
                nls.localize('brokspace/run/reindexDone', 'Index rebuilt.')),
        });
        registry.registerCommand(BrokspaceCommands.DOCTOR, {
            execute: () => this.runInOutput(nls.localize('brokspace/run/doctor', 'Brokspace doctor'), ['doctor']),
        });
        registry.registerCommand(BrokspaceCommands.EXPORT_SKILLS, {
            isEnabled: ready,
            execute: () => this.runInOutput(nls.localize('brokspace/run/exportSkills', 'Exporting skills'), ['skill', 'export'],
                nls.localize('brokspace/run/exportSkillsDone', 'Skills exported to your coding agents.')),
        });
        registry.registerCommand(BrokspaceCommands.INSTALL_SHARD, { isEnabled: ready, execute: () => this.installShard() });
        registry.registerCommand(BrokspaceCommands.NEW_SHARD, { isEnabled: ready, execute: () => this.newShard() });
        registry.registerCommand(BrokspaceCommands.REMOVE_SHARD, {
            isEnabled: ready,
            execute: async (name?: unknown) => {
                const shard = typeof name === 'string' ? name : await this.pickShard();
                const remove = nls.localize('brokspace/prompt/remove', 'Remove');
                if (shard && await this.messages.warn(nls.localize('brokspace/prompt/removeShard', 'Remove the shard {0}?', shard),
                    remove, nls.localize('brokspace/prompt/cancel', 'Cancel')) === remove) {
                    await this.runQuiet(['shard', 'remove', shard], nls.localize('brokspace/run/removed', 'Removed {0}.', shard));
                }
            },
        });
        registry.registerCommand(BrokspaceCommands.SHARD_DETAILS, {
            isEnabled: ready,
            execute: async (name?: unknown) => {
                const shard = typeof name === 'string' ? name : await this.pickShard();
                if (shard) {
                    await this.openView({ activate: true, reveal: true });
                    (await this.widgets.getOrCreateWidget<BrokspaceShardsWidget>(BrokspaceShardsWidget.ID)).toggle(shard);
                }
            },
        });
        registry.registerCommand(BrokspaceCommands.BROWSE_SHARDS, {
            execute: () => this.windowService.openNewWindow(HUB_URL, { external: true }),
        });
        registry.registerCommand(BrokspaceCommands.INSTALL_HELP, {
            execute: () => this.windowService.openNewWindow(INSTALL_URL, { external: true }),
        });
        registry.registerCommand(BrokspaceCommands.REFRESH, { execute: () => this.model.refresh() });
    }

    override registerMenus(menus: MenuModelRegistry): void {
        super.registerMenus(menus);
        menus.registerSubmenu(BROKSPACE_MENU, 'Brokspace');
        const group = (order: string, ...commands: { id: string }[]) => commands.forEach((command, i) =>
            menus.registerMenuAction([...BROKSPACE_MENU, order], { commandId: command.id, order: String(i) }));
        group('1_agent', BrokspaceCommands.ASK, BrokspaceCommands.TOGGLE_AGENT, BrokspaceCommands.REVIEW, BrokspaceCommands.REVIEW_STAGED,
            BrokspaceCommands.COMMIT_MESSAGE, BrokspaceCommands.RUN_SKILL);
        group('2_search', BrokspaceCommands.SEARCH, BrokspaceCommands.SHOW);
        group('3_shards', BrokspaceCommands.INSTALL_SHARD, BrokspaceCommands.NEW_SHARD, BrokspaceCommands.BROWSE_SHARDS);
        group('4_service', BrokspaceCommands.START, BrokspaceCommands.STOP, BrokspaceCommands.RESTART, BrokspaceCommands.REINDEX);
        group('5_workspace', BrokspaceCommands.SETUP, BrokspaceCommands.EXPORT_SKILLS, BrokspaceCommands.DOCTOR);
    }

    override registerKeybindings(keybindings: KeybindingRegistry): void {
        super.registerKeybindings(keybindings);
        keybindings.registerKeybinding({ command: BrokspaceCommands.TOGGLE_AGENT.id, keybinding: 'ctrlcmd+shift+a' });
        keybindings.registerKeybinding({ command: BrokspaceCommands.SEARCH.id, keybinding: 'ctrlcmd+alt+f' });
    }

    registerToolbarItems(toolbar: TabBarToolbarRegistry): void {
        const part = (widget: Widget | undefined, type: Function) => widget instanceof type;
        toolbar.registerItem({
            id: 'brokspace.scm.commitMessage',
            command: BrokspaceCommands.COMMIT_MESSAGE.id,
            tooltip: nls.localize('brokspace/toolbar/commitMessage', 'Write the commit message with Brokspace (from the staged changes)'),
            icon: 'codicon codicon-sparkle',
            priority: -1,
            isVisible: (widget: Widget) => widget instanceof ScmWidget,
        });
        toolbar.registerItem({
            id: 'brokspace.overview.refresh', command: BrokspaceCommands.REFRESH.id, tooltip: BrokspaceCommands.REFRESH.label,
            icon: 'codicon codicon-refresh', isVisible: (widget: Widget) => part(widget, BrokspaceOverviewWidget),
        });
        toolbar.registerItem({
            id: 'brokspace.shards.install', command: BrokspaceCommands.INSTALL_SHARD.id, tooltip: BrokspaceCommands.INSTALL_SHARD.label,
            icon: 'codicon codicon-add', priority: 0, isVisible: (widget: Widget) => part(widget, BrokspaceShardsWidget),
        });
        toolbar.registerItem({
            id: 'brokspace.shards.new', command: BrokspaceCommands.NEW_SHARD.id, tooltip: BrokspaceCommands.NEW_SHARD.label,
            icon: 'codicon codicon-new-folder', priority: 1, isVisible: (widget: Widget) => part(widget, BrokspaceShardsWidget),
        });
        toolbar.registerItem({
            id: 'brokspace.shards.browse', command: BrokspaceCommands.BROWSE_SHARDS.id, tooltip: BrokspaceCommands.BROWSE_SHARDS.label,
            icon: 'codicon codicon-library', priority: 2, isVisible: (widget: Widget) => part(widget, BrokspaceShardsWidget),
        });
        toolbar.registerItem({
            id: 'brokspace.skills.export', command: BrokspaceCommands.EXPORT_SKILLS.id, tooltip: BrokspaceCommands.EXPORT_SKILLS.label,
            icon: 'codicon codicon-export', isVisible: (widget: Widget) => part(widget, BrokspaceSkillsWidget),
        });
    }

    // ---------------------------------------------------------------- helpers

    /** Opens the chat with the Brokspace agent and sends `text`. */
    async sendToAgent(text: string): Promise<void> {
        const agent = this.chatAgents.getAgent(BROKSPACE_AGENT_ID);
        const session = this.chatService.createSession(ChatAgentLocation.Panel, { focus: true }, agent);
        await this.openChat();
        await this.chatService.sendRequest(session.id, { text });
    }

    protected async openChat(): Promise<void> {
        await this.chatView.openView({ activate: true, reveal: true });
    }

    /**
     * Agent focus mode: the side bar folds away and the agent takes most of
     * the window; toggling again puts both back as they were.
     */
    protected async toggleAgentFocus(): Promise<void> {
        await this.chatView.openView({ activate: true, reveal: true });
        if (this.focusRestore) {
            const { leftExpanded, rightWidth } = this.focusRestore;
            this.focusRestore = undefined;
            this.shell.resize(rightWidth, 'right');
            if (leftExpanded) {
                this.shell.expandPanel('left');
            }
            return;
        }
        const right = document.getElementById('theia-right-content-panel');
        this.focusRestore = { leftExpanded: this.shell.isExpanded('left'), rightWidth: right?.offsetWidth ?? 400 };
        await this.shell.collapsePanel('left');
        this.shell.resize(Math.round(window.innerWidth * AGENT_FOCUS_WIDTH), 'right');
    }

    protected async pickShard(): Promise<string | undefined> {
        const state = this.model.state;
        const shards = state.kind === 'ready' ? state.status.shards ?? [] : [];
        const pick = await this.quickInput.showQuickPick(shards.map(s => ({ label: s.name, description: s.version, detail: s.description })),
            { placeholder: nls.localize('brokspace/prompt/pickShard', 'Choose a shard') });
        return pick?.label;
    }

    protected async installShard(): Promise<void> {
        const source = await this.quickInput.input({
            prompt: nls.localize('brokspace/prompt/installShard', 'Install a shard: a git URL or a local folder. Its permissions are listed in the output.'),
            placeHolder: 'https://github.com/someone/some-shard',
        });
        if (!source) {
            return;
        }
        const install = nls.localize('brokspace/prompt/install', 'Install');
        const approved = await this.messages.info(
            nls.localize('brokspace/prompt/installConfirm', 'Install {0}? A shard runs on your machine with the permissions its shard.json declares.', source),
            install, nls.localize('brokspace/prompt/cancel', 'Cancel'));
        if (approved === install) {
            await this.runInOutput(nls.localize('brokspace/run/installing', 'Installing {0}', source), ['shard', 'install', '--yes', source],
                nls.localize('brokspace/run/installed', 'Shard installed. Restart Brokspace to start it.'));
        }
    }

    protected async newShard(): Promise<void> {
        const root = this.model.rootUri;
        const name = await this.quickInput.input({
            prompt: nls.localize('brokspace/prompt/newShardName', 'Name of the new shard (a folder with that name is created in the workspace)'),
            placeHolder: 'my-shard',
            validateInput: async value => /^[a-z0-9][a-z0-9-]*$/.test(value)
                ? undefined : nls.localize('brokspace/prompt/newShardInvalid', 'Use lowercase letters, digits and dashes.'),
        });
        if (!name || !root) {
            return;
        }
        const code = nls.localize('brokspace/prompt/shardCode', 'Program (Rust)');
        const skills = nls.localize('brokspace/prompt/shardSkills', 'Skills only');
        const kind = await this.quickInput.showQuickPick([
            { label: code, detail: nls.localize('brokspace/prompt/shardCodeDetail', 'Reacts to workspace events, from brok-shard-template') },
            { label: skills, detail: nls.localize('brokspace/prompt/shardSkillsDetail', 'A shard.json and skills/, nothing to build') },
        ], { placeholder: nls.localize('brokspace/prompt/shardKind', 'What kind of shard?') });
        if (kind) {
            await this.runInOutput(nls.localize('brokspace/run/newShard', 'Creating {0}', name),
                ['shard', 'new', name, ...(kind.label === skills ? ['--skills-only'] : [])],
                nls.localize('brokspace/run/newShardDone', 'Created {0}. Install it from its folder when it is ready.', name));
        }
    }

    protected async writeCommitMessage(): Promise<void> {
        const root = this.model.root;
        const repository = this.scm.selectedRepository;
        if (!root || !repository) {
            return;
        }
        const progress = await this.messages.showProgress({
            text: nls.localize('brokspace/run/commitMessage', 'Writing the commit message from the staged changes…'),
        });
        try {
            repository.input.value = await this.service.commitMessage(root);
        } catch (error) {
            this.messages.error(nls.localize('brokspace/run/commitMessageFailed', 'Brokspace could not write the commit message: {0}',
                error instanceof Error ? error.message : String(error)));
        } finally {
            progress.cancel();
        }
    }

    protected get channel(): OutputChannel {
        return this.outputs.getChannel('Brokspace');
    }

    /** Runs a brok command, shows its output, refreshes the status. */
    protected async runInOutput(title: string, args: string[], success?: string): Promise<boolean> {
        const root = this.model.root;
        if (!root) {
            this.messages.warn(nls.localize('brokspace/run/openFolderFirst', 'Open a folder first.'));
            return false;
        }
        const channel = this.channel;
        channel.show({ preserveFocus: true });
        channel.appendLine(`\n${title}: brok ${args.join(' ')}`);
        const progress = await this.messages.showProgress({ text: `${title}…` });
        try {
            const result = await this.service.run(root, args);
            for (const line of `${result.stdout}${result.stderr}`.split(/\r?\n/)) {
                if (line.trim()) {
                    channel.appendLine(line);
                }
            }
            if (result.code === 0) {
                if (success) {
                    this.messages.info(success);
                }
                return true;
            }
            this.messages.error(nls.localize('brokspace/run/failed', '{0} failed. See the Brokspace output for details.', title));
            return false;
        } finally {
            progress.cancel();
            this.model.refresh();
        }
    }

    protected async runQuiet(args: string[], success: string): Promise<void> {
        const root = this.model.root;
        if (!root) {
            return;
        }
        const result = await this.service.run(root, args);
        if (result.code === 0) {
            this.messages.info(success);
        } else {
            this.messages.error(nls.localize('brokspace/run/commandFailed', 'brok {0} failed: {1}', args.join(' '),
                (result.stderr || result.stdout).trim()));
        }
        await this.model.refresh();
    }
}
