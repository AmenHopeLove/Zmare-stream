import { supabase } from './youtube.js';
import fs from 'fs';
import path from 'path';

/**
 * Fetch the current playlist for a specific channel profile.
 */
export const getPlaylist = async (profileId) => {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('playlists')
    .select('items')
    .eq('profile_id', profileId)
    .single();

  if (error || !data) return [];
  return data.items;
};

/**
 * Save/Update the entire playlist for a profile.
 */
export const updatePlaylist = async (profileId, items) => {
  if (!supabase) return;
  const { error } = await supabase
    .from('playlists')
    .upsert({ profile_id: profileId, items });
  
  if (error) console.error('Playlist Update Error:', error);
};

/**
 * Formats an array of file paths into an FFmpeg concat-style string.
 */
export const formatConcatFile = (filePaths) => {
  return filePaths.map(p => `file '${path.resolve(p)}'`).join('\n');
};
