import { db } from '@prisma/db';
import { AppError } from '@lib/error';

export async function listChatRooms(userId: string) {
    return db.orm.public.Room
        .where((room) => room.members.some((member) => member.userId.eq(userId)))
        .select('id', 'name', 'createdAt')
        .include('members', (members) => members.select('userId')
            .include('user', (user) => user.select('id', 'username', 'name')))
        .orderBy((room) => room.createdAt.desc()).all();
}

export async function createChatRoom(creatorId: string, name: string, participantIds: string[]) {
    const userIds = [...new Set([creatorId, ...participantIds])];
    return db.transaction(async (tx) => {
        const users = await tx.orm.public.User.where((user) => user.id.in(userIds)).select('id').all();
        if (users.length !== userIds.length) {
            throw new AppError({ statusCode: 400, code: 'INVALID_PARTICIPANTS', message: '선택한 사용자를 찾을 수 없습니다. 다시 검색해 주세요.' });
        }
        const room = await tx.orm.public.Room.create({ name });
        for (const userId of userIds) {
            await tx.orm.public.RoomMember.create({ roomId: room.id, userId });
        }
        return room;
    });
}
