FROM node:20-alpine

WORKDIR /app

RUN mkdir -p /app/uploads

COPY package*.json ./
RUN npm install --production

COPY . .

EXPOSE 3001

CMD ["node", "server.js"]
