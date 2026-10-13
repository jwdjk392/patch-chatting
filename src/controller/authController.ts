import type { Request, Response } from 'express';
import { createAccount } from '@service/authService';
import bcrypt from 'bcrypt';
import { logger } from '@lib/logger';

const saltRounds = 10

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
    try {
        createAccount(req.body.email, req.body.username, req.body.name, req.body.password);
    } catch (e) {
        logger.error({"error": e}, "Error while account creation");
        res.status(500).send("Internal Server Error while account creation");
    }
}

export { createAccountHandler }