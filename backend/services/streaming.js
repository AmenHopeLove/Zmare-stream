import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import path from 'path';
import fs from 'fs';
import dns from 'dns';

const customResolver = new dns.promises.Resolver();
customResolver.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);

// Use system ffmpeg if available (e.g. HuggingFace Docker), otherwise fallback to local installer
if (fs.existsSync('/usr/bin/ffmpeg')) {
  ffmpeg.setFfmpegPath('/usr/bin/ffmpeg');
} else {
  ffmpeg.setFfmpegPath(ffmpegInstaller.path);
}

import crypto from 'crypto';

const activeStreams = new Map();
let ioInstance = null;

const isRemote = (path) => path && (path.startsWith('http://') || path.startsWith('https://'));

export const setIO = (io) => {
  ioInstance = io;
};

export const getIO = () => ioInstance;

/**
 * Starts a stream from a file or playlist to an RTMP URL.
 * @param {string|string[]} inputPaths - Local path(s) to the media file(s).
 * @param {string} rtmpUrl - YouTube/RTMP ingestion URL + Stream Key.
 */
export const startFileStream = (inputPaths, rtmpUrl) => {
  const isPlaylist = Array.isArray(inputPaths) && inputPaths.length > 1;
  const streamId = crypto.randomUUID();
  
  if (isPlaylist) {
    console.log(`[${streamId}] Starting 24/7 Playlist loop: ${inputPaths.length} files -> ${rtmpUrl}`);
  } else {
    console.log(`[${streamId}] Starting 24/7 Single-file loop: ${inputPaths} -> ${rtmpUrl}`);
  }

  activeStreams.set(streamId, {
    id: streamId,
    process: null,
    inputPaths,
    rtmpUrl,
    startTime: new Date().toISOString(),
    intentionalStop: false,
    playlistFilePath: null
  });

  const spawnStream = async () => {
    const data = activeStreams.get(streamId);
    if (!data || data.intentionalStop) return;

    let targetUrl = data.rtmpUrl;
    try {
      // 1. Force RTMPS and Port 443 to bypass HF outbound firewall
      if (targetUrl.startsWith('rtmp://')) {
        targetUrl = targetUrl.replace('rtmp://', 'rtmps://');
      }
      if (!targetUrl.includes(':443')) {
        targetUrl = targetUrl.replace('.com/live2', '.com:443/live2');
      }

      // 2. Bypass broken ffmpeg Docker DNS by pre-resolving IP in Node layer securely via Google/Cloudflare
      const urlObj = new URL(targetUrl.replace('rtmps://', 'http://'));
      const addresses = await customResolver.resolve4(urlObj.hostname);
      const address = addresses[0];
      targetUrl = targetUrl.replace(urlObj.hostname, address);
      
      // 3. Disable TLS SNI/Cert Validation because hitting an IP directly will fail SNI checks
      const sep = targetUrl.includes('?') ? '&' : '?';
      targetUrl += `${sep}tls_verify=0&verify=0`;

      if (ioInstance) {
        ioInstance.emit('stream:log', { streamId, message: `DNS Bypassed: mapped ${urlObj.hostname} to ${address} using RTMPS` });
      }
    } catch(err) {
      if (ioInstance) ioInstance.emit('stream:log', { streamId, message: `Network override failed: ${err.message}` });
    }

    let input = Array.isArray(inputPaths) ? inputPaths[0] : inputPaths;
    let inputOptions = ['-re', '-stream_loop -1', '-protocol_whitelist file,http,https,tcp,tls,crypto'];

    if (isPlaylist) {
      // Generate playlist.txt
      const playlistContent = inputPaths.map(p => {
        const resolved = isRemote(p) ? p : path.resolve(p);
        return `file '${resolved}'`;
      }).join('\n');
      
      const playlistPath = path.resolve(`media/playlist_${streamId}.txt`);
      fs.writeFileSync(playlistPath, playlistContent);
      data.playlistFilePath = playlistPath;

      input = playlistPath;
      inputOptions = ['-re', '-f concat', '-safe 0', '-protocol_whitelist file,http,https,tcp,tls,crypto', '-stream_loop -1'];
    }

    data.process = ffmpeg(input)
      .inputOptions(inputOptions)
      .outputOptions([
        '-vcodec libx264',
        '-preset veryfast',
        '-maxrate 3000k',
        '-bufsize 6000k',
        '-pix_fmt yuv420p',
        '-g 60',
        '-c:a aac',
        '-b:a 128k',
        '-ar 44100',
        '-f flv'
      ])
      .on('start', (commandLine) => {
        console.log(`[${streamId}] Spawned FFmpeg with command: ` + commandLine);
        if (ioInstance) {
          ioInstance.emit('stream:log', { streamId, message: `Started: ${commandLine.substring(0, 50)}...` });
        }
      })
      .on('stderr', (stderrLine) => {
        if (ioInstance) {
          ioInstance.emit('stream:log', { streamId, message: stderrLine });
        }
      })
      .on('progress', (progress) => {
        if (ioInstance) {
          ioInstance.emit('stream:progress', { 
            streamId, 
            bitrate: progress.currentKbps, 
            speed: progress.currentFps,
            frames: progress.frames
          });
        }
      })
      .on('error', (err) => {
        const currentData = activeStreams.get(streamId);
        if (currentData && !currentData.intentionalStop) {
           console.error(`[${streamId}] FFmpeg Error: ` + err.message + " - Restarting in 5s...");
           setTimeout(spawnStream, 5000);
        } else {
           console.log(`[${streamId}] Stream stopped intentionally.`);
           activeStreams.delete(streamId);
        }
      })
      .on('end', () => {
        const currentData = activeStreams.get(streamId);
        if (currentData && !currentData.intentionalStop) {
           console.log(`[${streamId}] Stream unexpectedly finished. Restarting in 5s...`);
           setTimeout(spawnStream, 5000);
        } else {
           console.log(`[${streamId}] Stream stopped intentionally.`);
           activeStreams.delete(streamId);
        }
      })
      .save(targetUrl);
  };

  spawnStream();
  return streamId;
};

export const stopStream = (streamId) => {
  const streamData = activeStreams.get(streamId);
  if (streamData && streamData.process) {
    console.log(`[${streamId}] Terminating stream`);
    streamData.intentionalStop = true;
    streamData.process.kill('SIGKILL');
    
    // Cleanup temporary playlist file
    if (streamData.playlistFilePath && fs.existsSync(streamData.playlistFilePath)) {
       try { fs.unlinkSync(streamData.playlistFilePath); } catch(e) {}
    }
    return true;
  }
  return false;
};

export const getActiveStreams = () => {
  const streams = [];
  for (const [id, data] of activeStreams.entries()) {
    streams.push({
      id,
      inputPath: Array.isArray(data.inputPaths) ? data.inputPaths[0] : data.inputPaths,
      rtmpUrl: data.rtmpUrl,
      startTime: data.startTime
    });
  }
  return streams;
};
