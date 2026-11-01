/********************************************************************************
 * Copyright (C) 2020 EclipseSource and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { PreferenceSchema, PreferenceScope } from '@theia/core';
import { nls } from '@theia/core/lib/common/nls';
import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';

const DEFAULT_UPDATE_CHANNELS = ['stable', 'preview'];

function getAvailableUpdateChannels(): string[] {
    try {
        const config = FrontendApplicationConfigProvider.get() as Record<string, unknown>;
        return (config['availableUpdateChannels'] as string[]) ?? DEFAULT_UPDATE_CHANNELS;
    } catch {
        return DEFAULT_UPDATE_CHANNELS;
    }
}

export const theiaUpdaterPreferenceSchema: PreferenceSchema = {
    'properties': {
        'updates.checkForUpdates': {
            type: 'boolean',
            description: nls.localize('brokspace/updater/prefCheck', 'Automatically check for updates.'),
            default: true,
            scope: PreferenceScope.User
        },
        'updates.checkInterval': {
            type: 'number',
            description: nls.localize('brokspace/updater/prefInterval', 'Interval in minutes between automatic update checks.'),
            default: 60,
            scope: PreferenceScope.User
        },
        'updates.channel': {
            type: 'string',
            enum: getAvailableUpdateChannels(),
            description: nls.localize('brokspace/updater/prefChannel', 'Channel to use for updates.'),
            default: getAvailableUpdateChannels()[0] ?? '',
            scope: PreferenceScope.User
        },
    }
};
