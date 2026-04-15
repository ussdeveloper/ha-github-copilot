ARG BUILD_FROM=ghcr.io/home-assistant/base:latest
FROM $BUILD_FROM

LABEL \
  io.hass.version="0.4.19" \
  io.hass.type="app" \
  io.hass.arch="aarch64|amd64"

WORKDIR /opt/copilot-brain

RUN apk add --no-cache nodejs npm

COPY app/package*.json ./app/
WORKDIR /opt/copilot-brain/app
RUN npm ci

COPY app ./
RUN npm run build

WORKDIR /opt/copilot-brain
COPY run.sh /run.sh
RUN chmod a+x /run.sh

CMD [ "/run.sh" ]
