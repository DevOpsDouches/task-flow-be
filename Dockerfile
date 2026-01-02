FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy application files
COPY src ./src

EXPOSE 3002

CMD ["npm", "start"]
