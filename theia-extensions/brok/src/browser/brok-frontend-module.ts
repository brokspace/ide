// *****************************************************************************
// Copyright (C) 2026 Brokspace contributors.
//
// SPDX-License-Identifier: MIT
// *****************************************************************************

import '../../src/browser/style/index.css';

import { Agent } from '@theia/ai-core/lib/common/agent';
import { ChatAgent } from '@theia/ai-chat/lib/common/chat-agents';
import { ChatSession } from '@theia/ai-chat/lib/common/chat-service';
import { ChatSessionNamingService } from '@theia/ai-chat/lib/common/chat-session-naming-service';
import { bindViewContribution, FrontendApplicationContribution, ViewContainer, WidgetFactory, WidgetManager } from '@theia/core/lib/browser';
import { ServiceConnectionProvider } from '@theia/core/lib/browser/messaging/service-connection-provider';
import { TabBarToolbarContribution } from '@theia/core/lib/browser/shell/tab-bar-toolbar';
import { nls } from '@theia/core/lib/common/nls';
import { ContainerModule, injectable, interfaces } from '@theia/core/shared/inversify';
import { BROK_SERVICE_PATH, BrokService } from '../common/brok-protocol';
import { BrokspaceChatAgent } from './brokspace-chat-agent';
import { BROKSPACE_VIEW_CONTAINER_ID, BROKSPACE_VIEW_TITLE, BrokspaceContribution } from './brokspace-contribution';
import { BrokClientImpl, BrokspaceModel } from './brokspace-model';
import { BrokspaceOverviewWidget, BrokspaceShardsWidget, BrokspaceSkillsWidget } from './brokspace-widget';

/**
 * Theia names chat sessions with a language model of its own; Brokspace
 * reaches models only through brok, so a session keeps its first question
 * as its title instead of logging an error.
 */
@injectable()
class BrokspaceSessionNaming extends ChatSessionNamingService {
    override async generateChatSessionName(session: ChatSession, otherNames: string[]): Promise<string | undefined> {
        try {
            return await super.generateChatSessionName(session, otherNames);
        } catch {
            return undefined;
        }
    }
}

export default new ContainerModule((bind, _unbind, isBound, rebind) => {
    bind(BrokClientImpl).toSelf().inSingletonScope();
    bind(BrokService).toDynamicValue(ctx =>
        ServiceConnectionProvider.createProxy<BrokService>(ctx.container, BROK_SERVICE_PATH, ctx.container.get(BrokClientImpl))
    ).inSingletonScope();
    bind(BrokspaceModel).toSelf().inSingletonScope();

    // The Brokspace view: Overview, Shards and Skills, each collapsible.
    const parts: [string, interfaces.Newable<object>][] = [
        [BrokspaceOverviewWidget.ID, BrokspaceOverviewWidget],
        [BrokspaceShardsWidget.ID, BrokspaceShardsWidget],
        [BrokspaceSkillsWidget.ID, BrokspaceSkillsWidget],
    ];
    for (const [id, part] of parts) {
        bind(part).toSelf();
        bind(WidgetFactory).toDynamicValue(ctx => ({ id, createWidget: () => ctx.container.get(part) })).inSingletonScope();
    }
    bind(WidgetFactory).toDynamicValue(({ container }) => ({
        id: BROKSPACE_VIEW_CONTAINER_ID,
        createWidget: async () => {
            const view = container.get<ViewContainer.Factory>(ViewContainer.Factory)({ id: BROKSPACE_VIEW_CONTAINER_ID, progressLocationId: 'brokspace' });
            view.setTitleOptions({ ...BROKSPACE_VIEW_TITLE, label: nls.localize('brokspace/view/title', 'Brokspace') });
            const widgets = container.get(WidgetManager);
            view.addWidget(await widgets.getOrCreateWidget(BrokspaceOverviewWidget.ID), { order: 0, weight: 2, canHide: false, initiallyCollapsed: false });
            view.addWidget(await widgets.getOrCreateWidget(BrokspaceShardsWidget.ID), { order: 1, weight: 2, canHide: true, initiallyCollapsed: false });
            view.addWidget(await widgets.getOrCreateWidget(BrokspaceSkillsWidget.ID), { order: 2, weight: 1, canHide: true, initiallyCollapsed: true });
            return view;
        },
    })).inSingletonScope();

    bindViewContribution(bind, BrokspaceContribution);
    bind(FrontendApplicationContribution).toService(BrokspaceContribution);
    bind(TabBarToolbarContribution).toService(BrokspaceContribution);

    if (isBound(ChatSessionNamingService)) {
        rebind(ChatSessionNamingService).to(BrokspaceSessionNaming).inSingletonScope();
    }

    bind(BrokspaceChatAgent).toSelf().inSingletonScope();
    bind(Agent).toService(BrokspaceChatAgent);
    bind(ChatAgent).toService(BrokspaceChatAgent);
});
