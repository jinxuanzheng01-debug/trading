FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable pnpm
RUN pnpm config set registry https://registry.npmmirror.com
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY services/agent/package.json ./services/agent/package.json
RUN pnpm install --filter=@trading-agent/agent --frozen-lockfile
COPY services/agent ./services/agent
RUN pnpm --filter=@trading-agent/agent exec tsc

FROM node:22-alpine
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY services/agent/package.json ./services/agent/package.json
RUN corepack enable pnpm && \
    pnpm config set registry https://registry.npmmirror.com && \
    pnpm install --filter=@trading-agent/agent --prod --frozen-lockfile && \
    rm -rf /root/.local/share/pnpm /root/.cache
COPY --from=build /app/services/agent/dist ./services/agent/dist
EXPOSE 4001
CMD ["node", "services/agent/dist/index.js"]
