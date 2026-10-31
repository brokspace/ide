// *****************************************************************************
// Copyright (C) 2026 Brokspace contributors.
//
// SPDX-License-Identifier: MIT
// *****************************************************************************

import '../../src/browser/style/index.css';

import { Agent } from '@theia/ai-core/lib/common/agent';
import { ChatAgent } from '@theia/ai-chat/lib/common/chat-agents';
import { bindViewContribution, FrontendApplicationContribution, WidgetFactory } from '@theia/core/lib/browser';
import { ServiceConnectionProvider } from '@theia/core/lib/browser/messaging/service-connection-provider';
import { TabBarToolbarContribution } from '@theia/core/lib/browser/shell/tab-bar-toolbar';
import { ContainerModule } from '@theia/core/shared/inversify';
import { BROK_SERVICE_PATH, BrokService } from '../common/brok-protocol';
import { BrokspaceChatAgent } from './brokspace-chat-agent';
import { BrokspaceContribution } from './brokspace-contribution';
import { BrokClientImpl, BrokspaceModel } from './brokspace-model';
import { BrokspaceWidget } from './brokspace-widget';

export default new ContainerModule(bind => {
    bind(BrokClientImpl).toSelf().inSingletonScope();
    bind(BrokService).toDynamicValue(ctx =>
        ServiceConnectionProvider.createProxy<BrokService>(ctx.container, BROK_SERVICE_PATH, ctx.container.get(BrokClientImpl))
    ).inSingletonScope();
    bind(BrokspaceModel).toSelf().inSingletonScope();

    bind(BrokspaceWidget).toSelf();
    bind(WidgetFactory).toDynamicValue(ctx => ({
        id: BrokspaceWidget.ID,
        createWidget: () => ctx.container.get(BrokspaceWidget),
    })).inSingletonScope();
    bindViewContribution(bind, BrokspaceContribution);
    bind(FrontendApplicationContribution).toService(BrokspaceContribution);
    bind(TabBarToolbarContribution).toService(BrokspaceContribution);

    bind(BrokspaceChatAgent).toSelf().inSingletonScope();
    bind(Agent).toService(BrokspaceChatAgent);
    bind(ChatAgent).toService(BrokspaceChatAgent);
});
