import { listMessages } from '@repository/messageDB';
import type { Request, Response } from 'express';
import { createChatRoom, listChatRooms } from '@repository/chatRoomDB';
import { AppError } from '@lib/error';

export async function listChatRoomsHandler(req: Request, res: Response) {
    res.setHeader("Cache-Control", "no-store");
    res.json({ rooms: await listChatRooms(req.session.userId!) });
}

export async function createChatRoomHandler(req: Request, res: Response) {
    // JSON-only writes prevent cross-site HTML forms from creating rooms.
    if (!req.is('application/json')) {
        throw new AppError({ statusCode: 415, code: 'JSON_REQUIRED', message: 'JSON 요청이 필요합니다.' });
    }
    const { name, participantIds } = req.body ?? {};
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 100) {
        throw new AppError({ statusCode: 400, code: 'INVALID_ROOM_NAME', message: '대화방 이름을 1~100자로 입력해 주세요.' });
    }
    if (!Array.isArray(participantIds) || participantIds.length < 1 || participantIds.length > 49 ||
        participantIds.some((id) => typeof id !== 'string' || !id.trim() || id.length > 100) ||
        !participantIds.some((id) => id !== req.session.userId)) {
        throw new AppError({ statusCode: 400, code: 'INVALID_PARTICIPANTS', message: '함께할 사용자를 1~49명 선택해 주세요.' });
    }
    const room = await createChatRoom(req.session.userId!, name.trim(), participantIds);
    res.status(201).json({ room });
}

export async function listMessagesHandler(req: Request, res: Response) {
    res.setHeader("Cache-Control", "no-store");
    res.json({ messages: await listMessages(req.session.userId!, req.params.roomId as string) });
}
