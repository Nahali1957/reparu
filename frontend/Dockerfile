FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM caddy:2.8-alpine
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
RUN mkdir -p /data /config && chown -R 1000:1000 /data /config
ENV XDG_DATA_HOME=/data XDG_CONFIG_HOME=/config
USER 1000:1000
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s --retries=5 CMD wget -q --spider http://127.0.0.1:8080/ || exit 1
