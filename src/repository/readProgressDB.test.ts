import { beforeEach, expect, test, vi } from 'vitest';
import { markMessagesRead } from './messageDB';
import { db } from '@prisma/db';

vi.mock('@prisma/db', () => ({ db: { transaction: vi.fn() } }));
vi.mock('@prisma/orm-postgres/orm-client', () => ({ or: (...values: boolean[]) => values.some(Boolean) }));
let lastRead: number | null;
let memberExists: boolean;
let messageExists: boolean;
const update = vi.fn();
const messageWhere = vi.fn();
const memberWhere = vi.fn();
beforeEach(() => {
    vi.clearAllMocks();
    lastRead = null;
    memberExists = true;
    messageExists = true;
    memberWhere.mockImplementation(() => ({
        first: async () => memberExists ? { lastReadMessageId: lastRead } : null,
        where: (predicate: (row: any) => boolean) => ({
            update: async ({ lastReadMessageId }: { lastReadMessageId: number }) => {
                // Evaluate at UPDATE time, as the database does after waiting on a concurrent writer.
                if (predicate({ lastReadMessageId: { isNull: () => lastRead === null, lt: (id: number) => lastRead !== null && lastRead < id } })) {
                    update(lastReadMessageId);
                    lastRead = lastReadMessageId;
                }
            },
        }),
    }));
    messageWhere.mockImplementation(() => ({ first: async () => messageExists ? { id: 10 } : null }));
    vi.mocked(db.transaction).mockImplementation(async callback => callback({ orm: { public: {
        RoomMember: { where: memberWhere }, Message: { where: messageWhere },
    } } } as never));
});

test('null read marker advances and stale or duplicate markers cannot move it backward', async () => {
    await expect(markMessagesRead('alice', 'room', 10)).resolves.toEqual({ roomId: 'room', lastReadMessageId: 10 });
    await expect(markMessagesRead('alice', 'room', 4)).resolves.toEqual({ roomId: 'room', lastReadMessageId: 10 });
    await markMessagesRead('alice', 'room', 10);
    expect(update).toHaveBeenCalledExactlyOnceWith(10);
    expect(memberWhere).toHaveBeenCalledWith({ userId: 'alice', roomId: 'room' });
    expect(messageWhere).toHaveBeenCalledWith({ roomId: 'room', id: 4 });
});

test('nonmembers cannot update read progress', async () => {
    memberExists = false;
    await expect(markMessagesRead('outsider', 'room', 10)).rejects.toMatchObject({ code: 'NOT_ROOM_MEMBER' });
    expect(update).not.toHaveBeenCalled();
    expect(messageWhere).not.toHaveBeenCalled();
});

test('nonexistent messages and messages from another room cannot update read progress', async () => {
    messageExists = false;
    await expect(markMessagesRead('alice', 'room', 10)).rejects.toMatchObject({ code: 'INVALID_MESSAGE' });
    expect(messageWhere).toHaveBeenCalledWith({ roomId: 'room', id: 10 });
    expect(update).not.toHaveBeenCalled();
});
