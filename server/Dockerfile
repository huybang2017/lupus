FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json turbo.json ./
COPY server/package.json server/
COPY client/package.json client/
COPY storefront/package.json storefront/
RUN npm ci
COPY server server
COPY client client
RUN npm run build --workspace @dtc/admin && npm run build --workspace @dtc/lupus-backend

FROM node:22-alpine
RUN apk add --no-cache postgresql-client
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app /app
WORKDIR /app/server
EXPOSE 9001
CMD ["node", "dist/index.js"]
