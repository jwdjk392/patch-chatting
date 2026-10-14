import { beforeEach, expect, test, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const script = readFileSync(new URL('../public/js/messages.js', import.meta.url), 'utf8');
class Element {
    focus = vi.fn();
    requestSubmit = vi.fn();
    scrollHeight = 100;
    scrollTop = 0;
    clientHeight = 100;
    private text = '';
    get textContent(): string { return this.text + this.children.map(child => child.textContent).join(''); }
    set textContent(value: string) { this.text = value; this.children = []; }
    className = '';
    tagName = '';
    dataset = { currentUserId: 'alice' };
    attributes: Record<string, string> = {};
    setAttribute(name: string, value: string) { this.attributes[name] = value; }
    value = '';
    hidden = false;
    disabled = false;
    children: Element[] = [];
    handlers: Record<string, (...args: any[]) => any> = {};
    addEventListener(event: string, handler: (...args: any[]) => any) { this.handlers[event] = handler; }
    append(...children: Element[]) { this.children.push(...children); }
    replaceChildren(...children: Element[]) { this.children = children; }
}
let elements: Record<string, Element>;
let documentHandlers: Record<string, (...args: any[]) => any>;
let socketHandlers: Record<string, (...args: any[]) => any>;
let client: any;
let documentMock: any;
let request: ReturnType<typeof vi.fn>;
const el = (id: string) => elements[id] ??= new Element();
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
const message = { id: 1, roomId: 'room', senderId: 'bob', text: '<img src=x>', sentAt: '2026-10-14T00:00:00Z' };
const select = (id = 'room') => documentHandlers['chat:select']!({ detail: { id, name: id, members: [{ userId: 'bob', user: { username: 'bob' } }] } });
beforeEach(() => {
    elements = {};
    documentHandlers = {};
    socketHandlers = {};
    client = { isReady: vi.fn(() => true), socket: {
        on: (event: string, handler: (...args: any[]) => any) => { socketHandlers[event] = handler; },
        timeout: () => client.socket,
        emitWithAck: vi.fn(async (event, payload) => event === 'message:read'
            ? { ok: true, roomId: payload.roomId, lastReadMessageId: payload.messageId } : { ok: true, message }),
    } };
    request = vi.fn(async () => ({ ok: true, json: async () => ({ messages: [message] }) }));
    documentMock = {
        chatClient: client, getElementById: el,
        createElement: (tag: string) => { const node = new Element(); node.tagName = tag; return node; },
        createTextNode: (text: string) => { const node = new Element(); node.textContent = text; return node; },
        addEventListener: (event: string, handler: (...args: any[]) => any) => { documentHandlers[event] = handler; },
        hidden: false,
    };
    runInNewContext(script, { document: documentMock, fetch: request });
});

test('loads saved messages and deduplicates acknowledgements and live events using safe text', async () => {
    expect(el('send-message').disabled).toBe(true);
    select();
    await flush();
    expect(el('message').disabled).toBe(false);
    socketHandlers['message:new']!(message);
    socketHandlers['message:new']!({ ...message, id: 2, roomId: 'another' });
    el('message').value = message.text;
    await el('message-form').handlers.submit!({ preventDefault: vi.fn() });
    expect(client.socket.emitWithAck).toHaveBeenCalledWith('message:send', { roomId: 'room', text: message.text });
    expect(el('messages').children).toHaveLength(1);
    expect(el('messages').children[0]!.children[1]!.children[1]!.textContent).toBe('<img src=x>');
    expect(el('message').value).toBe('');
});

test('failed sends preserve the draft and disconnected clients cannot send', async () => {
    select();
    await flush();
    client.socket.emitWithAck.mockResolvedValue({ ok: false, error: { message: 'Save failed' } });
    el('message').value = 'draft';
    await el('message-form').handlers.submit!({ preventDefault: vi.fn() });
    expect(el('message').value).toBe('draft');
    expect(el('message-status').textContent).toBe('Save failed');
    client.isReady.mockReturnValue(false);
    client.onStatus();
    expect(el('send-message').disabled).toBe(true);
    await el('message-form').handlers.submit!({ preventDefault: vi.fn() });
    expect(client.socket.emitWithAck.mock.calls.filter(([event]: [string]) => event === 'message:send')).toHaveLength(1);
});

test('room switches ignore stale history responses', async () => {
    let finish!: (response: any) => void;
    request.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    select();
    select('another');
    await flush();
    finish({ ok: true, json: async () => ({ messages: [{ ...message, id: 99 }] }) });
    await flush();
    expect(el('messages').children).toHaveLength(1);
});

test('marks visible loaded messages read but not messages in a hidden tab', async () => {
    documentMock.hidden = true;
    select();
    await flush();
    expect(client.socket.emitWithAck).not.toHaveBeenCalled();
    documentMock.hidden = false;
    documentHandlers.visibilitychange!();
    await flush();
    expect(client.socket.emitWithAck).toHaveBeenCalledWith('message:read', { roomId: 'room', messageId: 1 });
    documentMock.hidden = true;
    socketHandlers['message:new']!({ ...message, id: 2 });
    await flush();
    expect(client.socket.emitWithAck).toHaveBeenCalledTimes(1);
});

test('messages remain unread while scrolled up, then mark read at the bottom', async () => {
    select();
    await flush();
    el('messages').scrollHeight = 500;
    el('messages').scrollTop = 0;
    socketHandlers['message:new']!({ ...message, id: 2 });
    await flush();
    expect(client.socket.emitWithAck).toHaveBeenCalledTimes(1);
    el('messages').scrollTop = 400;
    el('messages').handlers.scroll!();
    await flush();
    expect(client.socket.emitWithAck).toHaveBeenLastCalledWith('message:read', { roomId: 'room', messageId: 2 });
});

test('failed read saves retry without locally clearing unread progress', async () => {
    client.socket.emitWithAck.mockResolvedValueOnce({ ok: false, error: { message: 'Database failed' } });
    select();
    await flush();
    expect(el('read-status').textContent).not.toBe('');
    expect(client.socket.emitWithAck).toHaveBeenCalledTimes(1);
    await el('retry-messages').handlers.click!();
    await flush();
    expect(client.socket.emitWithAck).toHaveBeenCalledTimes(2);
    expect(el('read-status').textContent).toBe('');
});

test('Enter submits, Shift+Enter and IME confirmation do not; room switches preserve drafts', async () => {
    select();
    await flush();
    el('message').value = 'draft';
    el('message').handlers.input!();
    const preventDefault = vi.fn();
    el('message').handlers.keydown!({ key: 'Enter', preventDefault, shiftKey: true });
    el('message').handlers.keydown!({ key: 'Enter', preventDefault, isComposing: true });
    expect(el('message-form').requestSubmit).not.toHaveBeenCalled();
    el('message').handlers.keydown!({ key: 'Enter', preventDefault });
    expect(el('message-form').requestSubmit).toHaveBeenCalledOnce();
    select('another');
    expect(el('message').value).toBe('');
    select();
    expect(el('message').value).toBe('draft');
    await flush();
});

test('read events from another tab prevent redundant older acknowledgements', async () => {
    socketHandlers['room:read']!({ roomId: 'room', lastReadMessageId: 10 });
    socketHandlers['room:read']!({ roomId: 'room', lastReadMessageId: 3 });
    select();
    await flush();
    expect(client.socket.emitWithAck).not.toHaveBeenCalled();
});

test('distinguishes our bubbles from incoming messages using the signed-in user ID', async () => {
    select();
    await flush();
    socketHandlers['message:new']!({ ...message, id: 2, senderId: 'alice' });
    const [incoming, outgoing] = el('messages').children;
    expect(incoming!.className).toContain('justify-content-start');
    expect(incoming!.children[0]!.textContent).toBe('b');
    expect(incoming!.children[1]!.children[0]!.textContent).toBe('bob');
    expect(incoming!.children[1]!.children[1]!.className).toContain('bg-body-tertiary');
    expect(outgoing!.className).toContain('justify-content-end');
    expect(outgoing!.children).toHaveLength(1);
    expect(outgoing!.children[0]!.children[0]!.textContent).toBe('나');
    expect(outgoing!.children[0]!.children[1]!.className).toContain('text-bg-primary');
});

test('preserves blank lines and renders markup as text in message bubbles', async () => {
    select();
    await flush();
    socketHandlers['message:new']!({ ...message, text: '<img src=x>\n\nHello' });
    const body = el('messages').children[0]!.children[1]!.children[1]!;
    expect(body.children.map(child => child.tagName)).toEqual(['', 'br', '', 'br', '']);
    expect(body.children.map(child => child.textContent)).toEqual(['<img src=x>', '', '', '', 'Hello']);
});
