import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const script = readFileSync(new URL('../public/js/chat-rooms.js', import.meta.url), 'utf8');
class Element {
    textContent = '';
    value = '';
    hidden = false;
    disabled = false;
    children: Element[] = [];
    attributes: Record<string, string> = {};
    handlers: Record<string, (...args: any[]) => any> = {};
    classList = { contains: vi.fn(() => false) };
    focus = vi.fn();
    reset = vi.fn();
    addEventListener(event: string, handler: (...args: any[]) => any) { this.handlers[event] = handler; }
    append(...children: Element[]) { this.children.push(...children); }
    replaceChildren(...children: Element[]) { this.children = children; }
    setAttribute(key: string, value: string) { this.attributes[key] = value; }
}
let elements: Record<string, Element>;
let request: ReturnType<typeof vi.fn>;
let reload: ReturnType<typeof vi.fn>;
let documentHandlers: Record<string, (...args: any[]) => any>;
let socketHandlers: Record<string, (...args: any[]) => any>;
let client: any;
let modal: { show: ReturnType<typeof vi.fn>; hide: ReturnType<typeof vi.fn> };
let offcanvas: { hide: ReturnType<typeof vi.fn> };
const el = (id: string) => elements[id] ??= new Element();
const reply = (data: unknown) => ({ ok: true, json: async () => data });
const room = { name: '<img src=x onerror=alert(1)>', members: [{ user: { name: 'Bob', username: 'bob' } }] };
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
function start() {
    runInNewContext(script, {
        document: {
            getElementById: el, createElement: () => new Element(), chatClient: client,
            addEventListener: (event: string, handler: (...args: any[]) => any) => { documentHandlers[event] = handler; },
            dispatchEvent: (event: any) => documentHandlers[event.type]?.(event),
        },
        CustomEvent: class {
            detail: unknown;
            constructor(public type: string, options: { detail: unknown }) { this.detail = options.detail; }
        },
        bootstrap: { Modal: { getOrCreateInstance: () => modal }, Offcanvas: { getInstance: () => offcanvas } },
        matchMedia: () => ({ matches: false }),
        fetch: request, location: { reload }, AbortController, setTimeout, clearTimeout,
    });
}
beforeEach(() => {
    vi.useFakeTimers();
    elements = {};
    modal = { show: vi.fn(), hide: vi.fn() };
    offcanvas = { hide: vi.fn() };
    documentHandlers = {};
    socketHandlers = {};
    client = { isReady: vi.fn(() => true), socket: {
        on: (event: string, handler: (...args: any[]) => any) => { socketHandlers[event] = handler; },
    } };
    request = vi.fn();
    reload = vi.fn();
});
afterEach(() => vi.useRealTimers());

test('loads rooms through the API and renders names as text', async () => {
    request.mockResolvedValue(reply({ rooms: [room] }));
    start();
    expect(el('room-list').attributes['aria-busy']).toBe('true');
    await flush();
    expect(request).toHaveBeenCalledWith('/api/chat-rooms', expect.objectContaining({ cache: 'no-store' }));
    expect(el('room-list').children[0]?.children[0]?.children[0]?.textContent).toBe(room.name);
    expect(el('room-count').textContent).toBe('1');
    expect(el('rooms-empty').hidden).toBe(true);
});

test('a failed initial load can be retried and show the empty state', async () => {
    request.mockRejectedValueOnce(new Error('offline')).mockResolvedValue(reply({ rooms: [] }));
    start();
    await flush();
    expect(el('retry-rooms').hidden).toBe(false);
    expect(el('room-list-status').textContent).toContain('offline');
    await el('retry-rooms').handlers.click!();
    expect(el('rooms-empty').hidden).toBe(false);
    expect(el('room-count').textContent).toBe('0');
});

