import { getYouTubeClient } from './youtube.js';

/**
 * Creates a YouTube Live Broadcast.
 * @param {string} title - The title of the stream.
 * @param {string} description - The description of the stream.
 */
export const createBroadcast = async (channelId, title, description) => {
  const youtube = await getYouTubeClient(channelId);
  const response = await youtube.liveBroadcasts.insert({
    part: 'snippet,status,contentDetails',
    requestBody: {
      snippet: {
        title,
        description,
        scheduledStartTime: new Date().toISOString(),
      },
      status: {
        privacyStatus: 'unlisted', // Default to unlisted for testing
        selfDeclaredMadeForKids: false,
      },
      contentDetails: {
        enableAutoStart: true,
        enableAutoStop: true,
      }
    },
  });
  return response.data;
};

/**
 * Creates a YouTube Live Stream.
 * @param {string} title - The title of the stream key.
 */
export const createStream = async (channelId, title) => {
  const youtube = await getYouTubeClient(channelId);
  const response = await youtube.liveStreams.insert({
    part: 'snippet,cdn,status',
    requestBody: {
      snippet: {
        title,
      },
      cdn: {
        frameRate: '30fps',
        ingestionType: 'rtmp',
        resolution: '1080p',
      }
    },
  });
  return response.data;
};

/**
 * Binds a Broadcast to a Stream.
 * @param {string} broadcastId - ID of the broadcast.
 * @param {string} streamId - ID of the stream.
 */
export const bindStreamToBroadcast = async (channelId, broadcastId, streamId) => {
  const youtube = await getYouTubeClient(channelId);
  const response = await youtube.liveBroadcasts.bind({
    id: broadcastId,
    part: 'id,contentDetails',
    streamId: streamId,
  });
  return response.data;
};
