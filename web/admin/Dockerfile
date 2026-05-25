FROM node:22-alpine AS build

WORKDIR /app

RUN npm install -g pnpm@latest
RUN pnpm config set registry https://registry.npmmirror.com

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY web/admin/package.json ./web/admin/package.json

RUN pnpm install --filter=@trading-agent/web --ignore-scripts --frozen-lockfile

COPY web/admin ./web/admin

ENV NODE_OPTIONS=--max-old-space-size=4096
RUN pnpm --filter=@trading-agent/web exec nuxt build

FROM node:22-alpine

WORKDIR /app
COPY --from=build /app/web/admin/.output ./output

EXPOSE 3000
CMD ["node", "output/server/index.mjs"]
