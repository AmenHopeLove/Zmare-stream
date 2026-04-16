import express from 'express';
import path from 'path';
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server } from 'socket.io';
import authRoutes from './routes/auth.js';
import streamRoutes from './routes/stream.js';
import uploadRoutes from './routes/upload.js';
import { stopStream, startFileStream, getActiveStreams, setIO } from './services/streaming.js';
import { checkConfig } from './services/youtube.js';

import fs from 'fs';

dotenv.config();

// Ensure media directory exists
fs.mkdirSync('media', { recursive: true });

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
  }
});

setIO(io);

app.use(cors());
app.use(express.json());
app.use('/media', express.static('media'));
app.use(express.static('public'));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/stream', streamRoutes);
app.use('/api/upload', uploadRoutes);

app.post('/api/stream-legacy/stop', (req, res) => {
  const { streamId } = req.body;
  if (!streamId) {
    return res.status(400).json({ error: 'Missing streamId' });
  }
  const stopped = stopStream(streamId);
  res.json({ success: stopped, message: stopped ? 'Stream stopped' : 'Stream not found' });
});

app.get('/api/stream/active', (req, res) => {
  res.json({ streams: getActiveStreams() });
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'Zmare Stream Service Backend',
    config: checkConfig()
  });
});

// Serve React App for all other routes
app.use((req, res) => {
  res.sendFile(path.resolve('public', 'index.html'));
});

// WebSocket for real-time signaling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 4000;
httpServer.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});

// Analytics Pulse (Every 5 Minutes)
import { fetchLiveMetrics } from './services/analytics.js';
setInterval(async () => {
  const streams = getActiveStreams();
  for (const s of streams) {
    if (s.channelId && s.videoId) {
       await fetchLiveMetrics(s.channelId, s.videoId);
    }
  }
}, 5 * 60 * 1000);
