import { beforeEach, describe, expect, test, vi } from 'vitest';
import bcrypt from 'bcrypt';
import { findAccountByEmail } from '@repository/authDBHandler';
import { login } from './authService';

vi.mock('@repository/authDBHandler', () => ({
    createAccountRecord: vi.fn(),
    findAccountByEmail: vi.fn()
}));
vi.mock('bcrypt', () => ({ default: { compare: vi.fn() } }));

describe('login', () => {
    beforeEach(() => vi.resetAllMocks());

    test('verifies the stored hash and returns only the user ID', async () => {
        vi.mocked(findAccountByEmail).mockResolvedValue({ id: 'user-1', password: 'hashed' });
        vi.mocked(bcrypt.compare).mockImplementation(async () => true);
        await expect(login('test@example.com', 'password')).resolves.toBe('user-1');
        expect(findAccountByEmail).toHaveBeenCalledExactlyOnceWith('test@example.com');
        expect(bcrypt.compare).toHaveBeenCalledExactlyOnceWith('password', 'hashed');
    });

    test.each([undefined, null, 123, {}, 'invalid'])('rejects invalid email %j', async email => {
        await expect(login(email, 'password')).rejects.toMatchObject({ statusCode: 400, code: 'INVALID_EMAIL' });
        expect(findAccountByEmail).not.toHaveBeenCalled();
    });

    test.each([undefined, null, 123, {}, ''])('rejects invalid password %j', async password => {
        await expect(login('test@example.com', password)).rejects.toMatchObject({ statusCode: 400, code: 'INVALID_PASSWORD' });
        expect(findAccountByEmail).not.toHaveBeenCalled();
    });

    test.each([null, { id: 'user-1', password: 'hashed' }])('rejects unknown users and wrong passwords identically', async user => {
        vi.mocked(findAccountByEmail).mockResolvedValue(user);
        vi.mocked(bcrypt.compare).mockImplementation(async () => false);
        await expect(login('test@example.com', 'wrong')).rejects.toMatchObject({ statusCode: 401, code: 'INVALID_CREDENTIALS' });
    });

    test('propagates database failures', async () => {
        const error = new Error('Database unavailable');
        vi.mocked(findAccountByEmail).mockRejectedValue(error);
        await expect(login('test@example.com', 'password')).rejects.toBe(error);
    });
});
