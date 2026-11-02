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
import { nls } from '@theia/core/lib/common/nls';
import { URI } from '@theia/core/lib/common/uri';
import { inject, injectable } from '@theia/core/shared/inversify';
import { AnswerRequest, BrokService, ConversationTurn, SearchHit, SourceRef } from '../common/brok-protocol';
import { BrokspaceMemory, resolveHitPath, SessionTurn } from './brokspace-memory';
import { BrokClientImpl, BrokspaceModel } from './brokspace-model';

export const BROKSPACE_AGENT_ID = 'Brokspace';

/**
 * The Brokspace chat agent, the IDE's one way to an LLM: every request goes
 * through brok, which routes it to the provider set in brok.yml (Ollama,
 * LM Studio or a hosted OpenAI-compatible API) and grounds it in the
 * workspace index, the linked workspaces and the memories. Without a
 * reachable LLM, questions are answered with what the local index finds.
 * Theia AI needs no language model for it. Each answered question updates
 * the session's memory, so later sessions start from it.
 */
@injectable()
export class BrokspaceChatAgent implements ChatAgent {
    readonly id = BROKSPACE_AGENT_ID;
    readonly name = BROKSPACE_AGENT_ID;
    readonly description = nls.localize('brokspace/agent/description',
        'Answers about this workspace from your own LLM, grounded in the Brokspace index, with the sources it used. '
        + 'Without an LLM, answers with what the local index finds. Nothing leaves your machine unless brok.yml points at a hosted model. '
        + 'Commands: `/review` (uncommitted changes), `/review staged`, `/review base <ref>`, `/skill <name> <input>`.');
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
    @inject(BrokspaceMemory) protected readonly memory: BrokspaceMemory;

    async invoke(request: MutableChatRequestModel): Promise<void> {
        const response = request.response;
        const root = this.model.root;
        if (!root) {
            response.response.addContent(new MarkdownChatResponseContentImpl(
                nls.localize('brokspace/agent/openFolder', 'Open a folder first: Brokspace answers about the workspace you have open.')));
            response.complete();
            return;
        }
        const text = stripMention(request.request.text);
        const answer = parseRequest(text, history(request));
        const id = request.id;
        const state = this.model.state;
        if (answer.kind === 'ask' && state.kind === 'ready' && !state.status.llm?.model) {
            await this.answerLocally(request, root, answer.prompt);
            return;
        }
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
                response.response.addContent(new MarkdownChatResponseContentImpl(sourcesMarkdown(done.sources, this.model.rootUri)));
            }
            response.complete();
            if (answer.kind === 'ask') {
                this.rememberSession(request);
            }
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            response.updateProgressMessage({ id: progress.id, status: 'failed' });
            if (response.isCanceled) {
                return;
            }
            if (answer.kind === 'ask' && llmUnavailable(err.message)) {
                await this.answerLocally(request, root, answer.prompt, err.message);
                return;
            }
            response.response.addContent(new ErrorChatResponseContentImpl(new Error(hint(err.message))));
            response.error(err);
        } finally {
            chunks.dispose();
            cancel.dispose();
        }
    }

    /** Local-only answer: the code the index finds for the question, with links. */
    protected async answerLocally(request: MutableChatRequestModel, root: string, prompt: string, reason?: string): Promise<void> {
        const response = request.response;
        let hits: SearchHit[];
        try {
            hits = await this.service.search(root, prompt, 8);
        } catch (error) {
            response.response.addContent(new ErrorChatResponseContentImpl(error instanceof Error ? error : new Error(String(error))));
            response.complete();
            return;
        }
        // brok chains causes with ': '; the last one says what happened ("Connection refused ...").
        const cause = reason?.split(': ').pop();
        const intro = cause
            ? nls.localize('brokspace/agent/localAfterError', 'Your LLM did not answer ({0}), so here is what the local index found.', cause)
            : nls.localize('brokspace/agent/localOnly', 'No LLM is set up, so here is what the local index found. Run `brok setup llm` to get written answers.');
        const body = hits.length
            ? sourcesMarkdown(hits.map(hit => ({ path: hit.path, start_line: hit.start_line, end_line: hit.end_line, symbol: hit.symbol ?? undefined })),
                this.model.rootUri)
            : `\n\n${nls.localize('brokspace/view/noResults', 'No results. Try other words, or check that the index is up to date.')}`;
        response.response.addContent(new MarkdownChatResponseContentImpl(`${intro}${body}`));
        response.complete();
        this.rememberSession(request);
    }

    /** Saves the session as a memory, in the background: a failure never reaches the chat. */
    protected rememberSession(request: MutableChatRequestModel): void {
        this.memory.saveSession(request.session.id, sessionTurns(request))
            .catch(error => console.warn('Brokspace: the session memory was not saved', error));
    }
}

