FROM node:22-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/socket-server/package.json apps/socket-server/package.json
COPY functions/package.json functions/package.json
COPY shared/contracts/package.json shared/contracts/package.json
RUN npm ci

COPY apps/socket-server/tsconfig.json apps/socket-server/tsconfig.json
COPY apps/socket-server/src apps/socket-server/src
COPY shared/contracts/src shared/contracts/src
RUN npm run build:socket && npm prune --omit=dev

FROM node:22-bookworm-slim
ENV NODE_ENV=production SOCKET_HOST=0.0.0.0
WORKDIR /app
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/apps/socket-server/dist apps/socket-server/dist
COPY --from=build /app/apps/socket-server/package.json apps/socket-server/package.json
COPY --from=build /app/shared/contracts/package.json shared/contracts/package.json
EXPOSE 8080
CMD ["node", "apps/socket-server/dist/index.js"]
