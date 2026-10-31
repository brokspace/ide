// *****************************************************************************
// Copyright (C) 2026 Brokspace contributors.
//
// SPDX-License-Identifier: MIT
// *****************************************************************************

import '../../src/browser/style/index.css';

import { AIRegistryConfiguration } from '@theia/ai-registry/lib/common/ai-registry-configuration';
import { WidgetFactory } from '@theia/core/lib/browser';
import { AboutDialog } from '@theia/core/lib/browser/about-dialog';
import { CommandContribution } from '@theia/core/lib/common/command';
import { MenuContribution } from '@theia/core/lib/common/menu';
import { ContainerModule, injectable } from '@theia/core/shared/inversify';
import { GettingStartedWidget } from '@theia/getting-started/lib/browser/getting-started-widget';
import { BrokspaceAboutDialog } from './brokspace-about-dialog';
import { BrokspaceGettingStartedWidget } from './brokspace-getting-started-widget';
import { BrokspaceHelpContribution } from './brokspace-help-contribution';

/** Identifies the product to the Eclipse Foundation AI registry. */
@injectable()
class BrokspaceAIRegistryConfiguration extends AIRegistryConfiguration {
    override getToolName(): string {
        return 'brokspace-ide';
    }
}

export default new ContainerModule((bind, _unbind, isBound, rebind) => {
    bind(BrokspaceGettingStartedWidget).toSelf();
    bind(WidgetFactory).toDynamicValue(context => ({
        id: GettingStartedWidget.ID,
        createWidget: () => context.container.get<BrokspaceGettingStartedWidget>(BrokspaceGettingStartedWidget),
    })).inSingletonScope();

    if (isBound(AboutDialog)) {
        rebind(AboutDialog).to(BrokspaceAboutDialog).inSingletonScope();
    } else {
        bind(AboutDialog).to(BrokspaceAboutDialog).inSingletonScope();
    }

    bind(BrokspaceHelpContribution).toSelf().inSingletonScope();
    [CommandContribution, MenuContribution].forEach(id => bind(id).toService(BrokspaceHelpContribution));

    if (isBound(AIRegistryConfiguration)) {
        rebind(AIRegistryConfiguration).to(BrokspaceAIRegistryConfiguration).inSingletonScope();
    } else {
        bind(AIRegistryConfiguration).to(BrokspaceAIRegistryConfiguration).inSingletonScope();
    }
});
