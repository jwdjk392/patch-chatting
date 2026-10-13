import { expect, test, vi, describe, beforeEach } from 'vitest';
import { createAccount } from "@service/authService";
import type { Request, Response } from 'express';
import { createAccountHandler } from './authController';

vi.mock("@service/authService", () => ({
    createAccount: vi.fn()
}))

describe("createAccountHandler", () => {
    let req: Request;
    let res: Response;

    beforeEach(() => {
        vi.clearAllMocks();
        req = {
            body: {
                email: "test@example.com",
                username: "testuser",
                name: "Test User",
                password: "password123"
            }
        } as Request;
        res = { redirect: vi.fn() } as unknown as Response;
    });

    test("Calls createAccount", async () => {
        await createAccountHandler(req, res);
        expect(createAccount).toHaveBeenCalledExactlyOnceWith("test@example.com", "testuser", "Test User", "password123");
    });
});