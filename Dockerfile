# syntax=docker/dockerfile:1
# AquaBlast — imagem de produção (Next.js 16, output: "standalone").
# Build:  docker build -t aquablast .
# Run:    ver docker-compose.yml (app + Postgres + scheduler).

# ---------- 1. dependências ----------
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---------- 2. build ----------
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production
# O `next build` avalia os módulos das rotas, e src/db/index.ts cria o pool lendo env() ao carregar.
# Nada conecta ao banco durante o build; estes valores existem só para o schema do env() passar
# e NÃO vão para a imagem final (o estágio runner não herda este ENV).
ENV DATABASE_URL=postgres://build:build@localhost:5432/build \
    SESSION_SECRET=build-only-placeholder-not-a-secret-0000000000 \
    APP_ENCRYPTION_KEY=build-only-placeholder-not-a-secret-0000000000 \
    CHECKOUT_WEBHOOK_TOKEN=build-only-placeholder \
    CRON_SECRET=build-only-placeholder
# A home, o robots.txt e o sitemap.xml são estáticos: o domínio entra no HTML no build, não na
# execução. Sem este ARG, canonical, og:image, sitemap e JSON-LD saem com http://localhost:3000.
# O docker-compose passa o APP_URL da stack; num `docker build` avulso use --build-arg APP_URL=...
ARG APP_URL=http://localhost:3000
ENV APP_URL=${APP_URL}
RUN npm run build

# ---------- 3. runtime ----------
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1

RUN addgroup -S -g 1001 nodejs && adduser -S -u 1001 -G nodejs nextjs

# server.js do standalone faz process.chdir(__dirname) = /app, então drizzle/ precisa
# ficar aqui ao lado: o bootstrap roda as migrações a partir de process.cwd()/drizzle.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/drizzle ./drizzle

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "server.js"]
