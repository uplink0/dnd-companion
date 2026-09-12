FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev \
    && npm install -g @openai/codex
COPY . .
RUN mkdir -p /data/codex && chmod 700 /data/codex
EXPOSE 3000
CMD ["npm", "start"]
