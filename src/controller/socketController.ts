import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { logger } from '@lib/logger';
import { verifySocketToken } from '@service/socketAuthService';

export function setupSocketController(httpServer: HttpServer) {
    const io = new Server(httpServer);

    io.on('connection', (socket) => {
        logger.info({ socketId: socket.id }, 'Socket connected; awaiting authentication');
        let identity: Awaited<ReturnType<typeof verifySocketToken>> | undefined;
        const close = (code: string) => {
            logger.warn({ socketId: socket.id, code }, 'Closing socket after authentication failure');
            socket.emit('auth:error', { code });
            socket.disconnect(true);
        };
        let expiryTimer = setTimeout(() => close('AUTH_TIMEOUT'), 15_000);

        // Only authentication is allowed until the connection is trusted.
        socket.use(([event], next) => {
            if (identity && identity.expiresAt <= Date.now()) {
                close('TOKEN_EXPIRED');
                return;
            }
            if (event !== 'authenticate' && !identity) {
                close('UNAUTHENTICATED');
                return;
            }
            next();
        });

        socket.on('authenticate', async (token: unknown, acknowledge: unknown) => {
            if (typeof acknowledge !== 'function') return close('INVALID_AUTH');
            try {
                const verified = await verifySocketToken(token);
                if (!socket.connected) return;
                if (identity && (identity.expiresAt <= Date.now() ||
                    identity.userId !== verified.userId || identity.sessionId !== verified.sessionId)) {
                    return close('INVALID_AUTH');
                }
                // Concurrent refreshes must never shorten an already accepted token's lifetime.
                const refreshing = Boolean(identity);
                if (!identity || verified.expiresAt >= identity.expiresAt) identity = verified;
                socket.data.userId = identity.userId;
                clearTimeout(expiryTimer);
                expiryTimer = setTimeout(() => close('TOKEN_EXPIRED'), identity.expiresAt - Date.now());
                acknowledge({ ok: true, expiresAt: identity.expiresAt, serverTime: Date.now() });
                logger.info({ socketId: socket.id, expiresAt: identity.expiresAt },
                    refreshing ? 'Socket authentication refreshed' : 'Socket authenticated');
            } catch {
                acknowledge({ ok: false });
                close('INVALID_TOKEN');
            }
        });

        socket.on('disconnect', (reason) => {
            clearTimeout(expiryTimer);
            logger.info({ socketId: socket.id, reason }, 'Socket disconnected');
        });
    });

    return io;
}
