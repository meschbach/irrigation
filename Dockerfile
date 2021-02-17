FROM node:15.8.0-alpine3.13

WORKDIR /app
ADD . /app
ENV NODE_ENV production
RUN apk add --no-cache make gcc g++ python git && \
    npm install && \
    apk del make gcc g++ python

EXPOSE 9000
EXPOSE 9001
EXPOSE 9002
ENTRYPOINT ["node", "service.js"]
CMD ["--control-http-ip", "0.0.0.0"]
