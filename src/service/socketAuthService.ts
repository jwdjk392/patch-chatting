import { createHmac } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';

const issuer = 'patch-chatting';
const audience = 'socket.io';

function signingKey() {
    const secret = process.env.SESSION_SECRET;
    if (!secret) throw new Error('SESSION_SECRET must be set.');
    // Derive a dedicated key so socket tokens and session cookies use different keys.
    return createHmac('sha256', secret).update('patch-chatting:socket-jwt:v1').digest();
}

export async function createSocketToken(userId: string, sessionId: string) {
    const expiresAt = Math.floor(Date.now() / 1000) + 15 * 60;
    const token = await new SignJWT({ sid: sessionId })
        .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
        .setSubject(userId).setIssuer(issuer).setAudience(audience)
        .setIssuedAt().setExpirationTime(expiresAt).sign(signingKey());
    return { token, expiresAt: expiresAt * 1000 };
}

export async function verifySocketToken(token: unknown) {
    if (typeof token !== 'string' || token.length > 4096) throw new Error('Invalid token');
    const { payload } = await jwtVerify(token, signingKey(), {
        algorithms: ['HS256'], issuer, audience,
        requiredClaims: ['sub', 'sid', 'iat', 'exp'], maxTokenAge: '15m',
    });
    if (!payload.sub || typeof payload.sid !== 'string' || !payload.sid || !payload.exp) {
        throw new Error('Invalid token claims');
    }
    return { userId: payload.sub, sessionId: payload.sid, expiresAt: payload.exp * 1000 };
}
