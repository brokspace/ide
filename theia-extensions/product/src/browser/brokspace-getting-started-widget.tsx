// *****************************************************************************
// Copyright (C) 2026 Brokspace contributors.
//
// SPDX-License-Identifier: MIT
// *****************************************************************************

import * as React from 'react';
import { CommandService } from '@theia/core/lib/common/command';
import { PreferenceService } from '@theia/core/lib/common';
import { inject, injectable } from '@theia/core/shared/inversify';
import { GettingStartedWidget } from '@theia/getting-started/lib/browser/getting-started-widget';
import { BRAND, renderBrandingSections, renderProductName } from './branding-util';

/** Commands contributed by the Brokspace extension (brokspace-ide-brok-ext). */
const ASK = 'brokspace.ask';
const REVIEW = 'brokspace.review';
const SEARCH = 'brokspace.search';
const SETUP = 'brokspace.setup';

const SUGGESTIONS = [
    'How is this project structured?',
    'Where is authentication handled?',
    'What changed recently and why?',
];

/**
 * Agent-first home: say what you want to do, Brokspace answers from the
 * workspace. The classic Start / Recent / Help sections follow.
 */
@injectable()
export class BrokspaceGettingStartedWidget extends GettingStartedWidget {

    @inject(CommandService) protected readonly commands: CommandService;
    @inject(PreferenceService) protected readonly preferenceService: PreferenceService;

    protected prompt = '';

    protected async doInit(): Promise<void> {
        super.doInit();
        this.title.iconClass = 'bk-welcome-tab-icon';
        this.title.label = 'Welcome';
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
                <div className='bk-home-walkthroughs'>
                    {this.renderWalkthroughs()}
                </div>
                <div className='bk-home-grid'>
                    <div className='bk-home-column'>
                        {this.renderStart()}
                        {this.renderBrokspaceActions()}
                        {this.renderRecentWorkspaces()}
                        {this.renderSettings()}
                        {this.renderHelp()}
                    </div>
                    <div className='bk-home-column'>
                        {renderBrandingSections()}
                    </div>
                </div>
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
        return <div className='bk-hero'>
            <div className='bk-hero-brand'>
                <div className='bk-hero-mark' />
                <div>
                    {renderProductName()}
                    <p className='bk-tagline'>{BRAND.tagline} <span className='bk-version'>{this.applicationInfo?.version ? `v${this.applicationInfo.version}` : ''}</span></p>
                </div>
            </div>
            <form className='bk-prompt' onSubmit={e => { e.preventDefault(); submit(); }}>
                <textarea
                    className='bk-prompt-input'
                    rows={2}
                    placeholder='Ask about this workspace, or describe the change you want to make…'
                    onChange={e => { this.prompt = e.currentTarget.value; }}
                    onKeyDown={e => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            submit();
                        }
                    }}
                />
                <button type='submit' className='bk-prompt-send' title='Ask Brokspace (Enter)'>
                    <i className='codicon codicon-arrow-up' />
                </button>
            </form>
            <div className='bk-suggestions'>
                {SUGGESTIONS.map(text => <button key={text} className='bk-chip' onClick={() => this.commands.executeCommand(ASK, text)}>{text}</button>)}
                <button className='bk-chip' onClick={() => this.commands.executeCommand(REVIEW)}>Review my changes</button>
            </div>
        </div>;
    }

    protected renderBrokspaceActions(): React.ReactNode {
        const action = (label: string, command: string) =>
            <div className='gs-action-container'>
                <a role='button' tabIndex={0} onClick={() => this.commands.executeCommand(command)}
                    onKeyDown={e => e.key === 'Enter' && this.commands.executeCommand(command)}>{label}</a>
            </div>;
        return <div className='gs-section'>
            <h3 className='gs-section-header'><i className='codicon codicon-zap'></i>Brokspace</h3>
            {action('Set up this workspace', SETUP)}
            {action('Search the workspace', SEARCH)}
            {action('Ask Brokspace', ASK)}
        </div>;
    }
}
