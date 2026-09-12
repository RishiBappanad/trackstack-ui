# Build context must be the REPO ROOT (trackstack-ui/), not app/ itself --
# this app imports the library's own source directly from ../src (see
# vite.config.ts's alias), so both directories need to be present at
# their real relative paths inside the build. Build with:
#   docker build -f app/Dockerfile .
# from the trackstack-ui repo root.
FROM node:22-slim AS build
WORKDIR /repo

# Root install is required, not optional: ../src's own imports (clsx,
# tailwind-merge, lucide-react) resolve via Node resolution rooted at
# ../src itself, which walks up into trackstack-ui's ROOT node_modules,
# never sideways into app/node_modules -- see vite.config.ts's comment
# on the alias for the full explanation (found the hard way, 2026-09-12).
COPY package.json package-lock.json ./
RUN npm ci

COPY app/package.json app/package-lock.json ./app/
RUN cd app && npm ci

COPY src/ ./src/
COPY app/ ./app/

ARG BASE_PATH=/
ARG TRACKSTACK_AUTH_URL=
ARG TODO_API_BASE=
ENV VITE_BASE_PATH=${BASE_PATH}
ENV VITE_TRACKSTACK_AUTH_URL=${TRACKSTACK_AUTH_URL}
ENV VITE_TODO_API_BASE=${TODO_API_BASE}
RUN cd app && npm run build

FROM node:22-slim
WORKDIR /app
RUN npm install -g serve@14.2.4
COPY --from=build /repo/app/dist ./dist

EXPOSE 8080
ENV PORT=8080
CMD ["sh", "-c", "serve -s dist -l ${PORT}"]
