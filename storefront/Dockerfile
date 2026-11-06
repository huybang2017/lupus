FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY client/package.json client/
COPY storefront/package.json storefront/
RUN npm ci
COPY storefront storefront
ARG VITE_PUBLISHABLE_KEY
ARG VITE_DEFAULT_REGION=us
ARG VITE_API_URL=
ENV VITE_PUBLISHABLE_KEY=$VITE_PUBLISHABLE_KEY VITE_DEFAULT_REGION=$VITE_DEFAULT_REGION VITE_API_URL=$VITE_API_URL
RUN npm run build --workspace @dtc/lupus-storefront

FROM nginx:alpine
COPY storefront/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/storefront/dist /usr/share/nginx/html
