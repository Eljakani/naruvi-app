FROM docker:29-dind
RUN apk add --no-cache bash git openssl curl socat tar
# Root .dockerignore excludes credentials, local databases, uploads and build caches.
COPY . /snapshot
COPY deploy/sandbox/entrypoint.sh /usr/local/bin/naruvi-sandbox
ENTRYPOINT ["bash", "/usr/local/bin/naruvi-sandbox"]
