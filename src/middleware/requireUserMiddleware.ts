import type { RequestHandler } from 'express';
import { findAccountById } from '@repository/authDBHandler';
import { AppError } from '@lib/error';

export const requireUser: RequestHandler = async (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (!req.session.userId || !await findAccountById(req.session.userId)) {
        delete req.session.userId;
        throw new AppError({ statusCode: 401, code: 'UNAUTHENTICATED', message: '다시 로그인해 주세요.' });
    }
    next();
};
