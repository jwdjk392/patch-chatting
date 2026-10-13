import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const script = readFileSync(new URL('../public/js/chat.js', import.meta.url), 'utf8');
let socket: any;
let handlers: Record<string, (...args: any[]) => any>;
let managerHandlers: Record<string, (...args: any[]) => any>;
let dialog: any;
let status: any;
let clientConsole: { info: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };
let fetchToken: ReturnType<typeof vi.fn>;
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
beforeEach(() => {
    vi.useFakeTimers();
    handlers = {};
    managerHandlers = {};
    status = { dataset: { state: 'connecting' }, textContent: '' };
    clientConsole = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    dialog = { open: false, showModal: vi.fn(() => { dialog.open = true; }), close: vi.fn(() => { dialog.open = false; }) };
    socket = {
        connected: true,
        on: (event: string, handler: (...args: any[]) => any) => { handlers[event] = handler; },
        io: { on: (event: string, handler: (...args: any[]) => any) => { managerHandlers[event] = handler; } },
        connect: vi.fn(), disconnect: vi.fn(), timeout: () => socket,
        emitWithAck: vi.fn(async () => ({ ok: true, expiresAt: Date.now() + 900_000, serverTime: Date.now() })),
    };
    fetchToken = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ token: 'jwt' }) }));
    runInNewContext(script, {
        io: () => socket, fetch: fetchToken, AbortController, Date, Number,
        setTimeout, clearTimeout, console: clientConsole,
        document: { getElementById: (id: string) => id === 'connection-dialog' ? dialog : id === 'connection-status' ? status : { addEventListener: vi.fn() } },
        location: { reload: vi.fn() },
    });
});
afterEach(() => vi.useRealTimers());

test('fetches after connecting, authenticates and refreshes before expiry', async () => {
    expect(fetchToken).not.toHaveBeenCalled();
    handlers.connect!();
    expect(status.dataset.state).toBe('authenticating');
    await flush();
    expect(status.dataset.state).toBe('connected');
    expect(socket.emitWithAck).toHaveBeenCalledWith('authenticate', 'jwt');
    await vi.advanceTimersByTimeAsync(840_000);
    expect(fetchToken).toHaveBeenCalledTimes(2);
    expect(socket.disconnect).not.toHaveBeenCalled();
});
test('failed refreshes retry until expiry, then disconnect and show modal', async () => {
    handlers.connect!();
    await flush();
    fetchToken.mockRejectedValue(new Error('offline'));
    await vi.advanceTimersByTimeAsync(840_000);
    expect(dialog.open).toBe(true);
    expect(status.dataset.state).toBe('retrying');
    expect(socket.disconnect).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(socket.disconnect).toHaveBeenCalled();
    expect(status.dataset.state).toBe('disconnected');
});
test('expired login and exhausted reconnection show modal and stop', async () => {
    fetchToken.mockResolvedValue({ ok: false, status: 401 });
    handlers.connect!();
    await flush();
    expect(socket.disconnect).toHaveBeenCalled();
    expect(dialog.open).toBe(true);
    managerHandlers.reconnect_failed!();
    expect(dialog.open).toBe(true);
});
test('ignores stale requests after disconnection and authenticates on reconnection', async () => {
    let resolve: (value: any) => void = () => {};
    fetchToken.mockReturnValueOnce(new Promise(done => { resolve = done; }));
    handlers.connect!();
    handlers.disconnect!('transport close');
    expect(status.dataset.state).toBe('reconnecting');
    resolve({ ok: true, status: 200, json: async () => ({ token: 'old' }) });
    await flush();
    expect(socket.emitWithAck).not.toHaveBeenCalled();
    handlers.connect!();
    await flush();
    expect(socket.emitWithAck).toHaveBeenCalledWith('authenticate', 'jwt');
    expect(dialog.open).toBe(false);
    expect(status.dataset.state).toBe('connected');
});

test('logs reconnect attempts and authentication results without credentials', async () => {
    managerHandlers.reconnect_attempt!(2);
    expect(clientConsole.info).toHaveBeenCalledWith('[Chat] Reconnecting', { attempt: 2 });
    handlers.connect!();
    await flush();
    expect(clientConsole.info).toHaveBeenCalledWith('[Chat] Authentication succeeded');
    expect(JSON.stringify(clientConsole.info.mock.calls)).not.toContain('jwt');
    managerHandlers.reconnect_failed!();
    expect(status.dataset.state).toBe('disconnected');
    expect(clientConsole.warn).toHaveBeenCalledWith('[Chat] Connection stopped', { code: 'RECONNECT_FAILED' });
});
