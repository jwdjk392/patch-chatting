import { beforeEach, expect, test, vi } from 'vitest';
import { createChatRoom } from './chatRoomDB';
import { db } from '@prisma/db';

vi.mock('@prisma/db', () => ({ db: { transaction: vi.fn() } }));
const all = vi.fn();
const createRoom = vi.fn();
const createMember = vi.fn();
beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(db.transaction).mockImplementation(async (callback) => callback({ orm: { public: {
        User: { where: () => ({ select: () => ({ all }) }) },
        Room: { create: createRoom }, RoomMember: { create: createMember },
    } } } as never));
    createRoom.mockResolvedValue({ id: 'room', name: 'Friends' });
});

test('creates room and deduplicated memberships inside one transaction', async () => {
    all.mockResolvedValue([{ id: 'alice' }, { id: 'bob' }]);
    await expect(createChatRoom('alice', 'Friends', ['bob', 'alice', 'bob'])).resolves.toMatchObject({ id: 'room' });
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(createMember.mock.calls).toEqual([[{ roomId: 'room', userId: 'alice' }], [{ roomId: 'room', userId: 'bob' }]]);
});

test('missing participants prevent any writes', async () => {
    all.mockResolvedValue([{ id: 'alice' }]);
    await expect(createChatRoom('alice', 'Friends', ['missing'])).rejects.toMatchObject({ code: 'INVALID_PARTICIPANTS' });
    expect(createRoom).not.toHaveBeenCalled();
    expect(createMember).not.toHaveBeenCalled();
});

test('membership failure rejects the transaction for rollback', async () => {
    all.mockResolvedValue([{ id: 'alice' }, { id: 'bob' }]);
    createMember.mockRejectedValue(new Error('write failed'));
    await expect(createChatRoom('alice', 'Friends', ['bob'])).rejects.toThrow('write failed');
});
