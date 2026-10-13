import express from 'express';
import { logger } from '@lib/logger';
import { pinoHttp } from 'pino-http';
import authRouter from '@router/authRouter'
import bodyParser from 'body-parser';

import 'dotenv/config';

const port = process.env.PORT ?? 80

const app = express();

app.use(pinoHttp({ logger }))

app.use(bodyParser.json())
app.use(bodyParser.urlencoded({ extended: true}))

app.use(express.static("./public"));

app.use("/api/auth", authRouter);

app.listen(port, () => logger.info("Server running @ " + port));