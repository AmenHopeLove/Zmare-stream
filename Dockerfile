FROM node:20-bullseye-slim

# Install FFmpeg
RUN apt-get update && \
    apt-get install -y ffmpeg ca-certificates && \
    rm -rf /var/lib/apt/lists/*

# Create working directory
WORKDIR /app

# Copy package manifests for npm workspaces
COPY package.json ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/

# Install root dependencies and workspaces
RUN npm install

# Copy source code
COPY backend/ backend/
COPY frontend/ frontend/

# Build React Frontend for Production
WORKDIR /app/frontend
RUN npm run build

# Copy built assets to backend public folder (so backend serves the UI)
WORKDIR /app
RUN mkdir -p /app/backend/public && cp -r frontend/dist/* /app/backend/public/

# Start the Backend Server
WORKDIR /app/backend
# HuggingFace requires port 7860
ENV PORT=7860
EXPOSE 7860

CMD ["npm", "start"]
