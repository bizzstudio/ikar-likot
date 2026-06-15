# mnm-likut — Vite/React SPA, built to static files and served by nginx
FROM node:20-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# "/api" => same origin, nginx proxies it to the backend (overrides VITE_MAIN_SERVER_URL in .env).
ARG VITE_MAIN_SERVER_URL=/api
ENV VITE_MAIN_SERVER_URL=$VITE_MAIN_SERVER_URL
RUN npm run build

FROM nginx:alpine AS run
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
