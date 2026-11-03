// *****************************************************************************
// Copyright (C) 2026 Brokspace contributors.
//
// SPDX-License-Identifier: MIT
// *****************************************************************************

import { inject, injectable } from '@theia/core/shared/inversify';
import { CommonMenus } from '@theia/core/lib/browser/common-frontend-contribution';
import { WindowService } from '@theia/core/lib/browser/window/window-service';
import { Command, CommandContribution, CommandRegistry } from '@theia/core/lib/common/command';
import { MenuContribution, MenuModelRegistry } from '@theia/core/lib/common/menu';
import { BRAND } from './branding-util';

/** The Brokspace extension's report form (brokspace-ide-brok-ext). */
const REPORT_BUG = 'brokspace.reportBug';

export namespace BrokspaceHelpCommands {
    export const DOCUMENTATION = Command.toLocalizedCommand({
        id: 'brokspace-ide.documentation', category: 'Help', label: 'Brokspace Documentation'
    }, 'brokspace/help/documentation', 'brokspace/help/category');
    export const GETTING_STARTED = Command.toLocalizedCommand({
        id: 'brokspace-ide.gettingStarted', category: 'Help', label: 'Brokspace Getting Started Guide'
    }, 'brokspace/help/gettingStarted', 'brokspace/help/category');
    export const DISCUSSIONS = Command.toLocalizedCommand({
        id: 'brokspace-ide.discussions', category: 'Help', label: 'Ask the Community'
    }, 'brokspace/help/discussions', 'brokspace/help/category');
    export const REPORT_ISSUE = Command.toLocalizedCommand({
        id: 'brokspace-ide.reportIssue', category: 'Help', label: 'Report an IDE Issue'
    }, 'brokspace/help/reportIssue', 'brokspace/help/category');
}

@injectable()
export class BrokspaceHelpContribution implements CommandContribution, MenuContribution {

    @inject(WindowService) protected readonly windowService: WindowService;

    registerCommands(registry: CommandRegistry): void {
        const open = (url: string) => () => this.windowService.openNewWindow(url, { external: true });
        registry.registerCommand(BrokspaceHelpCommands.DOCUMENTATION, { execute: open(BRAND.docs) });
        registry.registerCommand(BrokspaceHelpCommands.GETTING_STARTED, { execute: open(BRAND.gettingStarted) });
        registry.registerCommand(BrokspaceHelpCommands.DISCUSSIONS, { execute: open(BRAND.discussions) });
        // The Brokspace report form (diagnostics included) when the Brokspace extension is there.
        registry.registerCommand(BrokspaceHelpCommands.REPORT_ISSUE, {
            execute: () => registry.getCommand(REPORT_BUG)
                ? registry.executeCommand(REPORT_BUG, { repo: 'ide' })
                : this.windowService.openNewWindow(BRAND.issues, { external: true }),
        });
    }

    registerMenus(menus: MenuModelRegistry): void {
        const path = [...CommonMenus.HELP, 'brokspace'];
        [BrokspaceHelpCommands.GETTING_STARTED, BrokspaceHelpCommands.DOCUMENTATION, BrokspaceHelpCommands.DISCUSSIONS, BrokspaceHelpCommands.REPORT_ISSUE]
            .forEach((command, i) => menus.registerMenuAction(path, { commandId: command.id, order: String(i) }));
    }
}
