FROM node:24-bookworm-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
FROM node:24-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=builder /app/ ./
USER node
EXPOSE 3000
CMD ["sh", "-c", "npx prisma db migrate --db \"$DATABASE_URL\" && node dist/index.js"]
