import { Router } from 'express';
import { requireUser } from '@middleware/requireUserMiddleware';
import { createChatRoomHandler, listChatRoomsHandler } from '@controller/chatRoomController';

const router = Router();

router.use(requireUser);
router.get('/', listChatRoomsHandler);
router.post('/', createChatRoomHandler);

export default router;
