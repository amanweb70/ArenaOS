FROM node:22-alpine
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json ./
COPY apps ./apps
COPY packages ./packages
COPY plugins ./plugins
RUN pnpm install --frozen-lockfile
ENV NODE_ENV=production
ENV PORT=4000
ENV ARENA_HOST=0.0.0.0
ENV ARENA_STORAGE_DIRECTORY=/data/runs
EXPOSE 4000
CMD ["pnpm", "start:api"]
