import express from 'express';
import { logger } from './lib/logger.js';
import { pinoHttp } from 'pino-http';

import 'dotenv/config';

const port = process.env.PORT ?? 80

const app = express();

app.use(pinoHttp({ logger }))

app.use(express.static("./public"));

app.listen(port, () => logger.info("Server running @ " + port));