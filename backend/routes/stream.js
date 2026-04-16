import express from 'express';
import { createBroadcast, createStream, bindStreamToBroadcast } from '../services/broadcast.js';
import { getPlaylist, updatePlaylist } from '../services/playlist.js';
import { startFileStream } from '../services/streaming.js';
import { supabase } from '../services/youtube.js';

const router = express.Router();

router.get('/playlist/:channelId', async (req, res) => {
  const items = await getPlaylist(req.params.channelId);
  res.json({ items });
});

router.post('/playlist/:channelId', async (req, res) => {
  await updatePlaylist(req.params.channelId, req.body.items);
  res.json({ success: true });
});

router.get('/analytics/:channelId', async (req, res) => {
  const { data, error } = await supabase
    .from('analytics')
    .select('*')
    .eq('channel_id', req.params.channelId)
    .order('timestamp', { ascending: true })
    .limit(100);
  
  if (error) return res.status(500).json({ error: error.message });
  res.json({ metrics: data });
});

router.post('/start', async (req, res) => {
  try {
    const { title, description, channelId } = req.body;
    if (!channelId) return res.status(400).json({ error: 'Missing channelId' });
    
    const broadcast = await createBroadcast(channelId, title || 'Zmare Test Stream', description || 'Automated by Zmare Stream Service');
    const stream = await createStream(channelId, title || 'Zmare Stream');
    await bindStreamToBroadcast(channelId, broadcast.id, stream.id);
    
    const streamKey = stream.cdn.ingestionInfo.streamName;
    const rtmpUrl = `${stream.cdn.ingestionInfo.ingestionAddress}/${streamKey}`;

    res.json({ 
      success: true, 
      broadcastId: broadcast.id, 
      streamId: stream.id,
      rtmpUrl,
      streamKey
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/start-loop', async (req, res) => {
  const { videoPaths, rtmpUrl, streamKey } = req.body;
  if (!videoPaths || !rtmpUrl || !streamKey) {
    return res.status(400).json({ error: 'Missing parameters' });
  }

  const fullRtmpUrl = `${rtmpUrl}/${streamKey}`;
  const streamId = startFileStream(videoPaths, fullRtmpUrl);
  res.json({ message: '24/7 Loop Started', streamId, rtmpUrl: fullRtmpUrl });
});

export default router;
