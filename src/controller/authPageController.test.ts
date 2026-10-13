import { afterEach, describe, expect, test, vi } from 'vitest';
import express from 'express';
import type { Request, Response } from 'express';
import { fileURLToPath } from 'node:url';
import { loginPageHandler, signupPageHandler } from './authPageController';

const app = express();
app.set('view engine', 'ejs');
app.set('views', fileURLToPath(new URL('../views', import.meta.url)));

function renderPage(handler: typeof loginPageHandler) {
    return new Promise<string>((resolve, reject) => {
        const res = {
            set: vi.fn(),
            render(view: string, locals: object) {
                app.render(view, locals, (error, html) => error ? reject(error) : resolve(html));
            },
        } as unknown as Response;
        handler({} as Request, res);
    });
}

afterEach(() => vi.unstubAllEnvs());

describe('authentication pages', () => {
    test('login posts email and password to the login API without signup strength constraints', async () => {
        const html = await renderPage(loginPageHandler);
        expect(html).toContain('method="post" action="/api/auth/login"');
        expect(html).toContain('name="email"');
        expect(html).toContain('name="password"');
        expect(html).toContain('autocomplete="current-password"');
        expect(html).not.toContain('minlength=');
        expect(html).not.toContain('name="username"');
        expect(html).toContain('href="/signup"');
        expect(html).toContain('src="/js/vendor/validator.min.js"');
        expect(html).toContain('src="/js/auth.js"');
    });

    test('signup posts the account fields to the existing account creation API', async () => {
        const html = await renderPage(signupPageHandler);
        expect(html).toContain('method="post" action="/api/auth/create-account"');
        for (const field of ['name', 'username', 'email', 'password']) {
            expect(html).toContain(`name="${field}"`);
        }
        expect(html).toContain('autocomplete="new-password"');
        expect(html).toContain('minlength="8"');
        expect(html).toContain('password-strength');
        expect(html).toContain('&#34;minNumbers&#34;:1');
        expect(html).toContain('href="/login"');
    });

    test('escapes the dynamically configured service name on both pages', async () => {
        vi.stubEnv('SITE_NAME', '<script>alert(1)</script>');
        for (const handler of [loginPageHandler, signupPageHandler]) {
            const html = await renderPage(handler);
            expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
            expect(html).not.toContain('<script>alert(1)</script>');
        }
    });
});
