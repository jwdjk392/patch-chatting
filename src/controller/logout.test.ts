import { describe, expect, test, vi } from 'vitest';
import type { Request, Response } from 'express';
import { logoutHandler } from './authController';

vi.mock('@service/authService', () => ({ createAccount: vi.fn(), login: vi.fn() }));

describe('logoutHandler', () => {
    function setup() {
        const destroy = vi.fn<(callback: (error?: Error) => void) => void>();
        const req = { session: { destroy } } as unknown as Request;
        const clearCookie = vi.fn();
        const redirect = vi.fn();
        const res = { clearCookie, redirect } as unknown as Response;
        return { req, res, destroy, clearCookie, redirect };
    }

    test('waits for session destruction before clearing the cookie and redirecting', async () => {
        const { req, res, destroy, clearCookie, redirect } = setup();
        const pending = logoutHandler(req, res);
        expect(destroy).toHaveBeenCalledOnce();
        expect(clearCookie).not.toHaveBeenCalled();
        expect(redirect).not.toHaveBeenCalled();

        destroy.mock.calls[0]![0]();
        await pending;
        expect(clearCookie).toHaveBeenCalledExactlyOnceWith('connect.sid', { path: '/' });
        expect(redirect).toHaveBeenCalledExactlyOnceWith('/');
    });

    test('propagates store failures without reporting a successful logout', async () => {
        const { req, res, destroy, clearCookie, redirect } = setup();
        const error = new Error('Session store unavailable');
        destroy.mockImplementation(callback => callback(error));

        await expect(logoutHandler(req, res)).rejects.toBe(error);
        expect(clearCookie).not.toHaveBeenCalled();
        expect(redirect).not.toHaveBeenCalled();
    });

    test('also succeeds for an unauthenticated session', async () => {
        const { req, res, destroy, redirect } = setup();
        destroy.mockImplementation(callback => callback());

        await logoutHandler(req, res);
        expect(redirect).toHaveBeenCalledExactlyOnceWith('/');
    });
});
