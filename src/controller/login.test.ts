import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { Request, Response } from 'express';
import { login } from '@service/authService';
import { loginHandler } from './authController';

vi.mock('@service/authService', () => ({ createAccount: vi.fn(), login: vi.fn() }));

describe('loginHandler', () => {
    beforeEach(() => vi.resetAllMocks());

    function setup() {
        const session = {
            userId: undefined as string | undefined,
            regenerate: vi.fn((callback: (error?: Error) => void) => callback()),
            save: vi.fn((callback: (error?: Error) => void) => callback())
        };
        const req = { body: { email: 'test@example.com', password: 'password' }, session } as unknown as Request;
        const redirect = vi.fn();
        const res = { redirect } as unknown as Response;
        return { req, res, session, redirect };
    }

    test('regenerates the session and waits for saving before redirecting', async () => {
        const { req, res, session, redirect } = setup();
        vi.mocked(login).mockResolvedValue('user-1');
        let finishSave: (() => void) | undefined;
        session.regenerate.mockImplementation(callback => {
            expect(session.userId).toBeUndefined();
            callback();
        });
        session.save.mockImplementation(callback => {
            expect(session.regenerate).toHaveBeenCalledOnce();
            expect(session.userId).toBe('user-1');
            expect(redirect).not.toHaveBeenCalled();
            finishSave = callback;
        });
        const pending = loginHandler(req, res);
        await vi.waitFor(() => expect(finishSave).toBeDefined());
        finishSave!();
        await pending;
        expect(login).toHaveBeenCalledExactlyOnceWith('test@example.com', 'password');
        expect(redirect).toHaveBeenCalledExactlyOnceWith('/');
    });

    test('does not create a session on failed authentication', async () => {
        const { req, res, session, redirect } = setup();
        const error = new Error('Invalid credentials');
        vi.mocked(login).mockRejectedValue(error);
        await expect(loginHandler(req, res)).rejects.toBe(error);
        expect(session.regenerate).not.toHaveBeenCalled();
        expect(session.save).not.toHaveBeenCalled();
        expect(redirect).not.toHaveBeenCalled();
    });

    test.each(['regenerate', 'save'] as const)('propagates %s errors without redirecting', async method => {
        const { req, res, session, redirect } = setup();
        const error = new Error('Session store unavailable');
        vi.mocked(login).mockResolvedValue('user-1');
        session[method].mockImplementation(callback => callback(error));
        await expect(loginHandler(req, res)).rejects.toBe(error);
        expect(redirect).not.toHaveBeenCalled();
    });
});
