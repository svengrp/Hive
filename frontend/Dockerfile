# Stage 1 — Build
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
ARG REACT_APP_API_URL
ENV REACT_APP_API_URL=$REACT_APP_API_URL
ARG REACT_APP_CARTO_API_KEY
ENV REACT_APP_CARTO_API_KEY=$REACT_APP_CARTO_API_KEY
RUN npm run build
 
# Stage 2 — Servir avec Nginx
FROM nginx:alpine
COPY --from=builder /app/build /usr/share/nginx/html
# Modèle : ${BACKEND_ORIGIN} est remplacé au démarrage (conf.d/default.conf généré)
COPY nginx.conf /etc/nginx/templates/default.conf.template
# Adresse interne du backend (nom du conteneur Docker), modifiable au lancement
ENV BACKEND_ORIGIN=http://hive_backend:5050
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]