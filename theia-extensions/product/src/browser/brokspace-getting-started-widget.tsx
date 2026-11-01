// *****************************************************************************
// Copyright (C) 2026 Brokspace contributors.
//
// SPDX-License-Identifier: MIT
// *****************************************************************************

import * as React from 'react';
import { codicon } from '@theia/core/lib/browser';
import { CommandService } from '@theia/core/lib/common/command';
import { nls } from '@theia/core/lib/common/nls';
import { PreferenceService } from '@theia/core/lib/common';
import { inject, injectable } from '@theia/core/shared/inversify';
import { GettingStartedWidget } from '@theia/getting-started/lib/browser/getting-started-widget';
import { BRAND, renderProductName } from './branding-util';

/** Commands contributed by the Brokspace extension (brokspace-ide-brok-ext). */
const ASK = 'brokspace.ask';
const REVIEW = 'brokspace.review';
const LANGUAGE = 'workbench.action.configureLanguage';
const SETTINGS = 'preferences:open';

/**
 * Agent-first home: say what you want to do, Brokspace answers from the
 * workspace. Then only what starts work: open a folder, recent workspaces.
 */
@injectable()
export class BrokspaceGettingStartedWidget extends GettingStartedWidget {

    @inject(CommandService) protected readonly commands: CommandService;
    @inject(PreferenceService) protected readonly preferenceService: PreferenceService;

    protected prompt = '';

    protected async doInit(): Promise<void> {
        super.doInit();
        this.title.iconClass = 'bk-welcome-tab-icon';
        this.title.label = nls.localize('brokspace/home/title', 'Welcome');
        await this.preferenceService.ready;
        this.update();
    }

    protected render(): React.ReactNode {
        if (this.walkthroughService.selectedWalkthrough) {
            return this.renderSelectedWalkthrough();
        }
        return <div className='gs-container bk-home'>
            <div className='gs-content-container'>
                {this.renderHero()}
                <div className='bk-home-grid'>
                    <div className='bk-home-column'>{this.renderStart()}</div>
                    <div className='bk-home-column'>{this.renderRecentWorkspaces()}</div>
                </div>
                {this.renderFooter()}
            </div>
            <div className='gs-preference-container'>
                {this.renderPreferences()}
            </div>
        </div>;
    }

    protected renderHero(): React.ReactNode {
        const submit = () => {
            const text = this.prompt.trim();
            if (text) {
                this.commands.executeCommand(ASK, text);
            }
        };
        const suggestions = [
            nls.localize('brokspace/home/suggestStructure', 'How is this project structured?'),
            nls.localize('brokspace/home/suggestAuth', 'Where is authentication handled?'),
            nls.localize('brokspace/home/suggestChanges', 'What changed recently and why?'),
        ];
        const version = this.applicationInfo?.version;
        return <div className='bk-hero'>
            <div className='bk-hero-brand'>
                <div className='bk-hero-mark' />
                <div>
                    {renderProductName()}
                    <p className='bk-tagline'>
                        {nls.localize('brokspace/home/tagline', 'Your workspace, understood.')}
                        {version && <span className='bk-version'>v{version}</span>}
                    </p>
                </div>
            </div>
            <form className='bk-prompt' onSubmit={e => { e.preventDefault(); submit(); }}>
                <textarea
                    className='bk-prompt-input'
                    rows={2}
                    aria-label={nls.localize('brokspace/home/promptLabel', 'Ask Brokspace')}
                    placeholder={nls.localize('brokspace/home/promptPlaceholder', 'Ask about this workspace, or describe the change you want to make…')}
                    onChange={e => { this.prompt = e.currentTarget.value; }}
                    onKeyDown={e => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            submit();
                        }
                    }}
                />
                <button type='submit' className='bk-prompt-send' title={nls.localize('brokspace/home/send', 'Ask Brokspace (Enter)')}>
                    <i className={codicon('arrow-up')} />
                </button>
            </form>
            <div className='bk-suggestions'>
                {suggestions.map(text => <button key={text} className='bk-chip' onClick={() => this.commands.executeCommand(ASK, text)}>{text}</button>)}
                <button className='bk-chip' onClick={() => this.commands.executeCommand(REVIEW)}>
                    {nls.localize('brokspace/home/reviewChanges', 'Review my changes')}
                </button>
            </div>
        </div>;
    }

    protected renderFooter(): React.ReactNode {
        const command = (icon: string, label: string, id: string) =>
            <button className='bk-footer-link' onClick={() => this.commands.executeCommand(id)}>
                <i className={codicon(icon)} />{label}
            </button>;
        return <div className='bk-footer'>
            {command('globe', nls.localize('brokspace/home/language', 'Language'), LANGUAGE)}
            {command('settings-gear', nls.localize('brokspace/home/settings', 'Settings'), SETTINGS)}
            <a className='bk-footer-link' href={BRAND.docs} target='_blank' rel='noreferrer'>
                <i className={codicon('book')} />{nls.localize('brokspace/home/docs', 'Documentation')}
            </a>
        </div>;
    }
}
