import { db } from "@prisma/db";

async function createAccountRecord(email: string, username: string, name: string, password: string) {
    try {
        const user = await db.orm.public.User.create({
            email, username, name, password
        })

        return user
    } catch (error) {
        if ((error as { sqlState?: string }).sqlState === "23505") {
            // Unique constraint violation
            
        }
    }
}

export { createAccountRecord }