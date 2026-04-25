# syntax=docker/dockerfile:1.4
FROM node:24-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

FROM base AS builder
COPY . /app
WORKDIR /app
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
RUN pnpm build

FROM base AS runner
WORKDIR /app
COPY --from=builder /app /app
# We keep everything for now as it's a monorepo and dependencies are linked
# In a highly optimized build we would use pnpm deploy, but this is safer for complex linking

EXPOSE 3000
CMD ["pnpm", "--filter", "idp-server", "start"]
