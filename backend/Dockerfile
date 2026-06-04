# ---- build stage ----
FROM node:18-alpine AS build
WORKDIR /app

# install build deps
COPY package.json package-lock.json* tsconfig.json ./
# If you don't have package-lock.json CodeBuild/docker build will still run npm install.
RUN npm ci --silent || npm install --silent

# copy sources and build
COPY . .
RUN npm run build

# ---- runtime stage ----
FROM node:18-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
# create non-root user
RUN addgroup -S app && adduser -S app -G app

# copy package.json and install only production deps
COPY --from=build /app/package.json ./
COPY --from=build /app/package-lock.json* ./
RUN npm ci --only=production --silent || npm install --only=production --silent

# copy compiled JS
COPY --from=build /app/dist ./dist


# change ownership to non-root user and switch to it
RUN chown -R app:app /app
USER app

# configure runtime
EXPOSE 3000
ENV PORT=3000

CMD ["node", "--enable-source-maps", "./dist/server.js"]
