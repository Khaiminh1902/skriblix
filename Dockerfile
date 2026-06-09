# syntax=docker/dockerfile:1

FROM node:20-alpine AS base
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=base /app/.next ./.next
COPY --from=base /app/public ./public
COPY --from=base /app/server.js ./server.js
COPY --from=base /app/next.config.ts ./next.config.ts
COPY --from=base /app/next-env.d.ts ./next-env.d.ts
COPY --from=base /app/postcss.config.mjs ./postcss.config.mjs
COPY --from=base /app/app ./app

EXPOSE 3000

CMD ["npm", "start"]
