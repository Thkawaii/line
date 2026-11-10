FROM node:22-alpine
WORKDIR /app

RUN apk add --no-cache tzdata
ENV TZ=Asia/Bangkok

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

EXPOSE 4007
CMD ["node", "src/index.js"]
