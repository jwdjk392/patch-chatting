import { or } from '@prisma/orm-postgres/orm-client';
import { db } from '@prisma/db';

export async function searchUsers(userId: string, query: string) {
    const pattern = `%${query.replace(/[\\%_]/g, '\\$&')}%`;
    return db.orm.public.User
        .where((user) => user.id.neq(userId))
        .where((user) => or(user.email.ilike(pattern), user.username.ilike(pattern), user.name.ilike(pattern)))
        .select('id', 'email', 'username', 'name')
        .orderBy((user) => user.username.asc()).limit(20).all();
}

