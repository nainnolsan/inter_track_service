FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --include=dev

COPY . .
RUN npm run build
RUN npm prune --omit=dev

EXPOSE 3003

CMD ["npm", "start"]
