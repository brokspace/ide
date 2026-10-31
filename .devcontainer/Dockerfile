# Build environment for Brokspace IDE on Linux (browser and Electron apps).
FROM node:24-bookworm
RUN apt-get update \
 && apt-get install -y --no-install-recommends libxkbfile-dev libsecret-1-dev python3 build-essential git \
 && rm -rf /var/lib/apt/lists/*
ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1 PUPPETEER_SKIP_DOWNLOAD=1
WORKDIR /src
