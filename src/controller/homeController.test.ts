import { afterEach, describe, expect, test, vi } from 'vitest';
import express from 'express';
import type { Request, Response } from 'express';
import { fileURLToPath } from 'node:url';
import { homeHandler } from './homeController';
import { findAccountById } from '@repository/authDBHandler';
import { listChatRooms } from '@repository/chatRoomDB';

vi.mock('@repository/authDBHandler', () => ({ findAccountById: vi.fn() }));
vi.mock('@repository/chatRoomDB', () => ({ listChatRooms: vi.fn() }));

const app = express();
app.set('view engine', 'ejs');
app.set('views', fileURLToPath(new URL('../views', import.meta.url)));

async function renderHome(userId?: string) {
    const req = { session: userId ? { userId } : {} } as Request;
    const set = vi.fn();
    let rendered: Promise<string> | undefined;
    const res = {
        set,
        render(view: string, locals: object) {
            rendered = new Promise<string>((resolve, reject) => {
                app.render(view, locals, (error, html) => error ? reject(error) : resolve(html));
            });
        },
    } as unknown as Response;
    await homeHandler(req, res);
    return { html: await rendered!, req, set };
}

afterEach(() => { vi.resetAllMocks(); vi.unstubAllEnvs(); });

describe('home page', () => {
    test('renders the client room-list shell without fetching rooms', async () => {
        vi.mocked(findAccountById).mockResolvedValue({ id: 'user-1', name: 'Alice', username: 'alice' });
        const { html } = await renderHome('user-1');
        expect(listChatRooms).not.toHaveBeenCalled();
        expect(html).toContain('id="room-list"');
        expect(html).toContain('data-current-user-id="user-1"');
        expect(html).toContain('src="/js/chat-rooms.js"');
    });

    test('escapes environment and account values in the HTML', async () => {
        vi.stubEnv('SITE_NAME', '<script>site</script>');
        vi.mocked(findAccountById).mockResolvedValue({ id: 'user-1', name: '<script>name</script>', username: '<script>handle</script>' });
        const { html } = await renderHome('user-1');
        expect(html).not.toContain('<script>');
        expect(html).toContain('&lt;script&gt;site&lt;/script&gt;');
        expect(html).toContain('&lt;script&gt;name&lt;/script&gt;');
        expect(html).toContain('&lt;script&gt;handle&lt;/script&gt;');
    });

    test('shows the guest page and removes stale identity for a missing account', async () => {
        vi.mocked(findAccountById).mockResolvedValue(null);
        const { html, req } = await renderHome('deleted-user');
        expect(req.session.userId).toBeUndefined();
        expect(html).toContain('href="/login"');
        expect(html).not.toContain('account-menu');
    });

    test('propagates database failures instead of rendering an authenticated page', async () => {
        const error = new Error('Database unavailable');
        vi.mocked(findAccountById).mockRejectedValue(error);
        await expect(renderHome('user-1')).rejects.toBe(error);
    });
});
