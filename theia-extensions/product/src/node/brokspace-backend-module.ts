// *****************************************************************************
// Copyright (C) 2026 Brokspace contributors.
//
// SPDX-License-Identifier: MIT
// *****************************************************************************

import { LocalizationContribution, LocalizationRegistry } from '@theia/core/lib/node/i18n/localization-contribution';
import { ContainerModule, injectable } from '@theia/core/shared/inversify';

/**
 * Brazilian Portuguese for every Brokspace string (i18n/nls.pt-br.json).
 * Theia's own strings come with @theia/core, the VS Code built-ins' from the
 * pt-BR language pack in `theiaPlugins`. English is the source language.
 */
@injectable()
export class BrokspaceLocalizationContribution implements LocalizationContribution {
    async registerLocalizations(registry: LocalizationRegistry): Promise<void> {
        registry.registerLocalizationFromRequire('pt-br', require('../../i18n/nls.pt-br.json'));
        // Menu labels whose keys the VS Code 1.108 language pack moved (Theia still asks for the old ones).
        registry.registerLocalizationFromRequire('pt-br', require('../../i18n/vscode-overrides.pt-br.json'));
    }
}

export default new ContainerModule(bind => {
    bind(BrokspaceLocalizationContribution).toSelf().inSingletonScope();
    bind(LocalizationContribution).toService(BrokspaceLocalizationContribution);
});
