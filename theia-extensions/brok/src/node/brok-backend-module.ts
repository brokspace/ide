// *****************************************************************************
// Copyright (C) 2026 Brokspace contributors.
//
// SPDX-License-Identifier: MIT
// *****************************************************************************

import { ContainerModule } from '@theia/core/shared/inversify';
import { ConnectionContainerModule } from '@theia/core/lib/node/messaging/connection-container-module';
import { BROK_SERVICE_PATH, BrokClient, BrokService } from '../common/brok-protocol';
import { BrokServiceImpl } from './brok-service-impl';

const brokConnectionModule = ConnectionContainerModule.create(({ bind, bindBackendService }) => {
    bind(BrokServiceImpl).toSelf().inSingletonScope();
    bind(BrokService).toService(BrokServiceImpl);
    bindBackendService<BrokService, BrokClient>(BROK_SERVICE_PATH, BrokService, (service, client) => {
        service.setClient(client);
        client.onDidCloseConnection(() => service.dispose());
        return service;
    });
});

export default new ContainerModule(bind => {
    bind(ConnectionContainerModule).toConstantValue(brokConnectionModule);
});
