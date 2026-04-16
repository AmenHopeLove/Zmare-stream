import { google } from 'googleapis';
import { supabase } from './youtube.js';

/**
 * Fetches the current concurrent viewer count for a YouTube Live Video ID.
 */
export const fetchLiveMetrics = async (channelId, videoId) => {
  // 1. Get the profile tokens for this channel
  const { data: profile } = await supabase
    .from('profiles')
    .select('tokens')
    .eq('id', channelId)
    .single();

  if (!profile) return null;

  const auth = new google.auth.OAuth2(
    process.env.YOUTUBE_CLIENT_ID,
    process.env.YOUTUBE_CLIENT_SECRET,
    process.env.YOUTUBE_REDIRECT_URI
  );
  auth.setCredentials(profile.tokens);

  const youtube = google.youtube({ version: 'v3', auth });

  try {
    const res = await youtube.videos.list({
      part: ['liveStreamingDetails'],
      id: [videoId]
    });

    if (res.data.items && res.data.items.length > 0) {
      const viewers = parseInt(res.data.items[0].liveStreamingDetails?.concurrentViewers || '0', 10);
      
      // 2. Log to database
      await supabase
        .from('analytics')
        .insert({
          channel_id: channelId,
          viewer_count: viewers,
          timestamp: new Date().toISOString()
        });

      return viewers;
    }
  } catch (err) {
    console.error('Analytics Fetch Error:', err.message);
  }
  return null;
};
