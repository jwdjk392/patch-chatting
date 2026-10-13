import { AppError, DbUniqueError } from "@lib/error";
import { createAccountRecord } from "@repository/authDBHandler"
import bcrypt from 'bcrypt';
import validator from 'validator';
async function createAccount(email: string, username: string, name: string, password: string) {
    if (!validator.isEmail(email)) {
        throw new AppError({
            statusCode: 400,
            code: "INVALID_EMAIL",
            message: "Email is not in correct form."
        })
    }

    if (!validator.isStrongPassword(password, {minLength: 8, minLowercase: 1, minUppercase: 1, minSymbols: 1})) {
        throw new AppError({
            statusCode: 400,
            code: "INVALID_PASSWORD",
            message: "Password is not strong enough."
        })
    }

    let hashedPassword = await bcrypt.hash(password, 10)
    try {
        await createAccountRecord(email, username, name, hashedPassword)
    } catch (error) {
        if (error instanceof DbUniqueError) {
            switch (error.field) {
                case "email":
                    throw new AppError({
                        statusCode: 409,
                        code: "EMAIL_ALREADY_REGISTERED",
                        message: "Email is already registered. Use other email."
                    })
                    break;
                case "username":
                    throw new AppError({
                        statusCode: 409,
                        code: "USERNAME_ALREADY_REGISTERED",
                        message: "Username is already taken. Use other username"
                    })
                    break;
                default:
                    throw new AppError({
                        statusCode: 409,
                        code: "DB_CONFLICT",
                        message: "Data conflicts with DB"
                    })
                    break;
            }
        } else {
            throw new AppError({
                cause: error
            })
        }
    }
}

export { createAccount }