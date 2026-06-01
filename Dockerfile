FROM swr.cn-north-4.myhuaweicloud.com/ddn-k8s/docker.io/library/node:20-alpine

WORKDIR /app
COPY package.json ./
COPY server ./server
COPY public ./public

ENV NODE_ENV=production
ENV PLAYER_PORT=8080
ENV ADMIN_PORT=18052

EXPOSE 8080 18052
CMD ["node", "server/index.js"]
