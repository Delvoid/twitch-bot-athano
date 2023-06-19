import Config from '../../config';
import { SPOTIFY_API_URL } from '../../constants';
import { fetchWithRetry, getCurrentAccessToken } from '../../spotify';
import { hasOwnProperty } from '../../utils/hasOwnProperty';
import type { SpotifyTrack } from './types';

export const getTrack = async (trackId: string): Promise<SpotifyTrack | null> => {
  if (Config.spotify.enabled) {
    try {
      const url = `${SPOTIFY_API_URL}tracks/${trackId}`;

      const result = await fetchWithRetry(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getCurrentAccessToken()}`,
        },
      });
      if (hasOwnProperty(result, 'album') && hasOwnProperty(result, 'name') && typeof result.name === 'string') {
        return result as SpotifyTrack;
      }
    } catch (error) {
      console.error(error);
    }
  }

  return null;
};
