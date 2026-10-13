# patch-chatting

Set `DATABASE_URL` and a random `SESSION_SECRET` in `.env` (see `.env.example`).

`POST /api/auth/login` accepts JSON or form fields `email` and `password`.
Successful authentication saves `userId` in an Express session and redirects to `/`.
Invalid input returns 400; incorrect credentials return 401.

`POST /api/auth/logout` destroys the session, clears the session cookie, and redirects to `/`.

Sessions are stored in PostgreSQL through `connect-pg-simple`, using `DATABASE_URL`.
The `session` table is created automatically with `createTableIfMissing: true`.
Production cookies require HTTPS;
configure Express `trust proxy` for your deployment when terminating TLS at a proxy.
