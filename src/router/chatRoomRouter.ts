import { Router } from 'express';
import { requireUser } from '@middleware/requireUserMiddleware';
import { createChatRoomHandler, listChatRoomsHandler, listMessagesHandler } from '@controller/chatRoomController';

const router = Router();

router.use(requireUser);
router.get('/', listChatRoomsHandler);
router.get('/:roomId/messages', listMessagesHandler);
router.post('/', createChatRoomHandler);

export default router;
