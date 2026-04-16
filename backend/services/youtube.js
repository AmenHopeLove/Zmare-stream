import { createClient } from '@supabase/supabase-js';
import { google } from 'googleapis';
import dotenv from 'dotenv';
import { localDB } from './db.js';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

export let supabase = null;
if (SUPABASE_URL && SUPABASE_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
} else {
  console.warn('⚠️ SUPABASE_URL or SUPABASE_KEY is missing. Profile persistence is falling back to local storage.');
  supabase = localDB;
}

const oauth2Client = new google.auth.OAuth2(
  process.env.YOUTUBE_CLIENT_ID,
  process.env.YOUTUBE_CLIENT_SECRET,
  process.env.YOUTUBE_REDIRECT_URI
);

export const getAuthUrl = () => {
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [
      'https://www.googleapis.com/auth/youtube.force-ssl',
      'https://www.googleapis.com/auth/youtube.readonly'
    ],
  });
};

export const getTokens = async (code) => {
  const { tokens } = await oauth2Client.getToken(code);
  return tokens;
};

export const getChannelInfo = async (tokens) => {
  const client = new google.auth.OAuth2(
    process.env.YOUTUBE_CLIENT_ID,
    process.env.YOUTUBE_CLIENT_SECRET,
    process.env.YOUTUBE_REDIRECT_URI
  );
  client.setCredentials(tokens);
  const youtube = google.youtube({ version: 'v3', auth: client });
  const res = await youtube.channels.list({ part: ['snippet'], mine: true });
  if (res.data.items && res.data.items.length > 0) {
    const channel = res.data.items[0];
    return {
      id: channel.id,
      title: channel.snippet.title,
      thumbnail: channel.snippet.thumbnails.default.url,
      tokens
    };
  }
  return null;
};

export const getYouTubeClient = async (channelId) => {
  const { data, error } = await supabase
    .from('profiles')
    .select('tokens')
    .eq('id', channelId)
    .single();

  if (error || !data) throw new Error('Channel profile not found');

  const client = new google.auth.OAuth2(
    process.env.YOUTUBE_CLIENT_ID,
    process.env.YOUTUBE_CLIENT_SECRET,
    process.env.YOUTUBE_REDIRECT_URI
  );
  client.setCredentials(data.tokens);

  return google.youtube({ version: 'v3', auth: client });
};

export const saveProfile = async (tokens) => {
  if (!supabase) return null;
  const info = await getChannelInfo(tokens);
  if (info) {
     const { error } = await supabase
       .from('profiles')
       .upsert(info);
     if (error) console.error('Supabase Save Error:', error);
     return info;
  }
  return null;
};

export const getProfiles = async () => {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('profiles')
    .select('id, title, thumbnail');
  if (error) {
    console.error('Supabase Fetch Error:', error);
    return [];
  }
  return data;
};

export const removeProfile = async (id) => {
  if (!supabase) return;
  const { error } = await supabase
    .from('profiles')
    .delete()
    .eq('id', id);
  if (error) console.error('Supabase Remove Error:', error);
};

export const getStreamKey = async (channelId) => {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('tokens')
    .eq('id', channelId)
    .single();

  if (error || !data) return null;

  const client = new google.auth.OAuth2(
    process.env.YOUTUBE_CLIENT_ID,
    process.env.YOUTUBE_CLIENT_SECRET,
    process.env.YOUTUBE_REDIRECT_URI
  );
  client.setCredentials(data.tokens);

  const youtube = google.youtube({ version: 'v3', auth: client });
  const response = await youtube.liveStreams.list({
    part: ['cdn'],
    mine: true
  });
  if (response.data.items && response.data.items.length > 0) {
    return response.data.items[0].cdn.ingestionInfo.streamName;
  }
  return null;
};

export const checkConfig = () => {
  return {
    supabase: !!process.env.SUPABASE_URL ? true : "fallback",
    youtube: !!(process.env.YOUTUBE_CLIENT_ID && process.env.YOUTUBE_CLIENT_ID !== 'your_client_id')
  };
};
