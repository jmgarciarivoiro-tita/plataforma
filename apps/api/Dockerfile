# Imagen de la API. Se construye desde la raíz del monorepo:
#   docker build -f apps/api/Dockerfile -t plataforma-api .
FROM node:26-alpine AS base
# Node 25+ ya no incluye corepack: se instala en versión fija y pnpm sale de "packageManager".
RUN npm install -g corepack@0.36.0 && corepack enable
WORKDIR /repo

FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile \
 && pnpm --filter "@plataforma/api..." --filter @plataforma/shell build \
 && pnpm --filter @plataforma/api deploy --prod /out

FROM node:26-alpine AS runtime
ENV NODE_ENV=production
ENV HOST=0.0.0.0
WORKDIR /app
COPY --from=build /out .
COPY --from=build /repo/apps/shell/dist ./shell
COPY --from=build /repo/registry ./registry
ENV SHELL_DIR=/app/shell REGISTRY_DIR=/app/registry
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:3000/health || exit 1
CMD ["node", "dist/server.js"]
