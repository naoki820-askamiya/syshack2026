FROM node:22-bookworm-slim

RUN apt-get update \
    && apt-get install --yes --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY index.html postcss.config.mjs vite.config.ts ./
COPY tsconfig.json tsconfig.server.json ./
COPY public ./public
COPY src ./src

EXPOSE 3000 5173

CMD ["npm", "run", "server:dev"]
