FROM node:22-bookworm-slim AS build
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN npm install --global pnpm@10.17.1
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile=false && pnpm --filter @qnd-health/web test && pnpm --filter @qnd-health/web typecheck && pnpm --filter @qnd-health/web build

FROM nginx:1.27-alpine
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080
