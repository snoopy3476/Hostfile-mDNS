
# configurable global args
ARG HMDNS_HOSTNAME=0.0.0.0
ARG HMDNS_PORT=5353
ARG HMDNS_TTL=3600
ARG HMDNS_PARENT_HOSTNAME=
ARG HMDNS_PARENT_PORT=5353
ARG HMDNS_PARENT_SYNC_INTERVAL=60

# global args
ARG HMDNS_HOME_DIR=/opt/hmdns





# builder
FROM docker.io/node:lts-alpine AS builder

RUN mkdir -p /deps
WORKDIR /deps
RUN npm install --omit=dev multicast-dns object-hash





# image
FROM docker.io/node:lts-alpine
LABEL org.opencontainers.image.authors="Kim Hwiwon <kim.hwiwon@outlook.com>"

ARG HMDNS_HOSTNAME
ARG HMDNS_PORT
ARG HMDNS_TTL
ARG HMDNS_PARENT_HOSTNAME
ARG HMDNS_PARENT_PORT
ARG HMDNS_PARENT_SYNC_INTERVAL

ARG HMDNS_HOME_DIR

ENV HMDNS_HOSTNAME=${HMDNS_HOSTNAME}
ENV HMDNS_PORT=${HMDNS_PORT}
ENV HMDNS_TTL=${HMDNS_TTL}
ENV HMDNS_PARENT_HOSTNAME=${HMDNS_PARENT_HOSTNAME}
ENV HMDNS_PARENT_PORT=${HMDNS_PARENT_PORT}
ENV HMDNS_PARENT_SYNC_INTERVAL=${HMDNS_PARENT_SYNC_INTERVAL}

ENV HMDNS_HOME_DIR=${HMDNS_HOME_DIR}

ENV PATH="$PATH:${HMDNS_HOME_DIR}/:${HMDNS_HOME_DIR}/node_modules/.bin/"

RUN mkdir -p "${HMDNS_HOME_DIR}"
COPY --from=builder /deps/. "${HMDNS_HOME_DIR}"/
COPY ./src/* "${HMDNS_HOME_DIR}"/
RUN ln -snf "${HMDNS_HOME_DIR}"/entrypoint /entrypoint
RUN ln -snf "${HMDNS_HOME_DIR}"/healthcheck /healthcheck
RUN ln -snf "${HMDNS_HOME_DIR}"/hostfile /hostfile
RUN mkdir -p /config && chown -R node:node /config


USER node
RUN touch /config/hosts
WORKDIR /config
ENTRYPOINT [ "/entrypoint" ]
