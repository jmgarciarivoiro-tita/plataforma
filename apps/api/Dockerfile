# Imagen de la API. Se construye desde la raíz del monorepo:
#   docker build -f apps/api/Dockerfile -t plataforma-api .
FROM node:26-alpine AS base
RUN corepack enable
WORKDIR /repo

FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile \
 && pnpm --filter @plataforma/api build \
 && pnpm --filter @plataforma/api deploy --prod /out

FROM node:26-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out .
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:3000/health || exit 1
CMD ["node", "dist/server.js"]
