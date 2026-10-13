import { afterAll, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import router from './chatRoomRouter';
import userRouter from './userRouter';
import { apiErrorHandler } from '@middleware/apiErrorMiddleware';
import { findAccountById } from '@repository/authDBHandler';
import { createChatRoom, listChatRooms } from '@repository/chatRoomDB';
import { searchUsers } from '@repository/userDB';

vi.mock('@repository/authDBHandler', () => ({ findAccountById: vi.fn() }));
vi.mock('@repository/chatRoomDB', () => ({ createChatRoom: vi.fn(), listChatRooms: vi.fn() }));
vi.mock('@repository/userDB', () => ({ searchUsers: vi.fn() }));
let server: Server;
let base: string;
let usersBase: string;
beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
        req.session = (req.headers['x-test-user'] ? { userId: String(req.headers['x-test-user']) } : {}) as typeof req.session;
        next();
    });
    app.use('/rooms', router);
    app.use('/users', userRouter);
    app.use(apiErrorHandler);
    await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
    const address = server.address();
    base = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}/rooms`;
    usersBase = base.replace(/\/rooms$/, '/users');
});
afterAll(() => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(findAccountById).mockResolvedValue({ id: 'alice', username: 'alice', name: null });
});
const headers = { 'x-test-user': 'alice', 'Content-Type': 'application/json' };

test('guests and removed accounts cannot search or create rooms', async () => {
    expect((await fetch(`${usersBase}?q=bob`)).status).toBe(401);
    vi.mocked(findAccountById).mockResolvedValue(null);
    expect((await fetch(base, { method: 'POST', headers, body: '{}' })).status).toBe(401);
    expect(createChatRoom).not.toHaveBeenCalled();
    expect(searchUsers).not.toHaveBeenCalled();
});

test('search validates and trims the query, excluding the session identity', async () => {
    vi.mocked(searchUsers).mockResolvedValue([]);
    expect((await fetch(`${usersBase}?q=a`, { headers })).status).toBe(400);
    const response = await fetch(`${usersBase}?q=%20bob%20`, { headers });
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(searchUsers).toHaveBeenCalledExactlyOnceWith('alice', 'bob');
});

test('listing always uses the signed-in identity', async () => {
    vi.mocked(listChatRooms).mockResolvedValue([]);
    expect((await fetch(`${base}?userId=bob`, { headers })).status).toBe(200);
    expect(listChatRooms).toHaveBeenCalledExactlyOnceWith('alice');
});

test.each([
    {}, { name: ' ', participantIds: ['bob'] }, { name: 'x'.repeat(101), participantIds: ['bob'] },
    { name: 'Room', participantIds: [] }, { name: 'Room', participantIds: ['alice'] },
    { name: 'Room', participantIds: [123] }, { name: 'Room', participantIds: Array(50).fill('bob') },
])('rejects invalid creation input %j', async (body) => {
    expect((await fetch(base, { method: 'POST', headers, body: JSON.stringify(body) })).status).toBe(400);
    expect(createChatRoom).not.toHaveBeenCalled();
});

test('creates with the session creator and returns the persisted room', async () => {
    vi.mocked(createChatRoom).mockResolvedValue({ id: 'room-1', name: 'Friends', createdAt: '2026-10-14T00:00:00Z' });
    const response = await fetch(base, { method: 'POST', headers, body: JSON.stringify({ name: ' Friends ', participantIds: ['bob'], creatorId: 'eve' }) });
    expect(response.status).toBe(201);
    expect(createChatRoom).toHaveBeenCalledExactlyOnceWith('alice', 'Friends', ['bob']);
    expect(await response.json()).toMatchObject({ room: { id: 'room-1' } });
});
