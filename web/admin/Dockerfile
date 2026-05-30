FROM node:22-alpine AS build
WORKDIR /app
RUN npm config set registry https://registry.npmmirror.com && \
    npm install -g pnpm@latest
COPY .npmrc .npmrc
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY web/admin/package.json ./web/admin/package.json
COPY shared/types/package.json ./shared/types/package.json
RUN pnpm install --filter=@trading-agent/web --ignore-scripts --frozen-lockfile
COPY shared/types ./shared/types
COPY web/admin ./web/admin
ENV NODE_OPTIONS=--max-old-space-size=4096
RUN pnpm --filter=@trading-agent/web exec nuxt build

FROM node:22-alpine
WORKDIR /app
COPY --from=build /app/web/admin/.output ./output
EXPOSE 3000
CMD ["node", "output/server/index.mjs"]
