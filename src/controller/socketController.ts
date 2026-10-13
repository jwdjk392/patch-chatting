import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { logger } from '@lib/logger';
import { saveMessage, markMessagesRead } from '@repository/messageDB';
import { AppError } from '@lib/error';
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
                await socket.join(`user:${identity.userId}`);
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

        socket.on('message:send', async (payload: unknown, acknowledge: unknown) => {
            if (typeof acknowledge !== 'function') return;
            if (!identity || identity.expiresAt <= Date.now()) return close('UNAUTHENTICATED');
            const input = payload as { roomId?: unknown; text?: unknown } | null;
            if (!input || typeof input.roomId !== 'string' || !input.roomId.trim() || input.roomId.length > 100 ||
                typeof input.text !== 'string' || !input.text.trim() || input.text.length > 4000) {
                acknowledge({ ok: false, error: { code: 'INVALID_MESSAGE', message: '메시지를 1~4000자로 입력해 주세요.' } });
                return;
            }
            try {
                const { message, recipientIds } = await saveMessage(identity.userId, input.roomId, input.text.trim());
                // The transaction has committed before anything is delivered or acknowledged.
                io.to(recipientIds.map((id) => `user:${id}`)).emit('message:new', message);
                acknowledge({ ok: true, message });
            } catch (error) {
                if (!(error instanceof AppError)) {
                    logger.warn({ socketId: socket.id }, 'Message persistence failed');
                }
                acknowledge({ ok: false, error: {
                    code: error instanceof AppError ? error.code : 'MESSAGE_FAILED',
                    message: error instanceof AppError ? error.message : '메시지를 저장하지 못했습니다. 다시 시도해 주세요.',
                } });
            }
        });

        socket.on('message:read', async (payload: unknown, acknowledge: unknown) => {
            if (typeof acknowledge !== 'function') return;
            if (!identity || identity.expiresAt <= Date.now()) return close('UNAUTHENTICATED');
            const input = payload as { roomId?: unknown; messageId?: unknown } | null;
            if (!input || typeof input.roomId !== 'string' || !input.roomId.trim() || input.roomId.length > 100 ||
                typeof input.messageId !== 'number' || !Number.isSafeInteger(input.messageId) ||
                input.messageId < 1 || input.messageId > 2147483647) {
                acknowledge({ ok: false, error: { code: 'INVALID_MESSAGE', message: '유효한 메시지 ID가 필요합니다.' } });
                return;
            }
            try {
                const read = await markMessagesRead(identity.userId, input.roomId, input.messageId);
                io.to(`user:${identity.userId}`).emit('room:read', read);
                acknowledge({ ok: true, ...read });
            } catch (error) {
                if (!(error instanceof AppError)) logger.warn({ socketId: socket.id }, 'Read progress persistence failed');
                acknowledge({ ok: false, error: {
                    code: error instanceof AppError ? error.code : 'READ_FAILED',
                    message: error instanceof AppError ? error.message : '읽음 상태를 저장하지 못했습니다.',
                } });
            }
        });

        socket.on('disconnect', (reason) => {
            clearTimeout(expiryTimer);
            logger.info({ socketId: socket.id, reason }, 'Socket disconnected');
        });
    });

    return io;
}
