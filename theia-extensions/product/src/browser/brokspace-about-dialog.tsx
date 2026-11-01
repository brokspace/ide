// *****************************************************************************
// Copyright (C) 2026 Brokspace contributors.
//
// SPDX-License-Identifier: MIT
// *****************************************************************************

import * as React from 'react';
import { AboutDialog, AboutDialogProps, ABOUT_CONTENT_CLASS } from '@theia/core/lib/browser/about-dialog';
import { inject, injectable } from '@theia/core/shared/inversify';
import { VSXEnvironment } from '@theia/vsx-registry/lib/common/vsx-environment';
import { nls } from '@theia/core/lib/common/nls';
import { BRAND, renderProductName } from './branding-util';

@injectable()
export class BrokspaceAboutDialog extends AboutDialog {

    @inject(VSXEnvironment) protected readonly environment: VSXEnvironment;

    protected vscodeApiVersion: string;

    constructor(@inject(AboutDialogProps) protected readonly props: AboutDialogProps) {
        super(props);
    }

    protected async doInit(): Promise<void> {
        this.vscodeApiVersion = await this.environment.getVscodeApiVersion();
        super.doInit();
    }

    protected render(): React.ReactNode {
        return <div className={ABOUT_CONTENT_CLASS}>
            <div className='bk-about'>
                <div className='bk-about-head'>
                    <div className='bk-about-logo' />
                    <div>
                        {renderProductName()}
                        <p className='gs-sub-header'>{nls.localize('brokspace/home/tagline', 'Your workspace, understood.')}</p>
                        <p className='gs-sub-header'>
                            {nls.localize('brokspace/about/versions', 'Version {0} · VS Code API {1}', this.applicationInfo?.version ?? '-', this.vscodeApiVersion ?? '-')}
                        </p>
                        <p className='gs-sub-header'>
                            <a href={BRAND.website} target='_blank' rel='noreferrer'>brokspace.org</a>
                            {' · '}
                            <a href={BRAND.repository} target='_blank' rel='noreferrer'>{nls.localize('brokspace/about/source', 'Source')}</a>
                            {' · '}{nls.localize('brokspace/about/builtOn', 'Built on')} <a href='https://theia-ide.org' target='_blank' rel='noreferrer'>Eclipse Theia</a>
                        </p>
                    </div>
                </div>
                <hr className='gs-hr' />
                {this.renderExtensions()}
            </div>
        </div>;
    }
}
