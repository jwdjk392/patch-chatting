import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import type { Server as HttpServer } from 'node:http';
import { setupSocketController } from './socketController';
import { saveMessage, markMessagesRead } from '@repository/messageDB';
import { AppError } from '@lib/error';
import { createSocketToken } from '@service/socketAuthService';

const delivery = vi.hoisted(() => ({ emit: vi.fn(), to: vi.fn() }));
vi.mock('socket.io', () => ({ Server: class extends EventEmitter { to = delivery.to; } }));
vi.mock('@repository/messageDB', () => ({ saveMessage: vi.fn(), markMessagesRead: vi.fn() }));
vi.mock('@lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn() } }));
let socket: any;
let handlers: Record<string, (...args: any[]) => any>;
let guard: (packet: unknown[], next: () => void) => void;
beforeEach(() => {
    vi.clearAllMocks();
    delivery.to.mockReturnValue({ emit: delivery.emit });
    vi.stubEnv('SESSION_SECRET', 'test-secret');
    vi.useFakeTimers();
    handlers = {};
    socket = {
        connected: true, data: {}, emit: vi.fn(), join: vi.fn(),
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

async function authenticateSender() {
    await handlers.authenticate!((await createSocketToken('user', 'session')).token, vi.fn());
}

test('joins only the authenticated account delivery room', async () => {
    expect(socket.join).not.toHaveBeenCalled();
    await authenticateSender();
    expect(socket.join).toHaveBeenCalledWith('user:user');
});

test('persists as the authenticated sender before broadcasting and acknowledging', async () => {
    await authenticateSender();
    let commit!: (value: any) => void;
    vi.mocked(saveMessage).mockReturnValue(new Promise(resolve => { commit = resolve; }));
    const ack = vi.fn();
    const pending = handlers['message:send']!({ roomId: 'room', text: ' hello ', senderId: 'forged' }, ack);
    expect(saveMessage).toHaveBeenCalledWith('user', 'room', 'hello');
    expect(delivery.emit).not.toHaveBeenCalled();
    expect(ack).not.toHaveBeenCalled();
    const message = { id: 1, roomId: 'room', senderId: 'user', text: 'hello', sentAt: '2026-10-14T00:00:00Z' };
    commit({ message, recipientIds: ['user', 'other'] });
    await pending;
    expect(delivery.to).toHaveBeenCalledWith(['user:user', 'user:other']);
    expect(delivery.emit).toHaveBeenCalledWith('message:new', message);
    expect(ack).toHaveBeenCalledWith({ ok: true, message });
});

test.each([null, {}, { roomId: 'room', text: ' ' }, { roomId: 'room', text: 'a'.repeat(4001) }])('rejects invalid message %j without writing', async (payload) => {
    await authenticateSender();
    const ack = vi.fn();
    await handlers['message:send']!(payload, ack);
    expect(saveMessage).not.toHaveBeenCalled();
    expect(ack).toHaveBeenCalledWith(expect.objectContaining({ ok: false }));
});

test.each([
    [new Error('database credentials'), 'MESSAGE_FAILED'],
    [new AppError({ code: 'NOT_ROOM_MEMBER', statusCode: 403 }), 'NOT_ROOM_MEMBER'],
])('failed persistence never broadcasts', async (error, code) => {
    await authenticateSender();
    vi.mocked(saveMessage).mockRejectedValue(error);
    const ack = vi.fn();
    await handlers['message:send']!({ roomId: 'room', text: 'hello' }, ack);
    expect(delivery.emit).not.toHaveBeenCalled();
    expect(ack).toHaveBeenCalledWith({ ok: false, error: expect.objectContaining({ code }) });
    expect(JSON.stringify(ack.mock.calls)).not.toContain('database credentials');
});

test('read progress uses authenticated identity and updates only that account sockets', async () => {
    await authenticateSender();
    vi.mocked(markMessagesRead).mockResolvedValue({ roomId: 'room', lastReadMessageId: 9 });
    const ack = vi.fn();
    await handlers['message:read']!({ roomId: 'room', messageId: 9, userId: 'forged' }, ack);
    expect(markMessagesRead).toHaveBeenCalledWith('user', 'room', 9);
    expect(delivery.to).toHaveBeenCalledWith('user:user');
    expect(delivery.emit).toHaveBeenCalledWith('room:read', { roomId: 'room', lastReadMessageId: 9 });
    expect(ack).toHaveBeenCalledWith({ ok: true, roomId: 'room', lastReadMessageId: 9 });
});

test.each([null, {}, { roomId: 'room', messageId: -1 }, { roomId: 'room', messageId: 1.5 }, { roomId: 'room', messageId: '1' }, { roomId: 'room', messageId: 2147483648 }])('invalid read markers never write', async payload => {
    await authenticateSender();
    const ack = vi.fn();
    await handlers['message:read']!(payload, ack);
    expect(markMessagesRead).not.toHaveBeenCalled();
    expect(ack).toHaveBeenCalledWith(expect.objectContaining({ ok: false }));
});

test('failed read saves do not broadcast success', async () => {
    await authenticateSender();
    vi.mocked(markMessagesRead).mockRejectedValue(new AppError({ statusCode: 403, code: 'NOT_ROOM_MEMBER' }));
    const ack = vi.fn();
    await handlers['message:read']!({ roomId: 'room', messageId: 9 }, ack);
    expect(delivery.emit).not.toHaveBeenCalled();
    expect(ack).toHaveBeenCalledWith({ ok: false, error: expect.objectContaining({ code: 'NOT_ROOM_MEMBER' }) });
});
