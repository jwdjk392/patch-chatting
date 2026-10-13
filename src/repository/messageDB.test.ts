import { beforeEach, expect, test, vi } from 'vitest';
import { saveMessage, listMessages } from './messageDB';
import { db } from '@prisma/db';

const mocks = vi.hoisted(() => ({ members: vi.fn(), create: vi.fn(), first: vi.fn(), history: vi.fn(), limit: vi.fn() }));
vi.mock('@prisma/db', () => ({ db: { transaction: vi.fn(), orm: { public: {
    RoomMember: { where: () => ({ first: mocks.first }) },
    Message: { where: () => ({ orderBy: () => ({ limit: mocks.limit }) }) },
} } } }));
beforeEach(() => {
    vi.resetAllMocks();
    mocks.limit.mockReturnValue({ all: mocks.history });
    vi.mocked(db.transaction).mockImplementation(async callback => callback({ orm: { public: {
        RoomMember: { where: () => ({ select: () => ({ all: mocks.members }) }) },
        Message: { create: mocks.create },
    } } } as never));
});

test('saves a message for all members regardless of online presence', async () => {
    mocks.members.mockResolvedValue([{ userId: 'alice' }, { userId: 'bob' }]);
    mocks.create.mockResolvedValue({ id: 1, text: 'hello' });
    await expect(saveMessage('alice', 'room', 'hello')).resolves.toEqual({ message: { id: 1, text: 'hello' }, recipientIds: ['alice', 'bob'] });
    expect(mocks.create).toHaveBeenCalledWith({ roomId: 'room', senderId: 'alice', text: 'hello' });
});

test.each([{ members: [] }, { members: [{ userId: 'bob' }] }])('denies nonmembers and nonexistent rooms', async ({ members }) => {
    mocks.members.mockResolvedValue(members);
    await expect(saveMessage('alice', 'room', 'hello')).rejects.toMatchObject({ code: 'NOT_ROOM_MEMBER' });
    expect(mocks.create).not.toHaveBeenCalled();
});

test('write errors reject the transaction', async () => {
    mocks.members.mockResolvedValue([{ userId: 'alice' }]);
    mocks.create.mockRejectedValue(new Error('write failed'));
    await expect(saveMessage('alice', 'room', 'hello')).rejects.toThrow('write failed');
});

test('history requires membership and returns latest 100 in chronological order', async () => {
    mocks.first.mockResolvedValue(null);
    await expect(listMessages('alice', 'room')).rejects.toMatchObject({ code: 'NOT_ROOM_MEMBER' });
    expect(mocks.history).not.toHaveBeenCalled();
    mocks.first.mockResolvedValue({ userId: 'alice' });
    mocks.history.mockResolvedValue([{ id: 2 }, { id: 1 }]);
    await expect(listMessages('alice', 'room')).resolves.toEqual([{ id: 1 }, { id: 2 }]);
    expect(mocks.limit).toHaveBeenCalledWith(100);
});
