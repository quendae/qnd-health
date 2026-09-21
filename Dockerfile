FROM node:22-bookworm-slim

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV NODE_ENV=production

RUN npm install --global pnpm@10.17.1

WORKDIR /app
COPY . .

RUN pnpm install --frozen-lockfile=false \
  && pnpm --filter @qnd-health/api prisma:generate \
  && pnpm build \
  && pnpm smoke:runtime

EXPOSE 3001

CMD ["sh", "-c", "pnpm --filter @qnd-health/api prisma:push && node apps/api/dist/src/server.js"]
