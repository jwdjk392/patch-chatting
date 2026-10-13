import type { Request, Response } from 'express';
import { createAccount, login } from '@service/authService';
import { createSocketToken } from '@service/socketAuthService';
import { AppError } from '@lib/error';

export async function getTokenHandler(req: Request, res: Response) {
    res.set('Cache-Control', 'no-store');
    if (!req.session.userId) {
        throw new AppError({ statusCode: 401, code: 'UNAUTHENTICATED', message: 'Please log in again.' });
    }
    res.json(await createSocketToken(req.session.userId, req.sessionID));
}

/**
 * Controller: Hashes user's password, and calls account creation function.
 * req.body.password
 * req.body.email
 * req.body.username
 * req.body.name
 * @param req Request
 * @param res Response
 */
async function createAccountHandler(req: Request, res: Response) {
    await createAccount(req.body.email, req.body.username, req.body.name, req.body.password);
    res.redirect("/");
}

async function loginHandler(req: Request, res: Response) {
    const userId = await login(req.body?.email, req.body?.password);

    await new Promise<void>((resolve, reject) => {
        req.session.regenerate(error => error ? reject(error) : resolve());
    });

    req.session.userId = userId;
    
    await new Promise<void>((resolve, reject) => {
        req.session.save(error => error ? reject(error) : resolve());
    });

    res.redirect("/");
}

async function logoutHandler(req: Request, res: Response) {
    await new Promise<void>((resolve, reject) => {
        req.session.destroy(error => error ? reject(error) : resolve());
    });

    res.clearCookie('connect.sid', { path: '/' });
    res.redirect("/");
}

export { createAccountHandler, loginHandler, logoutHandler }