test.each([false, true])('creation updates without reload; refresh failure=%s', async (failRefresh) => {
    request.mockResolvedValueOnce(reply({ rooms: [] }))
        .mockResolvedValueOnce(reply({ users: [{ id: 'bob', name: 'Bob', username: 'bob', email: 'bob@example.com' }] }))
        .mockResolvedValueOnce(reply({ room: { id: 'new-room' } }));
    if (failRefresh) request.mockRejectedValueOnce(new Error('offline'));
    else request.mockResolvedValueOnce(reply({ rooms: [room] }));
    start();
    await flush();
    el('user-search').value = 'bob';
    el('user-search').handlers.input!();
    await vi.advanceTimersByTimeAsync(250);
    el('user-results').children[0]!.children[0]!.handlers.click!();
    el('room-name').value = 'Friends';
    await el('room-form').handlers.submit!({ preventDefault: vi.fn() });
    expect(reload).not.toHaveBeenCalled();
    expect(modal.hide).toHaveBeenCalledOnce();
    expect(el('room-form').reset).toHaveBeenCalledOnce();
    expect(el('selected-users').children).toHaveLength(0);
    expect(el('create-room').disabled).toBe(false);
    expect(el('room-error').textContent).toBe('');
    if (failRefresh) expect(el('retry-rooms').hidden).toBe(false);
    else expect(el('room-count').textContent).toBe('1');
    expect(request.mock.calls.filter(([, options]) => options.method === 'POST')).toHaveLength(1);
});

test('renders unread counts and makes the whole room card a selection button', async () => {
    request.mockResolvedValue(reply({ rooms: [{ ...room, id: 'room', unreadCount: 3, lastReadMessageId: 5 }] }));
    start();
    await flush();
    const button = el('room-list').children[0]!.children[0]!;
    expect(button.attributes['aria-pressed']).toBe('false');
    expect(button.children[3]!.textContent).toBe('3');
    expect(button.children[3]!.hidden).toBe(false);
    expect(button.children[3]!.attributes['aria-label']).toContain('3');
    button.handlers.click!();
    expect(button.attributes['aria-pressed']).toBe('true');
    expect(button.children[3]!.textContent).toBe('3'); // Selecting alone cannot clear unsaved unread counts.
});

test('new messages and read acknowledgements refresh persisted unread counts and retain selection', async () => {
    request.mockResolvedValue(reply({ rooms: [{ ...room, id: 'room', unreadCount: 2 }] }));
    start();
    await flush();
    el('room-list').children[0]!.children[0]!.handlers.click!();
    request.mockResolvedValue(reply({ rooms: [{ ...room, id: 'room', unreadCount: 3 }] }));
    socketHandlers['message:new']!();
    socketHandlers['message:new']!();
    await vi.advanceTimersByTimeAsync(150);
    expect(request).toHaveBeenCalledTimes(2);
    expect(el('room-list').children[0]!.children[0]!.children[3]!.textContent).toBe('3');
    expect(el('room-list').children[0]!.children[0]!.attributes['aria-pressed']).toBe('true');
    request.mockResolvedValue(reply({ rooms: [{ ...room, id: 'room', unreadCount: 0 }] }));
    socketHandlers['room:read']!();
    await vi.advanceTimersByTimeAsync(150);
    expect(el('room-list').children[0]!.children[0]!.children[3]!.hidden).toBe(true);
    client.isReady.mockReturnValue(false);
    client.onRoomsStatus();
    client.isReady.mockReturnValue(true);
    client.onRoomsStatus();
    await vi.advanceTimersByTimeAsync(150);
    expect(request).toHaveBeenCalledTimes(4);
});

test('waits for the mobile sidebar to close before opening the modal', async () => {
    request.mockResolvedValue(reply({ rooms: [] }));
    start();
    el('room-sidebar').classList.contains.mockReturnValue(true);
    el('new-room').handlers.click!();
    expect(offcanvas.hide).toHaveBeenCalledOnce();
    expect(modal.show).not.toHaveBeenCalled();
    el('room-sidebar').handlers['hidden.bs.offcanvas']!();
    expect(modal.show).toHaveBeenCalledOnce();
    el('room-dialog').handlers['shown.bs.modal']!();
    expect(el('room-name').focus).toHaveBeenCalledOnce();
    el('room-dialog').handlers['hidden.bs.modal']!();
    expect(el('toggle-rooms').focus).toHaveBeenCalledOnce();
    await flush();
});

test('opens the modal directly when the sidebar is not overlaid', async () => {
    request.mockResolvedValue(reply({ rooms: [] }));
    start();
    el('new-room').handlers.click!();
    expect(modal.show).toHaveBeenCalledOnce();
    expect(offcanvas.hide).not.toHaveBeenCalled();
    await flush();
});
