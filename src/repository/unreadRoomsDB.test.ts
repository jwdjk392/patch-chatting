import { beforeEach, expect, test, vi } from 'vitest';
import { listChatRooms } from './chatRoomDB';

const mocks = vi.hoisted(() => ({ rooms: vi.fn(), messageWhere: vi.fn() }));
vi.mock('@prisma/orm-postgres/orm-client', () => ({ or: (...values: boolean[]) => values.some(Boolean) }));
vi.mock('@prisma/db', () => ({ db: { orm: { public: {
    Room: { where: () => ({ select: () => ({ include: () => ({ orderBy: () => ({ all: mocks.rooms }) }) }) }) },
    Message: { where: mocks.messageWhere },
} } } }));
let marker: number | null;
beforeEach(() => {
    vi.clearAllMocks();
    marker = null;
    mocks.rooms.mockImplementation(async () => [{ id: 'room', name: 'Room', members: [
        { userId: 'alice', lastReadMessageId: marker, user: { username: 'alice' } },
        { userId: 'bob', lastReadMessageId: 99, user: { username: 'bob' } },
    ] }]);
    mocks.messageWhere.mockImplementation(({ roomId }) => {
        let rows = [
            { id: 2, roomId: 'room', senderId: 'bob' },
            { id: 8, roomId: 'room', senderId: 'alice' },
            { id: 12, roomId: 'room', senderId: null },
            { id: 20, roomId: 'another', senderId: 'bob' },
        ].filter(row => row.roomId === roomId);
        const query = {
            where: (predicate: (row: any) => boolean) => {
                rows = rows.filter(row => predicate({ id: { gt: (value: number) => row.id > value }, senderId: {
                    isNull: () => row.senderId === null, neq: (id: string) => row.senderId !== null && row.senderId !== id,
                } }));
                return query;
            },
            aggregate: async () => ({ unreadCount: rows.length }),
        };
        return query;
    });
});

test('null marker counts all incoming messages, excluding own messages and other rooms', async () => {
    const [room] = await listChatRooms('alice');
    expect(room).toMatchObject({ lastReadMessageId: null, unreadCount: 2 });
    expect(room!.members[1]).not.toHaveProperty('lastReadMessageId');
});

test('counts actual rows beyond the saved marker, not the difference between IDs', async () => {
    marker = 2;
    expect((await listChatRooms('alice'))[0]).toMatchObject({ lastReadMessageId: 2, unreadCount: 1 });
    marker = 12;
    expect((await listChatRooms('alice'))[0]).toMatchObject({ unreadCount: 0 });
});
