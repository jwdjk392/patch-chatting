import express from 'express';
import { logger } from '@lib/logger';
import { pinoHttp } from 'pino-http';
import authRouter from '@router/authRouter'
import chatRoomRouter from '@router/chatRoomRouter';
import userRouter from '@router/userRouter';
import bodyParser from 'body-parser';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import path from 'path';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';

import 'dotenv/config';
import { apiErrorHandler } from '@middleware/apiErrorMiddleware';
import { homeHandler } from '@controller/homeController';
import { loginPageHandler, signupPageHandler } from '@controller/authPageController';
import { setupSocketController } from '@controller/socketController';

const port = process.env.PORT ?? 80

const app = express();
app.set("view engine", "ejs");
app.set("views", path.join(import.meta.dirname, "views"));
const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
    throw new Error("SESSION_SECRET must be set.");
}
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
    throw new Error("DATABASE_URL must be set.");
}
const PgSessionStore = connectPgSimple(session);

app.use(pinoHttp({ logger }))

app.use(bodyParser.json())
app.use(bodyParser.urlencoded({ extended: true}))

app.use(express.static(path.join(import.meta.dirname, "public"), { index: false }));

// Serve the installed validator version so browser and server use identical algorithms.
const validatorScript = createRequire(import.meta.url).resolve('validator/validator.min.js');
app.get('/js/vendor/validator.min.js', (_req, res) => res.sendFile(validatorScript));

app.use(session({
    store: new PgSessionStore({
        conString: databaseUrl,
        createTableIfMissing: true
    }),
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production'
    }
}));

app.get("/", homeHandler);
app.get("/login", loginPageHandler);
app.get("/signup", signupPageHandler);

app.use("/api/auth", authRouter);
app.use('/api/chat-rooms', chatRoomRouter);
app.use('/api/users', userRouter);
app.use("/api", apiErrorHandler);

const httpServer = createServer(app);
setupSocketController(httpServer);

httpServer.listen(port, () => logger.info("Server running @ " + port));
