FROM node:20-bookworm-slim AS builder

WORKDIR /app

# python3/make/g++: @cursor/sdk → sqlite3 needs node-gyp when prebuilds miss
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
       openssl ca-certificates \
       python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npm run build

FROM node:20-bookworm-slim AS runner

ARG BUILD_SHA=dev
WORKDIR /app

ENV NODE_ENV=production
ENV BUILD_SHA=${BUILD_SHA}

# Build tools for sqlite3 native compile during npm ci; python3 reused by PaddleOCR.
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
       openssl ca-certificates \
       python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev \
  && apt-get purge -y make g++ \
  && apt-get autoremove -y \
  && rm -rf /var/lib/apt/lists/*

COPY prisma ./prisma
COPY tsconfig.json ./
RUN npx prisma generate \
  && npm install --no-save ts-node typescript

COPY --from=builder /app/dist ./dist
COPY ocr ./ocr
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

# PaddleOCR + Tesseract (set BUILD_PADDLE_OCR=0 for a smaller image without Python/Paddle).
ARG BUILD_PADDLE_OCR=1
RUN chmod +x /usr/local/bin/docker-entrypoint.sh \
  && mkdir -p /app/uploads \
  && if [ "$BUILD_PADDLE_OCR" = "1" ]; then \
       apt-get update \
       && apt-get install -y --no-install-recommends \
            python3-pip python3-venv libgomp1 \
            libgl1 libglib2.0-0 libsm6 libxext6 libxrender1 libxcb1 \
       && python3 -m venv /opt/paddleocr \
       && /opt/paddleocr/bin/pip install --no-cache-dir -U pip \
       && /opt/paddleocr/bin/pip install --no-cache-dir -r /app/ocr/requirements-paddle.txt \
       && rm -rf /var/lib/apt/lists/*; \
     fi

ENV OCR_ENGINE=auto
ENV PADDLE_OCR_PYTHON=/opt/paddleocr/bin/python

EXPOSE 3001

ENTRYPOINT ["docker-entrypoint.sh"]
