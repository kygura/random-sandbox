FROM oven/bun:1.3
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --production --frozen-lockfile
COPY src ./src
ENV HOST=0.0.0.0 PORT=7878 ATLAS_DB=/data/atlas.sqlite
VOLUME /data
EXPOSE 7878
CMD ["bun", "run", "src/server.ts"]
