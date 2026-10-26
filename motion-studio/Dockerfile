FROM node:22-bookworm-slim AS frontend
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json vite.config.ts index.html ./
COPY frontend ./frontend
COPY public ./public
COPY scripts/fetch-samples.mjs ./scripts/fetch-samples.mjs
RUN node scripts/fetch-samples.mjs
RUN npm run build
FROM python:3.11-slim-bookworm AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg libgomp1 fonts-dejavu-core && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt
COPY backend ./backend
COPY provider-schema ./provider-schema
COPY --from=frontend /app/dist ./dist
RUN useradd -m -u 10001 motion && mkdir /data && chown motion:motion /data
USER motion
ENV DATA_DIR=/data
EXPOSE 8000
CMD ["uvicorn","backend.app.main:app","--host","0.0.0.0","--port","8000","--no-access-log"]
