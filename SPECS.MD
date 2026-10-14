# patch-chatting
# Purpose of this file
This `SPECS.MD` file is generated purely by AI for AI assisted programming. This file is meant to be read by AI.
# Content
Set `DATABASE_URL` and a random `SESSION_SECRET` in `.env` (see `.env.example`).

Pages use EJS templates in `src/views`; `GET /` renders `index.ejs`.
Set `SITE_NAME` in `.env` to customize the service name (defaults to `Patch Chatting`).
Guests see a landing page with `/signup` and `/login` links. Signed-in users see
a chat layout with their name loaded from the database and a sign-out dropdown.
Select a room to load its latest 100 saved messages and send messages with the composer.
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
Authenticated clients send `message:send` with `{ roomId, text }` and an acknowledgement callback.
The server validates 1–4000 characters, derives the sender from the verified token,
and checks room membership inside the save transaction. After the transaction commits,
it emits `message:new` with the persisted `{ id, roomId, senderId, text, sentAt }`
to authenticated sockets belonging to the room members (including the sender's tabs).
The acknowledgement is `{ ok: true, message }` or `{ ok: false, error: { code, message } }`.
Offline recipients still have their messages saved. `GET /api/chat-rooms/:roomId/messages`
requires session authentication and membership and returns the latest 100 messages in
chronological order. The browser loads history on room selection and reconnection,
and deduplicates live events and acknowledgements by message ID.
Room cards show unread counts and open the conversation. Enter sends a message;
Shift+Enter inserts a newline, and switching rooms preserves unsent drafts.
`GET /api/chat-rooms` includes `lastReadMessageId` and `unreadCount` for the current
account. Unread counts count messages with IDs greater than the saved read ID,
excluding the account's own messages; a null read ID means nothing has been read.
When history has loaded and the selected room is visible and scrolled to the bottom,
the browser sends `message:read` with `{ roomId, messageId }`. The server verifies
membership and that the message belongs to that room, then conditionally advances
`RoomMember.lastReadMessageId`. Older or duplicate acknowledgements never lower it.
After commit, `room:read` sends `{ roomId, lastReadMessageId }` to that account's
connected tabs; the acknowledgement adds `ok: true`. Room counts refresh after
messages, saved read progress, reconnection, and returning to the tab.
Opening a room shows its latest 100 messages and marks through the latest displayed
message when at the bottom, including older history before that ID. Hidden tabs and
rooms scrolled away from the bottom do not advance read progress. Failed read saves
can be retried with the conversation's reload button. No schema migration is needed.
Live delivery uses Socket.IO's in-memory rooms on this server; it is best effort,
while the database is the durable record. Timed-out sends are not retried automatically:
check history before retrying, since the save may have succeeded.
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
