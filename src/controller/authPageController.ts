import type { Request, Response } from 'express';
import { signupPasswordRules } from '@lib/authValidation';

function renderAuthPage(res: Response, mode: 'login' | 'signup') {
    res.set('Cache-Control', 'no-store');
    res.render('auth', {
        mode,
        siteName: process.env.SITE_NAME?.trim() || 'Patch Chatting',
        passwordRules: signupPasswordRules,
    });
}

export function loginPageHandler(_req: Request, res: Response) {
    renderAuthPage(res, 'login');
}

export function signupPageHandler(_req: Request, res: Response) {
    renderAuthPage(res, 'signup');
}
