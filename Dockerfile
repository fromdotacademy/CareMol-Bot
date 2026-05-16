FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# VITE_ vars must be present at build time so Vite can embed them in the JS bundle
ARG VITE_GOOGLE_MAPS_API_KEY
ARG VITE_CAREMOL_PHONE
ENV VITE_GOOGLE_MAPS_API_KEY=$VITE_GOOGLE_MAPS_API_KEY
ENV VITE_CAREMOL_PHONE=$VITE_CAREMOL_PHONE

RUN npm run build

ENV NODE_ENV=production
EXPOSE 3000

CMD ["npx", "tsx", "server.ts"]
