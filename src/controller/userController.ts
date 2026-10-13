import type { Request, Response } from 'express';
import { searchUsers } from '@repository/userDB';
import { AppError } from '@lib/error';

export async function searchUsersHandler(req: Request, res: Response) {
    const query = req.query.q;
    if (typeof query !== 'string' || query.trim().length < 2 || query.trim().length > 100) {
        throw new AppError({ statusCode: 400, code: 'INVALID_QUERY', message: '검색어를 2~100자로 입력해 주세요.' });
    }
    res.json({ users: await searchUsers(req.session.userId!, query.trim()) });
}
