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

export namespace BrokspaceHelpCommands {
    const CATEGORY = 'Help';
    export const DOCUMENTATION: Command = { id: 'brokspace-ide.documentation', category: CATEGORY, label: 'Brokspace Documentation' };
    export const GETTING_STARTED: Command = { id: 'brokspace-ide.gettingStarted', category: CATEGORY, label: 'Brokspace Getting Started Guide' };
    export const DISCUSSIONS: Command = { id: 'brokspace-ide.discussions', category: CATEGORY, label: 'Ask the Community' };
    export const REPORT_ISSUE: Command = { id: 'brokspace-ide.reportIssue', category: CATEGORY, label: 'Report an IDE Issue' };
}

@injectable()
export class BrokspaceHelpContribution implements CommandContribution, MenuContribution {

    @inject(WindowService) protected readonly windowService: WindowService;

    registerCommands(registry: CommandRegistry): void {
        const open = (url: string) => () => this.windowService.openNewWindow(url, { external: true });
        registry.registerCommand(BrokspaceHelpCommands.DOCUMENTATION, { execute: open(BRAND.docs) });
        registry.registerCommand(BrokspaceHelpCommands.GETTING_STARTED, { execute: open(BRAND.gettingStarted) });
        registry.registerCommand(BrokspaceHelpCommands.DISCUSSIONS, { execute: open(BRAND.discussions) });
        registry.registerCommand(BrokspaceHelpCommands.REPORT_ISSUE, { execute: open(BRAND.issues) });
    }

    registerMenus(menus: MenuModelRegistry): void {
        const path = [...CommonMenus.HELP, 'brokspace'];
        [BrokspaceHelpCommands.GETTING_STARTED, BrokspaceHelpCommands.DOCUMENTATION, BrokspaceHelpCommands.DISCUSSIONS, BrokspaceHelpCommands.REPORT_ISSUE]
            .forEach((command, i) => menus.registerMenuAction(path, { commandId: command.id, label: command.label, order: String(i) }));
    }
}
