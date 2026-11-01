// *****************************************************************************
// Copyright (C) 2026 Brokspace contributors.
//
// SPDX-License-Identifier: MIT
// *****************************************************************************

import * as React from 'react';

export const BRAND = {
    product: 'Brokspace IDE',
    tagline: 'Your workspace, understood.',
    website: 'https://brokspace.org',
    docs: 'https://brokspace.org/docs',
    gettingStarted: 'https://github.com/brokspace/brok/blob/main/docs/getting-started.md',
    skills: 'https://github.com/brokspace/brok/blob/main/docs/skills.md',
    shards: 'https://github.com/brokspace/brok/blob/main/docs/shards.md',
    repository: 'https://github.com/brokspace/ide',
    issues: 'https://github.com/brokspace/ide/issues/new/choose',
    discussions: 'https://github.com/brokspace/brok/discussions',
};

export function renderProductName(): React.ReactNode {
    return <h1 className='bk-product-name'>Brokspace <span className='bk-accent'>IDE</span></h1>;
}
