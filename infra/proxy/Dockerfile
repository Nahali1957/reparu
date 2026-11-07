FROM caddy:2.8-alpine
COPY Caddyfile /etc/caddy/Caddyfile
# exécution sans privilèges : port 5180 > 1024, répertoires de Caddy appartenant à l'utilisateur 1000
RUN mkdir -p /data /config && chown -R 1000:1000 /data /config
ENV XDG_DATA_HOME=/data XDG_CONFIG_HOME=/config
USER 1000:1000
HEALTHCHECK --interval=15s --timeout=3s --retries=5 CMD wget -q --spider --no-check-certificate https://127.0.0.1:5180/api/health || exit 1
