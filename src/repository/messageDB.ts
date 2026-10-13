import { or } from '@prisma/orm-postgres/orm-client';
import { db } from '@prisma/db';
import { AppError } from '@lib/error';

export async function saveMessage(senderId: string, roomId: string, text: string) {
    return db.transaction(async (tx) => {
        const members = await tx.orm.public.RoomMember.where({ roomId }).select('userId').all();
        if (!members.some((member) => member.userId === senderId)) {
            throw new AppError({ statusCode: 403, code: 'NOT_ROOM_MEMBER', message: '대화방에 참여한 사용자만 메시지를 보낼 수 있습니다.' });
        }
        const message = await tx.orm.public.Message.create({ roomId, senderId, text });
        return { message, recipientIds: members.map((member) => member.userId) };
    });
}

export async function listMessages(userId: string, roomId: string) {
    const member = await db.orm.public.RoomMember.where({ roomId, userId }).first();
    if (!member) {
        throw new AppError({ statusCode: 403, code: 'NOT_ROOM_MEMBER', message: '대화방에 참여한 사용자만 메시지를 볼 수 있습니다.' });
    }
    const messages = await db.orm.public.Message.where({ roomId })
        .orderBy((message) => message.id.desc()).limit(100).all();
    return messages.reverse();
}

// A conditional UPDATE makes concurrent/out-of-order acknowledgements monotonic.
export async function markMessagesRead(userId: string, roomId: string, messageId: number) {
    return db.transaction(async (tx) => {
        const member = await tx.orm.public.RoomMember.where({ roomId, userId }).first();
        if (!member) {
            throw new AppError({ statusCode: 403, code: 'NOT_ROOM_MEMBER', message: '참여 중인 대화방이 아닙니다.' });
        }
        const message = await tx.orm.public.Message.where({ roomId, id: messageId }).first();
        if (!message) {
            throw new AppError({ statusCode: 400, code: 'INVALID_MESSAGE', message: '대화방의 메시지를 찾을 수 없습니다.' });
        }
        await tx.orm.public.RoomMember.where({ roomId, userId })
            .where((row) => or(row.lastReadMessageId.isNull(), row.lastReadMessageId.lt(messageId)))
            .update({ lastReadMessageId: messageId });
        const updated = await tx.orm.public.RoomMember.where({ roomId, userId }).first();
        return { roomId, lastReadMessageId: updated!.lastReadMessageId! };
    });
}
