// *****************************************************************************
// Copyright (C) 2026 Brokspace contributors.
//
// SPDX-License-Identifier: MIT
// *****************************************************************************

import { codicon } from '@theia/core/lib/browser';
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

function Link(props: { text: string; url: string }): React.JSX.Element {
    return <a role='button' tabIndex={0} href={props.url} target='_blank' rel='noreferrer'>{props.text}</a>;
}

function Section(props: { icon: string; title: string; children: React.ReactNode }): React.JSX.Element {
    return <div className='gs-section'>
        <h3 className='gs-section-header'><i className={codicon(props.icon)}></i>{props.title}</h3>
        {props.children}
    </div>;
}

/** The right-hand column of the welcome page and the about dialog. */
export function renderBrandingSections(): React.ReactNode {
    return <>
        <Section icon='lock' title='Local first'>
            <div>
                Your code is indexed on this machine and answers come from your own LLM (Ollama, LM Studio, or a hosted
                model you choose in <code>.brokspace/brok.yml</code>). Nothing leaves your machine unless you say so.
            </div>
        </Section>
        <Section icon='search' title='Search and ask'>
            <div>
                The Brokspace view finds code by meaning or by name across every repository in the folder. The Brokspace
                agent in the chat answers with the sources it used, reviews your changes (<code>/review</code>) and runs
                skills (<code>/skill</code>).
            </div>
        </Section>
        <Section icon='extensions' title='Skills and shards'>
            <div>
                Skills are reusable workflows for AI; shards are small programs that react to your workspace.
                Start with <Link text='skills' url={BRAND.skills} /> and <Link text='shards' url={BRAND.shards} />.
            </div>
        </Section>
        <Section icon='comment-discussion' title='Community'>
            <div>
                Brokspace is open source. Questions go to <Link text='Discussions' url={BRAND.discussions} />, problems with the
                IDE to <Link text='its issue tracker' url={BRAND.issues} />. Built on <Link text='Eclipse Theia' url='https://theia-ide.org' />.
            </div>
        </Section>
    </>;
}
