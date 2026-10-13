import { describe, expect, test } from 'vitest';
import validator from 'validator';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { signupPasswordRules } from './authValidation';
import { validateAuth } from '../public/js/auth-validation.js';

// Exercise the actual browser distribution, not just its Node counterpart.
const browser = {} as { validator: typeof validator };
const scriptPath = createRequire(import.meta.url).resolve('validator/validator.min.js');
runInNewContext(readFileSync(scriptPath, 'utf8'), browser);
const account = { username: 'jamie', email: 'jamie@example.com', password: 'Password123!' };

describe('browser authentication validation', () => {
    test.each([
        'Password123!', 'Abcdef1 ', 'Abcdef1£', 'Abcdef1€', 'Abcdef1😀',
        'Ab1!', 'password123!', 'PASSWORD123!', 'Password!!!', 'Password123', '',
    ])('matches server signup strength rules for %j', password => {
        const errors = validateAuth({ ...account, password }, 'signup', browser.validator, signupPasswordRules);
        expect(!errors.password).toBe(validator.isStrongPassword(password, signupPasswordRules));
    });

    test.each([
        'jamie@example.com', 'user+tag@example.com', '사용자@example.com',
        'invalid', 'a@localhost', 'a..b@example.com', ' a@example.com ', '',
    ])('matches server email rules for %j', email => {
        const errors = validateAuth({ ...account, email }, 'login', browser.validator, signupPasswordRules);
        expect(!errors.email).toBe(validator.isEmail(email));
    });

    test('login accepts a nonempty password without requiring signup strength', () => {
        expect(validateAuth({ email: account.email, password: 'weak' }, 'login', browser.validator, signupPasswordRules)).toEqual({});
        expect(validateAuth({ email: account.email, password: '' }, 'login', browser.validator, signupPasswordRules)).toHaveProperty('password');
    });

    test('requires a username for the signup form', () => {
        expect(validateAuth({ ...account, username: '' }, 'signup', browser.validator, signupPasswordRules)).toHaveProperty('username');
        expect(validateAuth(account, 'signup', browser.validator, signupPasswordRules)).toEqual({});
    });
});
