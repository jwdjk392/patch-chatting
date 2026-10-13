import express from 'express';
import { logger } from '@lib/logger';
import { pinoHttp } from 'pino-http';
import authRouter from '@router/authRouter'
import bodyParser from 'body-parser';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import path from 'path';

import 'dotenv/config';
import { apiErrorHandler } from '@controller/apiErrorMiddleware';

const port = process.env.PORT ?? 80

const app = express();
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

app.use(express.static(path.join(import.meta.dirname, "public")));

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

app.use("/api/auth", authRouter);
app.use("/api", apiErrorHandler);

app.listen(port, () => logger.info("Server running @ " + port));
