# Patch Chatting
A simple chat server built on Node.js + Express + Socket.IO + Prisma ORM (with postgres) 

## Important information
- 🤖 Contains AI-generated code
- 💣 Is not secure / stable enough for production use

## Installation
* Requirements: Node.JS Runtime, PostgreSQL
### Configuring .env
.env contains environment variables for the app. Such as
- `PORT`: Specifies port for HTTP server to listen.
- `DATABASE_URL`: PostgreSQL Database URL
- `SESSION_SECRET`: Secret for signing session
Copy the sample `.env.example` and rename it to `.env`.
### Configuring database
Run the following command. This will migrate the current table setup to your DB.
```shell
npx prisma db migrate
```
### Building
Run the following command. The build output is located in `dist`.
```shell
npm run build
```
### Executing
Run the following command.
```shell
npm run start
```
If running without compiling (development only), run the following command.
```shell
npm run dev
```

## For render
Node.js
### Env vars
```ini
DATABASE_URL=<YOUR DATABASE CONNECTION URL>
NODE_ENV=production
SESSION_SECRET=<YOUR SECRET>
SITE_NAME=<YOUR SITE NAME>
```

### Commands
Start
```shell
npm run db:migrate && npm start
```

Build
```shell
npm run deploy
```