FROM node:13-alpine

WORKDIR /app
ADD . /app
ENV NODE_ENV production
RUN apk add --no-cache make gcc g++ python && \
    npm install && \
    apk del make gcc g++ python

EXPOSE 9000
EXPOSE 9001
EXPOSE 9002
ENTRYPOINT ["node", "service.js"]
CMD ["--control-http-ip", "0.0.0.0"]
