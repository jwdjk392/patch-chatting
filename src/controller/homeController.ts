import type { Request, Response } from 'express';
import { findAccountById } from '@repository/authDBHandler';

export async function homeHandler(req: Request, res: Response) {
    const user = req.session.userId ? await findAccountById(req.session.userId) : null;
    // Do not retain an authenticated identity after its account has been removed.
    if (!user) delete req.session.userId;

    res.set('Cache-Control', 'no-store');
    res.render('index', {
        siteName: process.env.SITE_NAME?.trim() || 'Patch Chatting',
        user: user ? { name: user.name?.trim() || user.username, username: user.username } : null,
    });
}