/** The questions of a session up to `request`, with their answers (sources apart). */
export function sessionTurns(request: MutableChatRequestModel): SessionTurn[] {
    const turns: SessionTurn[] = [];
    for (const earlier of request.session.getRequests()) {
        const text = earlier.response.response.asString();
        const question = stripMention(earlier.request.text);
        // Reviews and skills are not conversation.
        if (earlier.response.isComplete && text.trim() && !question.startsWith('/')) {
            turns.push({ question, ...splitSources(text) });
        }
        if (earlier.id === request.id) {
            break;
        }
    }
    return turns;
}

/** An answer, and the `path:start-end` of the sources block appended to it. */
export function splitSources(text: string): { answer: string; sources: string[] } {
    const marker = `**${nls.localize('brokspace/agent/sources', 'Sources')}**`;
    const at = text.lastIndexOf(marker);
    if (at < 0) {
        return { answer: text.trim(), sources: [] };
    }
    const sources = [...text.slice(at).matchAll(/<code>([^<]+)<\/code>/g)].map(match => unescapeHtml(match[1]));
    return { answer: text.slice(0, at).trim(), sources };
}

/** The LLM could not be reached or is not configured: worth answering from the index instead. */
export function llmUnavailable(message: string): boolean {
    return /no answer from the agent|connection refused|not reachable|no LLM|llm/i.test(message);
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
        case 'review': return nls.localize('brokspace/agent/reviewing', 'Reviewing your changes with the code-review skill…');
        case 'skill': return nls.localize('brokspace/agent/runningSkill', 'Running the {0} skill…', request.name);
        default: return nls.localize('brokspace/agent/asking', 'Searching the workspace and asking your model…');
    }
}

/**
 * Sources as links that open the file at the cited line. They are HTML
 * anchors: the chat's markdown parser rejects `file:` links, while its HTML
 * links go through Theia's opener, which reads `#L<line>`.
 */
export function sourcesMarkdown(sources: SourceRef[], rootUri: URI | undefined): string {
    const items = sources.map(source => {
        const label = `<code>${escapeHtml(`${source.path}:${source.start_line}-${source.end_line}`)}</code>`;
        const symbol = source.symbol ? ` · ${escapeHtml(source.symbol)}` : '';
        // Paths may leave the workspace: linked workspaces (../checkout/...) and global memories (absolute).
        const target = rootUri ? `${resolveHitPath(rootUri, source.path).toString()}#L${source.start_line}` : undefined;
        return target ? `- <a href="${escapeHtml(target)}">${label}</a>${symbol}` : `- ${label}${symbol}`;
    });
    const title = nls.localize('brokspace/agent/sources', 'Sources');
    return `\n\n**${title}**\n\n${items.join('\n')}\n`;
}

function escapeHtml(text: string): string {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function unescapeHtml(text: string): string {
    return text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
}

/** Turns common failures into the next step to take. */
function hint(message: string): string {
    if (/no answer from the agent|connection refused|LLM/i.test(message)) {
        const next = nls.localize('brokspace/agent/llmHint', 'Is your LLM running? Start Ollama or LM Studio, then run "Brokspace: Doctor".');
        return `${message}\n\n${next}`;
    }
    if (/no Brokspace workspace/i.test(message)) {
        const next = nls.localize('brokspace/agent/setupHint', 'Run "Brokspace: Set Up Workspace" first.');
        return `${message}\n\n${next}`;
    }
    return message;
}
