import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import type { Server as HttpServer } from 'node:http';
import { setupSocketController } from './socketController';
import { createSocketToken } from '@service/socketAuthService';

vi.mock('socket.io', () => ({ Server: class extends EventEmitter {} }));
vi.mock('@lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn() } }));
let socket: any;
let handlers: Record<string, (...args: any[]) => any>;
let guard: (packet: unknown[], next: () => void) => void;
beforeEach(() => {
    vi.stubEnv('SESSION_SECRET', 'test-secret');
    vi.useFakeTimers();
    handlers = {};
    socket = {
        connected: true, data: {}, emit: vi.fn(),
        on: (event: string, handler: (...args: any[]) => any) => { handlers[event] = handler; },
        use: (middleware: typeof guard) => { guard = middleware; },
        disconnect: vi.fn(() => { socket.connected = false; handlers.disconnect?.('server disconnect'); }),
    };
    const io = setupSocketController({} as HttpServer);
    io.emit('connection', socket);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

test('blocks application events before authentication', () => {
    const next = vi.fn();
    guard(['message'], next);
    expect(next).not.toHaveBeenCalled();
    expect(socket.disconnect).toHaveBeenCalledWith(true);
});
test('closes connections which never authenticate', () => {
    vi.advanceTimersByTime(15_000);
    expect(socket.disconnect).toHaveBeenCalledWith(true);
});
test('trusts valid tokens, extends expiry on refresh and disconnects at expiry', async () => {
    const ack = vi.fn();
    await handlers.authenticate!((await createSocketToken('user', 'session')).token, ack);
    expect(socket.data.userId).toBe('user');
    expect(ack).toHaveBeenCalledWith(expect.objectContaining({ ok: true }));
    const next = vi.fn();
    guard(['message'], next);
    expect(next).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(840_000);
    await handlers.authenticate!((await createSocketToken('user', 'session')).token, ack);
    vi.advanceTimersByTime(60_000);
    expect(socket.connected).toBe(true);
    vi.advanceTimersByTime(840_000);
    expect(socket.connected).toBe(false);
});
test('rejects invalid tokens and identity changes on refresh', async () => {
    await handlers.authenticate!((await createSocketToken('user', 'session')).token, vi.fn());
    await handlers.authenticate!((await createSocketToken('other', 'session')).token, vi.fn());
    expect(socket.disconnect).toHaveBeenCalledWith(true);
});
test('rejects malformed tokens', async () => {
    await handlers.authenticate!('bad', vi.fn());
    expect(socket.disconnect).toHaveBeenCalledWith(true);
});
