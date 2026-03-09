FROM node:20-alpine
RUN apk add --no-cache python3 make g++
WORKDIR /app
RUN mkdir -p /data
COPY package*.json ./
RUN npm ci --production
COPY . .
EXPOSE 4061
CMD ["node", "server.js"]
