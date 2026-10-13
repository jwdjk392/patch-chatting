import { describe, vi, test, expect, beforeEach } from 'vitest'
import { createAccountRecord } from '@repository/authDBHandler'
import bcrypt from 'bcrypt';
import { AppError, DbUniqueError } from '@lib/error';
import { createAccount } from './authService'
vi.mock("@repository/authDBHandler", () => ({
    createAccountRecord: vi.fn()
}))

vi.mock("bcrypt", () => ({
    default: {
        hash: vi.fn()
    }
}))



describe("authService.ts", () => {
    beforeEach(() => {
        vi.resetAllMocks();
    })
    test("Calls createAccountRecord properly", () => {
        vi.mocked(bcrypt.hash).mockResolvedValue("hashed")
        createAccount("test@test.com", "testuser", "Test User", "Password123!");
        expect(createAccountRecord).toHaveBeenCalledExactlyOnceWith("test@test.com", "testuser", "Test User", "hashed");
    })

    test("Calls hash with password", () => {
        createAccount("test@test.com", "testuser", "Test User", "Password123!");
        expect(bcrypt.hash).toHaveBeenCalledExactlyOnceWith("Password123!", 10);
    })

    test("Returns error when email is invalid", () => {
        try {
            createAccount("absolutelynotemail", "testuser", "Test User", "Password123!");
            expect.fail("Expected createAccount to throw error");
        } catch (error) {
            expect(error).toBeInstanceOf(AppError);
            expect(error).toStrictEqual(new AppError({
                statusCode: 400,
                code: "INVALID_EMAIL",
                message: "Email is not in correct form."
            }))
        }
    })

    test("Returns error when password is not strong enough", () => {
        try {
            createAccount("test@test.com", "testuser", "Test User", "weak");
            expect.fail("Expected createAccount to throw error");
        } catch (error) {
            expect(error).toBeInstanceOf(AppError);
            expect(error).toStrictEqual(new AppError({
            statusCode: 400,
            code: "INVALID_PASSWORD",
            message: "Password is not strong enough."
            }))
        }
    })

    test("Returns email unique error", () => {
        vi.mocked(createAccountRecord).mockThrowOnce(new DbUniqueError("email", "EMAIL_EXISTS"))
        try {
            createAccount("test@test.com", "testuser", "Test User", "Password123!");
            expect.fail("Expected createAccount to throw error");
        } catch (error) {
            expect(error).toBeInstanceOf(AppError);
            expect(error).toStrictEqual(new AppError({
                statusCode: 409,
                code: "EMAIL_ALREADY_REGISTERED",
                message: "Email is already registered. Use other email."
            }))
        }
    })

    test("Returns username unique error", () => {
        vi.mocked(createAccountRecord).mockThrowOnce(new DbUniqueError("username", "USERNAME_EXISTS"))
        try {
            createAccount("test@test.com", "testuser", "Test User", "Password123!");
            expect.fail("Expected createAccount to throw error");
        } catch (error) {
            expect(error).toBeInstanceOf(AppError);
            expect(error).toStrictEqual(new AppError({
                statusCode: 409,
                code: "USERNAME_ALREADY_REGISTERED",
                message: "Username is already taken. Use other username"
            }))
        }
    })
})