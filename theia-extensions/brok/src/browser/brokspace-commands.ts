// *****************************************************************************
// Copyright (C) 2026 Brokspace contributors.
//
// SPDX-License-Identifier: MIT
// *****************************************************************************

import { Command } from '@theia/core/lib/common/command';

export namespace BrokspaceCommands {
    const CATEGORY = 'Brokspace';
    export const SHOW: Command = { id: 'brokspace.show', category: CATEGORY, label: 'Show Brokspace' };
    export const SEARCH: Command = { id: 'brokspace.search', category: CATEGORY, label: 'Search the Workspace' };
    export const ASK: Command = { id: 'brokspace.ask', category: CATEGORY, label: 'Ask Brokspace' };
    export const REVIEW: Command = { id: 'brokspace.review', category: CATEGORY, label: 'Review Uncommitted Changes' };
    export const REVIEW_STAGED: Command = { id: 'brokspace.reviewStaged', category: CATEGORY, label: 'Review Staged Changes' };
    export const COMMIT_MESSAGE: Command = { id: 'brokspace.commitMessage', category: CATEGORY, label: 'Write Commit Message', iconClass: 'codicon codicon-sparkle' };
    export const RUN_SKILL: Command = { id: 'brokspace.runSkill', category: CATEGORY, label: 'Run Skill…' };
    export const SETUP: Command = { id: 'brokspace.setup', category: CATEGORY, label: 'Set Up Workspace' };
    export const START: Command = { id: 'brokspace.start', category: CATEGORY, label: 'Start' };
    export const STOP: Command = { id: 'brokspace.stop', category: CATEGORY, label: 'Stop' };
    export const RESTART: Command = { id: 'brokspace.restart', category: CATEGORY, label: 'Restart' };
    export const REINDEX: Command = { id: 'brokspace.reindex', category: CATEGORY, label: 'Rebuild Index' };
    export const DOCTOR: Command = { id: 'brokspace.doctor', category: CATEGORY, label: 'Doctor' };
    export const INSTALL_SHARD: Command = { id: 'brokspace.installShard', category: CATEGORY, label: 'Install Shard…' };
    export const REMOVE_SHARD: Command = { id: 'brokspace.removeShard', category: CATEGORY, label: 'Remove Shard…' };
    export const EXPORT_SKILLS: Command = { id: 'brokspace.exportSkills', category: CATEGORY, label: 'Export Skills to Coding Agents' };
    export const INSTALL_HELP: Command = { id: 'brokspace.installHelp', category: CATEGORY, label: 'How to Install brok' };
    export const REFRESH: Command = { id: 'brokspace.refresh', category: CATEGORY, label: 'Refresh Status' };
}
