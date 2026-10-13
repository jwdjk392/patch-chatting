import { db } from "@prisma/db";
import { DbUniqueError } from "@lib/error";

async function createAccountRecord(email: string, username: string, name: string, password: string) {
    try {
        const user = await db.orm.public.User.create({
            email, username, name, password
        })

        return user
    } catch (error) {
        //if ((error as { sqlState?: string }).sqlState === "23505") {
        if (error != null && typeof error == "object" && "sqlState" in error && error.sqlState == "23505") {
            let constraint = 
                "constraint" in error ? error.constraint: undefined;
            switch (constraint) {
                case "User_email_key":
                    throw new DbUniqueError("email", "EMAIL_EXISTS");
                    break;
                case "User_username_key":
                    throw new DbUniqueError("username", "USERNAME_EXISTS");
                    break;
                default:
                    break;
            }
        }
    }
}

async function findAccountByEmail(email: string) {
    return db.orm.public.User.where({ email }).select('id', 'password').first();
}

async function findAccountById(id: string) {
    return db.orm.public.User.where({ id }).select('id', 'name', 'username').first();
}

export { createAccountRecord, findAccountByEmail, findAccountById }
