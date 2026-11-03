// *****************************************************************************
// Copyright (C) 2026 Brokspace contributors.
//
// SPDX-License-Identifier: MIT
// *****************************************************************************

import { Command } from '@theia/core/lib/common/command';

/** Labels are localized: keys under `brokspace/commands/` (see theia-extensions/product/i18n). */
export namespace BrokspaceCommands {
    const CATEGORY = 'Brokspace';
    const CATEGORY_KEY = 'brokspace/category';

    export const SHOW = Command.toLocalizedCommand({
        id: 'brokspace.show', category: CATEGORY, label: 'Show Brokspace'
    }, 'brokspace/commands/show', CATEGORY_KEY);
    export const SEARCH = Command.toLocalizedCommand({
        id: 'brokspace.search', category: CATEGORY, label: 'Search the Workspace', iconClass: 'codicon codicon-search'
    }, 'brokspace/commands/search', CATEGORY_KEY);
    export const ASK = Command.toLocalizedCommand({
        id: 'brokspace.ask', category: CATEGORY, label: 'Ask Brokspace', iconClass: 'codicon codicon-comment-discussion'
    }, 'brokspace/commands/ask', CATEGORY_KEY);
    export const TOGGLE_AGENT = Command.toLocalizedCommand({
        id: 'brokspace.toggleAgent', category: CATEGORY, label: 'Agent Focus Mode'
    }, 'brokspace/commands/toggleAgent', CATEGORY_KEY);
    export const REVIEW = Command.toLocalizedCommand({
        id: 'brokspace.review', category: CATEGORY, label: 'Review Uncommitted Changes', iconClass: 'codicon codicon-checklist'
    }, 'brokspace/commands/review', CATEGORY_KEY);
    export const REVIEW_STAGED = Command.toLocalizedCommand({
        id: 'brokspace.reviewStaged', category: CATEGORY, label: 'Review Staged Changes'
    }, 'brokspace/commands/reviewStaged', CATEGORY_KEY);
    export const COMMIT_MESSAGE = Command.toLocalizedCommand({
        id: 'brokspace.commitMessage', category: CATEGORY, label: 'Write Commit Message', iconClass: 'codicon codicon-sparkle'
    }, 'brokspace/commands/commitMessage', CATEGORY_KEY);
    export const RUN_SKILL = Command.toLocalizedCommand({
        id: 'brokspace.runSkill', category: CATEGORY, label: 'Run Skill…', iconClass: 'codicon codicon-play'
    }, 'brokspace/commands/runSkill', CATEGORY_KEY);
    export const SETUP = Command.toLocalizedCommand({
        id: 'brokspace.setup', category: CATEGORY, label: 'Set Up Workspace'
    }, 'brokspace/commands/setup', CATEGORY_KEY);
    export const START = Command.toLocalizedCommand({
        id: 'brokspace.start', category: CATEGORY, label: 'Start'
    }, 'brokspace/commands/start', CATEGORY_KEY);
    export const STOP = Command.toLocalizedCommand({
        id: 'brokspace.stop', category: CATEGORY, label: 'Stop'
    }, 'brokspace/commands/stop', CATEGORY_KEY);
    export const RESTART = Command.toLocalizedCommand({
        id: 'brokspace.restart', category: CATEGORY, label: 'Restart'
    }, 'brokspace/commands/restart', CATEGORY_KEY);
    export const REINDEX = Command.toLocalizedCommand({
        id: 'brokspace.reindex', category: CATEGORY, label: 'Rebuild Index'
    }, 'brokspace/commands/reindex', CATEGORY_KEY);
    export const DOCTOR = Command.toLocalizedCommand({
        id: 'brokspace.doctor', category: CATEGORY, label: 'Doctor'
    }, 'brokspace/commands/doctor', CATEGORY_KEY);
    export const INSTALL_SHARD = Command.toLocalizedCommand({
        id: 'brokspace.installShard', category: CATEGORY, label: 'Install Shard…', iconClass: 'codicon codicon-add'
    }, 'brokspace/commands/installShard', CATEGORY_KEY);
    export const NEW_SHARD = Command.toLocalizedCommand({
        id: 'brokspace.newShard', category: CATEGORY, label: 'Create Shard…', iconClass: 'codicon codicon-new-folder'
    }, 'brokspace/commands/newShard', CATEGORY_KEY);
    export const REMOVE_SHARD = Command.toLocalizedCommand({
        id: 'brokspace.removeShard', category: CATEGORY, label: 'Remove Shard…', iconClass: 'codicon codicon-trash'
    }, 'brokspace/commands/removeShard', CATEGORY_KEY);
    export const SHARD_DETAILS = Command.toLocalizedCommand({
        id: 'brokspace.shardDetails', category: CATEGORY, label: 'Shard Details', iconClass: 'codicon codicon-info'
    }, 'brokspace/commands/shardDetails', CATEGORY_KEY);
    export const BROWSE_SHARDS = Command.toLocalizedCommand({
        id: 'brokspace.browseShards', category: CATEGORY, label: 'Browse Shards', iconClass: 'codicon codicon-library'
    }, 'brokspace/commands/browseShards', CATEGORY_KEY);
    export const EXPORT_SKILLS = Command.toLocalizedCommand({
        id: 'brokspace.exportSkills', category: CATEGORY, label: 'Export Skills to Coding Agents', iconClass: 'codicon codicon-export'
    }, 'brokspace/commands/exportSkills', CATEGORY_KEY);
    export const INSTALL_HELP = Command.toLocalizedCommand({
        id: 'brokspace.installHelp', category: CATEGORY, label: 'How to Install brok'
    }, 'brokspace/commands/installHelp', CATEGORY_KEY);
    export const REFRESH = Command.toLocalizedCommand({
        id: 'brokspace.refresh', category: CATEGORY, label: 'Refresh Status', iconClass: 'codicon codicon-refresh'
    }, 'brokspace/commands/refresh', CATEGORY_KEY);
    export const SETTINGS = Command.toLocalizedCommand({
        id: 'brokspace.settings', category: CATEGORY, label: 'Settings', iconClass: 'codicon codicon-settings-gear'
    }, 'brokspace/commands/settings', CATEGORY_KEY);
    export const REMEMBER = Command.toLocalizedCommand({
        id: 'brokspace.remember', category: CATEGORY, label: 'Remember…', iconClass: 'codicon codicon-add'
    }, 'brokspace/commands/remember', CATEGORY_KEY);
    export const REMEMBER_SELECTION = Command.toLocalizedCommand({
        id: 'brokspace.rememberSelection', category: CATEGORY, label: 'Remember Selection…'
    }, 'brokspace/commands/rememberSelection', CATEGORY_KEY);
    export const SHOW_MEMORY = Command.toLocalizedCommand({
        id: 'brokspace.showMemory', category: CATEGORY, label: 'Manage Memory', iconClass: 'codicon codicon-library'
    }, 'brokspace/commands/showMemory', CATEGORY_KEY);
    export const FORGET_MEMORY = Command.toLocalizedCommand({
        id: 'brokspace.forgetMemory', category: CATEGORY, label: 'Forget Memory…', iconClass: 'codicon codicon-trash'
    }, 'brokspace/commands/forgetMemory', CATEGORY_KEY);
    export const ADD_LINK = Command.toLocalizedCommand({
        id: 'brokspace.addLink', category: CATEGORY, label: 'Link a Workspace…', iconClass: 'codicon codicon-link'
    }, 'brokspace/commands/addLink', CATEGORY_KEY);
    export const CONNECT_AGENTS = Command.toLocalizedCommand({
        id: 'brokspace.connectAgents', category: CATEGORY, label: 'Connect Coding Agents', iconClass: 'codicon codicon-plug'
    }, 'brokspace/commands/connectAgents', CATEGORY_KEY);
    export const SHOW_LOGS = Command.toLocalizedCommand({
        id: 'brokspace.showLogs', category: CATEGORY, label: 'Show Logs', iconClass: 'codicon codicon-output'
    }, 'brokspace/commands/showLogs', CATEGORY_KEY);
    export const ADD_PROVIDER = Command.toLocalizedCommand({
        id: 'brokspace.addProvider', category: CATEGORY, label: 'Add LLM Provider…', iconClass: 'codicon codicon-add'
    }, 'brokspace/commands/addProvider', CATEGORY_KEY);
    export const REPORT_BUG = Command.toLocalizedCommand({
        id: 'brokspace.reportBug', category: CATEGORY, label: 'Report a Bug…', iconClass: 'codicon codicon-bug'
    }, 'brokspace/commands/reportBug', CATEGORY_KEY);
    export const SHOW_DIAGNOSTICS = Command.toLocalizedCommand({
        id: 'brokspace.showDiagnostics', category: CATEGORY, label: 'Diagnostics', iconClass: 'codicon codicon-pulse'
    }, 'brokspace/commands/showDiagnostics', CATEGORY_KEY);
    export const SYNC_LINKS = Command.toLocalizedCommand({
        id: 'brokspace.syncLinks', category: CATEGORY, label: 'Sync Linked Workspaces', iconClass: 'codicon codicon-sync'
    }, 'brokspace/commands/syncLinks', CATEGORY_KEY);
}
