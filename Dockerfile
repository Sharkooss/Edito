# ---- Stage 1: build frontend ----
FROM node:20-alpine AS web-build
WORKDIR /repo
COPY package.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/server/package.json apps/server/package.json
RUN npm install
COPY apps/web apps/web
RUN npm run build -w apps/web

# ---- Stage 2: build backend ----
FROM node:20-alpine AS server-build
WORKDIR /repo
COPY package.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/server/package.json apps/server/package.json
RUN npm install
COPY apps/server apps/server
RUN npm run build -w apps/server

# ---- Stage 3: runtime ----
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=server-build /repo/apps/server/package.json ./package.json
COPY --from=server-build /repo/node_modules ./node_modules
COPY --from=server-build /repo/apps/server/dist ./dist
COPY --from=web-build /repo/apps/web/dist ./web-dist

EXPOSE 3000
CMD ["node", "dist/index.js"]
