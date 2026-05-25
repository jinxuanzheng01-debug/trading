FROM node:22-alpine AS build
WORKDIR /app
RUN npm config set registry https://registry.npmmirror.com && \
    npm install -g pnpm@latest
COPY .npmrc .npmrc
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY api/business/package.json ./api/business/package.json
RUN pnpm install --filter=@trading-agent/api --frozen-lockfile
COPY api/business ./api/business
RUN pnpm --filter=@trading-agent/api exec tsc

FROM node:22-alpine
WORKDIR /app
RUN npm config set registry https://registry.npmmirror.com && \
    npm install -g pnpm@latest
COPY .npmrc .npmrc
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY api/business/package.json ./api/business/package.json
RUN pnpm install --filter=@trading-agent/api --prod --frozen-lockfile && \
    rm -rf /root/.local/share/pnpm /root/.cache
COPY --from=build /app/api/business/dist ./api/business/dist
EXPOSE 4000
CMD ["node", "api/business/dist/server.js"]
