import express from 'express';
import { getAuthUrl, getTokens, saveProfile, getProfiles, removeProfile, getStreamKey } from '../services/youtube.js';

const router = express.Router();

router.get('/login', (req, res) => {
  const url = getAuthUrl();
  res.redirect(url);
});

router.get('/callback', async (req, res) => {
  const { code } = req.query;
  try {
    const tokens = await getTokens(code);
    const profile = await saveProfile(tokens);
    res.send(`
      <script>
        window.opener.postMessage({ type: 'AUTH_SUCCESS', profile: ${JSON.stringify(profile)} }, '*');
        window.close();
      </script>
      <h2>Authentication Successful. You can close this window.</h2>
    `);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/profiles', async (req, res) => {
  res.json({ profiles: await getProfiles() });
});

router.delete('/profiles/:id', async (req, res) => {
  await removeProfile(req.params.id);
  res.json({ success: true });
});

router.get('/stream-key', async (req, res) => {
  const { channelId } = req.query;
  if (!channelId) return res.status(400).json({ error: 'Missing channelId' });
  try {
    const key = await getStreamKey(channelId);
    if (key) {
      res.json({ streamKey: key });
    } else {
      res.status(404).json({ error: 'No active stream found' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
