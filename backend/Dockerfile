FROM node:20-bookworm-slim AS builder

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
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

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY prisma ./prisma
COPY tsconfig.json ./
RUN npx prisma generate \
  && npm install --no-save ts-node typescript

COPY --from=builder /app/dist ./dist
COPY ocr ./ocr
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

# Optional PaddleOCR (keeps Tesseract). Set BUILD_PADDLE_OCR=1 when building the image.
ARG BUILD_PADDLE_OCR=0
RUN chmod +x /usr/local/bin/docker-entrypoint.sh \
  && mkdir -p /app/uploads \
  && if [ "$BUILD_PADDLE_OCR" = "1" ]; then \
       apt-get update \
       && apt-get install -y --no-install-recommends python3 python3-pip python3-venv libgomp1 \
       && python3 -m venv /opt/paddleocr \
       && /opt/paddleocr/bin/pip install --no-cache-dir -U pip \
       && /opt/paddleocr/bin/pip install --no-cache-dir -r /app/ocr/requirements-paddle.txt \
       && rm -rf /var/lib/apt/lists/*; \
     fi

ENV OCR_ENGINE=auto
ENV PADDLE_OCR_PYTHON=/opt/paddleocr/bin/python

EXPOSE 3001

ENTRYPOINT ["docker-entrypoint.sh"]
