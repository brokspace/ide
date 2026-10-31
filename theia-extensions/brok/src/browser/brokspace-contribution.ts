// *****************************************************************************
// Copyright (C) 2026 Brokspace contributors.
//
// SPDX-License-Identifier: MIT
// *****************************************************************************

import { ChatAgentLocation, ChatAgentService } from '@theia/ai-chat/lib/common';
import { ChatService } from '@theia/ai-chat/lib/common/chat-service';
import { AIChatContribution } from '@theia/ai-chat-ui/lib/browser/ai-chat-ui-contribution';
import { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application-contribution';
import { QuickInputService } from '@theia/core/lib/browser/quick-input/quick-input-service';
import { AbstractViewContribution } from '@theia/core/lib/browser/shell/view-contribution';
import { StatusBar, StatusBarAlignment } from '@theia/core/lib/browser/status-bar/status-bar';
import { TabBarToolbarContribution, TabBarToolbarRegistry } from '@theia/core/lib/browser/shell/tab-bar-toolbar';
import { Widget } from '@theia/core/lib/browser/widgets/widget';
import { WindowService } from '@theia/core/lib/browser/window/window-service';
import { CommandRegistry } from '@theia/core/lib/common/command';
import { MAIN_MENU_BAR, MenuModelRegistry } from '@theia/core/lib/common/menu';
import { MessageService } from '@theia/core/lib/common/message-service';
import { inject, injectable } from '@theia/core/shared/inversify';
import { OutputChannel, OutputChannelManager } from '@theia/output/lib/browser/output-channel';
import { ScmService } from '@theia/scm/lib/browser/scm-service';
import { ScmWidget } from '@theia/scm/lib/browser/scm-widget';
import { BrokService } from '../common/brok-protocol';
import { BROKSPACE_AGENT_ID } from './brokspace-chat-agent';
import { BrokspaceCommands } from './brokspace-commands';
import { BrokspaceModel, BrokspaceState } from './brokspace-model';
import { BrokspaceWidget } from './brokspace-widget';

export const BROKSPACE_MENU = [...MAIN_MENU_BAR, '7_brokspace'];
const STATUS_BAR_ID = 'brokspace-status';
const INSTALL_URL = 'https://github.com/brokspace/brok/blob/main/docs/getting-started.md#1-install-brok';

@injectable()
export class BrokspaceContribution extends AbstractViewContribution<BrokspaceWidget>
    implements FrontendApplicationContribution, TabBarToolbarContribution {

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

    constructor() {
        super({
            widgetId: BrokspaceWidget.ID,
            widgetName: BrokspaceWidget.LABEL,
            defaultWidgetOptions: { area: 'left', rank: 150 },
            toggleCommandId: BrokspaceCommands.SHOW.id,
        });
    }

    onStart(): void {
        this.model.onDidChange(state => this.updateStatusBar(state));
        this.updateStatusBar(this.model.state);
    }

    async initializeLayout(): Promise<void> {
        await this.openView({ activate: false });
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
        switch (state.kind) {
            case 'ready': {
                const running = state.status.daemon?.running;
                const model = state.status.llm?.model ?? state.status.llm?.provider ?? '';
                entry(`${running ? 'Running' : 'Stopped'}${model ? ` · ${model}` : ''}`,
                    `Brokspace ${running ? 'is running: the index follows your edits' : 'is stopped: start it for live indexing'}. Click to open.`);
                break;
            }
            case 'not-initialized':
                entry('Set up', 'This folder has no Brokspace workspace yet. Click to set it up.', 'brokspace-status-attention');
                break;
            case 'no-brok':
                entry('brok not found', 'Install brok to use Brokspace.', 'brokspace-status-attention');
                break;
            case 'outdated':
                entry(`brok ${state.info.version}`, 'This IDE needs brok 0.2.4 or newer.', 'brokspace-status-attention');
                break;
            case 'error':
                entry('Error', state.message, 'brokspace-status-attention');
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
            execute: async () => (await this.openView({ activate: true, reveal: true })).focusSearch(),
        });
        registry.registerCommand(BrokspaceCommands.ASK, {
            execute: async (prompt?: unknown) => {
                const text = typeof prompt === 'string' && prompt.trim() ? prompt : await this.quickInput.input({
                    prompt: 'Ask Brokspace about this workspace',
                    placeHolder: 'e.g. How are refresh tokens rotated?',
                });
                if (text) {
                    await this.sendToAgent(text);
                } else if (text === undefined && typeof prompt !== 'string') {
                    return;
                } else {
                    await this.openChat();
                }
            },
        });
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
                        { placeholder: 'Run a skill on your LLM' });
                    skill = pick?.label;
                }
                if (!skill) {
                    return;
                }
                const input = await this.quickInput.input({ prompt: `What should ${skill} work on?`, placeHolder: 'A task, a question, a file...' });
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
            execute: () => this.runInOutput('Setting up Brokspace', ['init', '--yes'], 'Brokspace is ready.'),
        });
        registry.registerCommand(BrokspaceCommands.START, { isEnabled: ready, execute: () => this.runQuiet(['start'], 'Brokspace started.') });
        registry.registerCommand(BrokspaceCommands.STOP, { isEnabled: ready, execute: () => this.runQuiet(['stop'], 'Brokspace stopped.') });
        registry.registerCommand(BrokspaceCommands.RESTART, { isEnabled: ready, execute: () => this.runQuiet(['restart'], 'Brokspace restarted.') });
        registry.registerCommand(BrokspaceCommands.REINDEX, {
            isEnabled: ready,
            execute: () => this.runInOutput('Rebuilding the index', ['index', '--rebuild'], 'Index rebuilt.'),
        });
        registry.registerCommand(BrokspaceCommands.DOCTOR, { execute: () => this.runInOutput('Brokspace doctor', ['doctor']) });
        registry.registerCommand(BrokspaceCommands.EXPORT_SKILLS, {
            isEnabled: ready,
            execute: () => this.runInOutput('Exporting skills', ['skill', 'export'], 'Skills exported to your coding agents.'),
        });
        registry.registerCommand(BrokspaceCommands.INSTALL_SHARD, {
            isEnabled: ready,
            execute: async () => {
                const source = await this.quickInput.input({
                    prompt: 'Install a shard: a git URL or a local folder. Its permissions are listed in the output.',
                    placeHolder: 'https://github.com/someone/some-shard',
                });
                if (source) {
                    const approved = await this.messages.info(
                        `Install ${source}? A shard runs on your machine with the permissions its shard.json declares.`, 'Install', 'Cancel');
                    if (approved === 'Install') {
                        await this.runInOutput(`Installing ${source}`, ['shard', 'install', '--yes', source], 'Shard installed. Restart Brokspace to start it.');
                    }
                }
            },
        });
        registry.registerCommand(BrokspaceCommands.REMOVE_SHARD, {
            isEnabled: ready,
            execute: async (name?: unknown) => {
                if (typeof name === 'string' && await this.messages.warn(`Remove the shard ${name}?`, 'Remove', 'Cancel') === 'Remove') {
                    await this.runQuiet(['shard', 'remove', name], `Removed ${name}.`);
                }
            },
        });
        registry.registerCommand(BrokspaceCommands.INSTALL_HELP, {
            execute: () => this.windowService.openNewWindow(INSTALL_URL, { external: true }),
        });
        registry.registerCommand(BrokspaceCommands.REFRESH, { execute: () => this.model.refresh() });
    }

    override registerMenus(menus: MenuModelRegistry): void {
        super.registerMenus(menus);
        menus.registerSubmenu(BROKSPACE_MENU, 'Brokspace');
        const group = (order: string, ...commands: { id: string; label?: string }[]) => commands.forEach((command, i) =>
            menus.registerMenuAction([...BROKSPACE_MENU, order], { commandId: command.id, label: command.label, order: String(i) }));
        group('1_agent', BrokspaceCommands.ASK, BrokspaceCommands.REVIEW, BrokspaceCommands.REVIEW_STAGED,
            BrokspaceCommands.COMMIT_MESSAGE, BrokspaceCommands.RUN_SKILL);
        group('2_search', BrokspaceCommands.SEARCH, BrokspaceCommands.SHOW);
        group('3_service', BrokspaceCommands.START, BrokspaceCommands.STOP, BrokspaceCommands.RESTART, BrokspaceCommands.REINDEX);
        group('4_workspace', BrokspaceCommands.SETUP, BrokspaceCommands.INSTALL_SHARD, BrokspaceCommands.EXPORT_SKILLS, BrokspaceCommands.DOCTOR);
    }

    registerToolbarItems(toolbar: TabBarToolbarRegistry): void {
        toolbar.registerItem({
            id: 'brokspace.scm.commitMessage',
            command: BrokspaceCommands.COMMIT_MESSAGE.id,
            tooltip: 'Write the commit message with Brokspace (from the staged changes)',
            icon: 'codicon codicon-sparkle',
            priority: -1,
            isVisible: (widget: Widget) => widget instanceof ScmWidget,
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

    protected async writeCommitMessage(): Promise<void> {
        const root = this.model.root;
        const repository = this.scm.selectedRepository;
        if (!root || !repository) {
            return;
        }
        const progress = await this.messages.showProgress({ text: 'Writing the commit message from the staged changes…' });
        try {
            repository.input.value = await this.service.commitMessage(root);
        } catch (error) {
            this.messages.error(`Brokspace could not write the commit message: ${error instanceof Error ? error.message : error}`);
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
            this.messages.warn('Open a folder first.');
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
            this.messages.error(`${title} failed. See the Brokspace output for details.`);
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
            this.messages.error(`brok ${args.join(' ')} failed: ${(result.stderr || result.stdout).trim()}`);
        }
        await this.model.refresh();
    }
}
