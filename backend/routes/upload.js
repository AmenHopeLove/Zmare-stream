import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import axios from 'axios';
import { fileURLToPath } from 'url';
import { getIO } from '../services/streaming.js';
import youtubedl from 'youtube-dl-exec';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const router = express.Router();

const resolveCloudLink = (url) => {
  if (!url) return '';
  
  // Google Drive
  if (url.includes('drive.google.com')) {
    const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/) || url.match(/id=([a-zA-Z0-9_-]+)/);
    if (match && match[1]) {
      return { type: 'gdrive', id: match[1] };
    }
  }
  
  // Dropbox
  if (url.includes('dropbox.com')) {
    return { 
      type: 'direct', 
      url: url.replace('www.dropbox.com', 'dl.dropboxusercontent.com').replace('?dl=0', '').replace('?dl=1', '') 
    };
  }
  
  return { type: 'direct', url };
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'media/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 100 * 1024 * 1024 * 1024 }, // 100GB limit for 4K VODs
  fileFilter: (req, file, cb) => {
    const extMatch = /\.(mp4|mkv|mov|avi|webm)$/i.test(file.originalname);
    const mimeMatch = file.mimetype.startsWith('video/') || file.mimetype === 'application/octet-stream';
    if (extMatch || mimeMatch) {
      return cb(null, true);
    }
    cb(new Error('Invalid video file'));
  }
});

router.post('/video', upload.single('video'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  res.json({ 
    message: 'Video uploaded successfully', 
    filename: req.file.filename,
    path: req.file.path
  });
});

router.post('/fetch-cloud', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'No URL provided' });

  const cloudInfo = resolveCloudLink(url);
  const io = getIO();
  
  const filename = `cloud-${Date.now()}.mp4`;
  const destPath = path.join('media', filename);

  try {
    let downloadUrl = cloudInfo.url;
    let axiosOptions = {
      method: 'GET',
      responseType: 'stream',
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    };

    if (cloudInfo.type === 'gdrive') {
      const fileId = cloudInfo.id;
      const initialUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
      
      // Step 1: Preliminary request to check for the "confirm" token (virus scan warning)
      const checkResponse = await axios.get(initialUrl, { 
        headers: axiosOptions.headers,
        timeout: 10000 
      });

      if (typeof checkResponse.data === 'string' && checkResponse.data.includes('confirm=')) {
        const confirmMatch = checkResponse.data.match(/confirm=([a-zA-Z0-9_-]+)/);
        if (confirmMatch) {
          downloadUrl = `https://drive.google.com/uc?export=download&confirm=${confirmMatch[1]}&id=${fileId}`;
        } else {
          downloadUrl = initialUrl;
        }
      } else {
        downloadUrl = initialUrl;
      }
    }

    const response = await axios({
      ...axiosOptions,
      url: downloadUrl,
    });

    const totalLength = response.headers['content-length'];
    let downloaded = 0;

    const writer = fs.createWriteStream(destPath);
    
    response.data.on('data', (chunk) => {
      downloaded += chunk.length;
      if (io && totalLength) {
        const progress = Math.round((downloaded * 100) / totalLength);
        io.emit('upload:progress', { progress });
      }
    });

    response.data.pipe(writer);

    writer.on('finish', () => {
      res.json({ 
        message: 'Cloud video imported successfully', 
        filename: filename,
        path: destPath 
      });
    });

    writer.on('error', (err) => {
      console.error('Writer Error:', err);
      if (!res.headersSent) res.status(500).json({ error: 'Failed to save downloaded file' });
    });

  } catch (err) {
    console.error('Cloud Fetch Error:', err.message);
    res.status(500).json({ error: `Cloud Fetch Error: ${err.message}` });
  }
});

router.post('/fetch-youtube', async (req, res) => {
  const { url } = req.body;
  if (!url || (!url.includes('youtube.com/') && !url.includes('youtu.be/'))) {
    return res.status(400).json({ error: 'Invalid or missing YouTube URL provided' });
  }

  const io = getIO();
  const filename = `youtube-${Date.now()}.mp4`;
  const destPath = path.join('media', filename);

  try {
    if (io) io.emit('upload:progress', { progress: 10 });
    
    await youtubedl(url, {
      output: destPath,
      format: 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
      noCheckCertificates: true,
      noWarnings: true,
      addHeader: [
        'referer:youtube.com',
        'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
      ]
    });

    if (io) io.emit('upload:progress', { progress: 100 });

    res.json({ 
      message: 'YouTube video imported successfully', 
      filename: filename,
      path: destPath 
    });

  } catch (err) {
    console.error('YouTube Fetch Error:', err.message);
    if (!res.headersSent) res.status(500).json({ error: `YouTube Fetch API Error` });
  }
});

export default router;
