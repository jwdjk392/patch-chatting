import { expect, test, vi } from 'vitest';
import type { Request, Response } from 'express';
import { getTokenHandler } from './authController';
import { createSocketToken } from '@service/socketAuthService';
vi.mock('@service/authService', () => ({}));
vi.mock('@service/socketAuthService', () => ({ createSocketToken: vi.fn() }));

test('denies guests and prevents caching', async () => {
    const res = { set: vi.fn(), json: vi.fn() } as unknown as Response;
    await expect(getTokenHandler({ session: {} } as Request, res)).rejects.toMatchObject({ statusCode: 401 });
    expect(res.set).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(res.json).not.toHaveBeenCalled();
});
test('issues tokens for the session identity only', async () => {
    vi.mocked(createSocketToken).mockResolvedValue({ token: 'jwt', expiresAt: 123 });
    const res = { set: vi.fn(), json: vi.fn() } as unknown as Response;
    await getTokenHandler({ session: { userId: 'user' }, sessionID: 'session', query: { userId: 'attacker' } } as unknown as Request, res);
    expect(createSocketToken).toHaveBeenCalledWith('user', 'session');
    expect(res.json).toHaveBeenCalledWith({ token: 'jwt', expiresAt: 123 });
});
