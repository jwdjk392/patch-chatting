# patch-chatting

Set `DATABASE_URL` and a random `SESSION_SECRET` in `.env` (see `.env.example`).

Pages use EJS templates in `src/views`; `GET /` renders `index.ejs`.
Set `SITE_NAME` in `.env` to customize the service name (defaults to `Patch Chatting`).
Guests see a landing page with `/signup` and `/login` links. Signed-in users see
a chat layout with their name loaded from the database and a sign-out dropdown.
The chat layout is an empty UI; messaging is not implemented yet.
`GET /login` and `GET /signup` render forms that post to `/api/auth/login` and
`/api/auth/create-account`. Browser validation uses the installed `validator` library
and the server's shared signup password rules: at least eight characters with a
lowercase letter, uppercase letter, number, and symbol. Login only requires a
valid email and a nonempty password. API errors appear in the form; successful
submissions follow the API redirect to `/`. Signing up does not automatically log in.
Static assets belong in `src/public`. Run `npm run dev` for development;
`npm run build` compiles the server and copies assets and templates into `dist`.

`POST /api/auth/login` accepts JSON or form fields `email` and `password`.
Successful authentication saves `userId` in an Express session and redirects to `/`.
Invalid input returns 400; incorrect credentials return 401.

`POST /api/auth/logout` destroys the session, clears the session cookie, and redirects to `/`.

Sessions are stored in PostgreSQL through `connect-pg-simple`, using `DATABASE_URL`.
The `session` table is created automatically with `createTableIfMissing: true`.
Production cookies require HTTPS;
configure Express `trust proxy` for your deployment when terminating TLS at a proxy.
