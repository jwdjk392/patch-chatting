import type { Request, Response } from 'express';
import { createAccount } from '@service/authService';

/**
 * Controller: Hashes user's password, and calls account creation function.
 * req.body.password
 * req.body.email
 * req.body.username
 * req.body.name
 * @param req Request
 * @param res Response
 */
function createAccountHandler(req: Request, res: Response) {
    createAccount(req.body.email, req.body.username, req.body.name, req.body.password);
}

export { createAccountHandler }