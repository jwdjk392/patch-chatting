# patch-chatting

Set `DATABASE_URL` and a random `SESSION_SECRET` in `.env` (see `.env.example`).

Pages use EJS templates in `src/views`; `GET /` renders `index.ejs`.
Set `SITE_NAME` in `.env` to customize the service name (defaults to `Patch Chatting`).
Guests see a landing page with `/signup` and `/login` links. Signed-in users see
a chat layout with their name loaded from the database and a sign-out dropdown.
The chat layout is an empty UI; messaging is not implemented yet.
Socket.IO shares the Express HTTP server and port, using the default `/socket.io/`
endpoint. The signed-in chat page loads the bundled client and connects through
`src/public/js/chat.js`. A persistent status bar shows connection, authentication,
refresh, reconnection, and disconnected states, including on mobile screens.
Browser console logs cover connection attempts, authentication, refresh retries,
and failures. Server logs record connections, successful authentication/refresh,
and disconnections at `info`, and authentication failures at `warn`, using socket
IDs and reason codes without logging tokens or session IDs.
Server-side Socket.IO setup and event handlers live in `src/controller/socketController.ts`;
`src/index.ts` attaches the controller to the shared HTTP server.
After connecting, the client calls session-protected `GET /api/auth/get-token`
and sends the returned 15-minute JWT via the `authenticate` socket event.
The controller blocks other events until verification succeeds and stores the
verified account ID in `socket.data.userId`. JWTs use HS256 with a dedicated key
derived from `SESSION_SECRET`, and validate issuer, audience, and expiry.
The browser refreshes one minute before expiry, retrying transient failures every
five seconds. Both server and browser close expired connections. Connections that
do not authenticate within 15 seconds are closed. Refresh cannot change the
account or login session associated with a connection.
Connection/authentication failures show a modal with reconnect and login actions;
transport failures retry automatically up to five times and authenticate again.
Tokens stay in memory, and token responses are not cached. Logging out prevents
new token issuance; an already issued token remains valid until its 15-minute expiry.
Messaging events are not implemented yet.
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
