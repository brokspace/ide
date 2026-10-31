// *****************************************************************************
// Copyright (C) 2026 Brokspace contributors.
//
// SPDX-License-Identifier: MIT
// *****************************************************************************

import { ChatAgent, ChatAgentLocation } from '@theia/ai-chat/lib/common/chat-agents';
import {
    ErrorChatResponseContentImpl, MarkdownChatResponseContentImpl, MutableChatRequestModel
} from '@theia/ai-chat/lib/common/chat-model';
import { LanguageModelRequirement } from '@theia/ai-core/lib/common/language-model';
import { AgentSpecificVariables, PromptVariantSet } from '@theia/ai-core/lib/common/agent';
import { inject, injectable } from '@theia/core/shared/inversify';
import { AnswerRequest, BrokService, ConversationTurn, SourceRef } from '../common/brok-protocol';
import { BrokClientImpl, BrokspaceModel } from './brokspace-model';

export const BROKSPACE_AGENT_ID = 'Brokspace';

/**
 * The Brokspace chat agent: answers come from brok-agent (your local or
 * configured LLM, grounded in the workspace index) through `brok ask --json`.
 * Theia AI needs no language model configured for it.
 */
@injectable()
export class BrokspaceChatAgent implements ChatAgent {
    readonly id = BROKSPACE_AGENT_ID;
    readonly name = BROKSPACE_AGENT_ID;
    readonly description = 'Answers about this workspace from your own LLM, grounded in the Brokspace index, '
        + 'with the sources it used. Nothing leaves your machine unless brok.yml points at a hosted model. '
        + 'Commands: `/review` (uncommitted changes), `/review staged`, `/review base <ref>`, `/skill <name> <input>`.';
    readonly iconClass = 'brokspace-agent-icon';
    readonly locations = [ChatAgentLocation.Panel];
    readonly tags = ['Brokspace', 'Local first'];
    readonly variables: string[] = [];
    readonly prompts: PromptVariantSet[] = [];
    readonly languageModelRequirements: LanguageModelRequirement[] = [];
    readonly agentSpecificVariables: AgentSpecificVariables[] = [];
    readonly functions: string[] = [];

    @inject(BrokService) protected readonly service: BrokService;
    @inject(BrokClientImpl) protected readonly client: BrokClientImpl;
    @inject(BrokspaceModel) protected readonly model: BrokspaceModel;

    async invoke(request: MutableChatRequestModel): Promise<void> {
        const response = request.response;
        const root = this.model.root;
        if (!root) {
            response.response.addContent(new MarkdownChatResponseContentImpl('Open a folder first: Brokspace answers about the workspace you have open.'));
            response.complete();
            return;
        }
        const text = stripMention(request.request.text);
        const answer = parseRequest(text, history(request));
        const id = request.id;
        const progress = response.addProgressMessage({
            content: progressText(answer),
            status: 'inProgress',
            show: 'untilFirstContent',
        });
        const chunks = this.client.onAnswerChunk$(event => {
            if (event.id === id) {
                response.response.addContent(new MarkdownChatResponseContentImpl(event.text));
            }
        });
        const cancel = response.cancellationToken.onCancellationRequested(() => this.service.cancel(id));
        try {
            const done = await this.service.answer(id, root, answer);
            response.updateProgressMessage({ id: progress.id, status: 'completed' });
            if (done.model) {
                response.setLanguageModel(done.provider ? `${done.provider}/${done.model}` : done.model);
            }
            if (done.sources.length) {
                response.response.addContent(new MarkdownChatResponseContentImpl(sourcesMarkdown(done.sources, this.model.rootUri?.toString())));
            }
            response.complete();
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            response.updateProgressMessage({ id: progress.id, status: 'failed' });
            if (!response.isCanceled) {
                response.response.addContent(new ErrorChatResponseContentImpl(new Error(hint(err.message))));
                response.error(err);
            }
        } finally {
            chunks.dispose();
            cancel.dispose();
        }
    }
}

/** `@Brokspace how ...` -> `how ...` */
export function stripMention(text: string): string {
    return text.replace(new RegExp(`^\\s*@${BROKSPACE_AGENT_ID}\\b\\s*`, 'i'), '').trim();
}

/** Slash commands map to brok commands; anything else is a question. */
export function parseRequest(text: string, turns: ConversationTurn[]): AnswerRequest {
    const [command, ...rest] = text.split(/\s+/);
    switch (command?.toLowerCase()) {
        case '/review': {
            const [mode, ref] = rest;
            if (mode === 'staged' || mode === '--staged') {
                return { kind: 'review', staged: true };
            }
            if ((mode === 'base' || mode === '--base') && ref) {
                return { kind: 'review', base: ref };
            }
            return { kind: 'review' };
        }
        case '/skill': {
            const [name, ...input] = rest;
            if (name) {
                return { kind: 'skill', name, input: input.join(' ') };
            }
            break;
        }
    }
    return { kind: 'ask', prompt: text, history: turns };
}

/** Earlier turns of this chat session, oldest first (for follow-ups). */
function history(request: MutableChatRequestModel): ConversationTurn[] {
    const turns: ConversationTurn[] = [];
    for (const earlier of request.session.getRequests()) {
        if (earlier.id === request.id) {
            break;
        }
        const answer = earlier.response.response.asString().trim();
        if (earlier.response.isComplete && answer) {
            turns.push({ role: 'user', content: stripMention(earlier.request.text) });
            turns.push({ role: 'assistant', content: answer });
        }
    }
    return turns;
}

function progressText(request: AnswerRequest): string {
    switch (request.kind) {
        case 'review': return 'Reviewing your changes with the code-review skill...';
        case 'skill': return `Running the ${request.name} skill...`;
        default: return 'Searching the workspace and asking your model...';
    }
}

/**
 * Sources as links that open the file at the cited line. They are HTML
 * anchors: the chat's markdown parser rejects `file:` links, while its HTML
 * links go through Theia's opener, which reads `#L<line>`.
 */
export function sourcesMarkdown(sources: SourceRef[], rootUri: string | undefined): string {
    const items = sources.map(source => {
        const label = `<code>${escapeHtml(`${source.path}:${source.start_line}-${source.end_line}`)}</code>`;
        const symbol = source.symbol ? ` · ${escapeHtml(source.symbol)}` : '';
        const target = rootUri ? `${rootUri.replace(/\/$/, '')}/${encodePath(source.path)}#L${source.start_line}` : undefined;
        return target ? `- <a href="${escapeHtml(target)}">${label}</a>${symbol}` : `- ${label}${symbol}`;
    });
    return `\n\n**Sources**\n\n${items.join('\n')}\n`;
}

function escapeHtml(text: string): string {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function encodePath(relative: string): string {
    return relative.split(/[\\/]/).map(encodeURIComponent).join('/');
}

/** Turns common failures into the next step to take. */
function hint(message: string): string {
    if (/no answer from the agent|connection refused|LLM/i.test(message)) {
        return `${message}\n\nIs your LLM running? Start Ollama or LM Studio, then run "Brokspace: Doctor".`;
    }
    if (/no Brokspace workspace/i.test(message)) {
        return `${message}\n\nRun "Brokspace: Set Up Workspace" first.`;
    }
    return message;
}
