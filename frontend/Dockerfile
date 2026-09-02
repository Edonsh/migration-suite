# frontend/Dockerfile
FROM node:18-alpine

WORKDIR /app

# Install project dependencies
COPY package*.json ./
RUN npm install

# Copy frontend source code
COPY . .

# Expose Vite dev server port
EXPOSE 5173

# Run Vite with host binding so it's accessible outside the container
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]