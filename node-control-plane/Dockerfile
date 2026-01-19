# Stage 1: Build the React Frontend
FROM node:18-alpine AS frontend-builder
WORKDIR /app/dashboard/web-interface
# Copy frontend package files
COPY dashboard/web-interface/package*.json ./
RUN npm install
# Copy frontend source
COPY dashboard/web-interface .
# Build (output to ../public)
RUN npm run build

# Stage 2: Production Node.js Server
FROM node:18-alpine
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install --production

# Copy backend code
COPY . .
# Copy built frontend assets from Stage 1 to dashboard/public
COPY --from=frontend-builder /app/dashboard/public ./dashboard/public

# Expose ports (3000 for Dashboard, 50051 for gRPC if needed)
EXPOSE 3000
EXPOSE 50051

# Start the bot
CMD ["npm", "start"]
