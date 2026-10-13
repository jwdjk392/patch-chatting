import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { SignJWT } from 'jose';
import { createHmac } from 'node:crypto';
import { createSocketToken, verifySocketToken } from './socketAuthService';

beforeEach(() => {
    vi.stubEnv('SESSION_SECRET', 'test-secret');
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

test('issues a token for exactly 15 minutes and preserves identity', async () => {
    const { token, expiresAt } = await createSocketToken('user-1', 'session-1');
    expect(expiresAt - Date.now()).toBe(900_000);
    expect(await verifySocketToken(token)).toEqual({ userId: 'user-1', sessionId: 'session-1', expiresAt });
    vi.advanceTimersByTime(900_000);
    await expect(verifySocketToken(token)).rejects.toThrow();
});

test('rejects missing, malformed, tampered and wrong-purpose tokens', async () => {
    for (const token of [undefined, {}, 'invalid']) await expect(verifySocketToken(token)).rejects.toThrow();
    const { token } = await createSocketToken('user-1', 'session-1');
    const parts = token.split('.');
    parts[1] = Buffer.from(JSON.stringify({ sub: 'attacker' })).toString('base64url');
    await expect(verifySocketToken(parts.join('.'))).rejects.toThrow();
    const key = createHmac('sha256', 'test-secret').update('patch-chatting:socket-jwt:v1').digest();
    const wrongAudience = await new SignJWT({ sid: 'session-1' }).setProtectedHeader({ alg: 'HS256' })
        .setSubject('user-1').setIssuer('patch-chatting').setAudience('other').setIssuedAt().setExpirationTime('15m').sign(key);
    await expect(verifySocketToken(wrongAudience)).rejects.toThrow();
});
