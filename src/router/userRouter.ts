import { Router } from 'express';
import { requireUser } from '@middleware/requireUserMiddleware';
import { searchUsersHandler } from '@controller/userController';

const router = Router();

router.use(requireUser);
router.get('/', searchUsersHandler);

export default router;
