FROM node:10-alpine

WORKDIR /app
ADD . /app
ENV NODE_ENV production
RUN apk add --no-cache make gcc g++ python
RUN npm install
RUN apk del make gcc g++ python

EXPOSE 9000
EXPOSE 9001
EXPOSE 9002
ENTRYPOINT ["node", "service.js"]
