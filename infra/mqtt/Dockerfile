FROM eclipse-mosquitto:2.0.20
RUN apk add --no-cache openssl
COPY mosquitto.conf /mosquitto/config/mosquitto.conf
COPY entrypoint.sh /entrypoint-reparu.sh
RUN chmod +x /entrypoint-reparu.sh
ENTRYPOINT ["/entrypoint-reparu.sh"]
CMD ["/usr/sbin/mosquitto", "-c", "/mosquitto/config/mosquitto.conf"]
