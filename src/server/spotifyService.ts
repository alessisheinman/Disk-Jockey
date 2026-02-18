import type {
  SpotifyAuth,
  SpotifyTokenResponse,
  SpotifyPlaylistTrack,
  Track,
  PlaylistInfo,
} from '../types';

const SPOTIFY_API_BASE = 'https://api.spotify.com/v1';
const SPOTIFY_ACCOUNTS_BASE = 'https://accounts.spotify.com';

export class SpotifyService {
  private clientId: string;
  private clientSecret: string;
  private redirectUri: string;

  constructor() {
    this.clientId = process.env.SPOTIFY_CLIENT_ID || '';
    this.clientSecret = process.env.SPOTIFY_CLIENT_SECRET || '';
    this.redirectUri = process.env.SPOTIFY_REDIRECT_URI || '';

    if (!this.clientId || !this.clientSecret) {
      console.warn('Spotify credentials not configured');
    }
  }

  /**
   * Generate the Spotify authorization URL
   */
  getAuthUrl(state: string): string {
    const scopes = [
      'streaming',
      'user-read-email',
      'user-read-private',
      'user-read-playback-state',
      'user-modify-playback-state',
      'playlist-read-private',
      'playlist-read-collaborative',
    ].join(' ');

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.clientId,
      scope: scopes,
      redirect_uri: this.redirectUri,
      state: state,
    });

    return `${SPOTIFY_ACCOUNTS_BASE}/authorize?${params.toString()}`;
  }

  /**
   * Exchange authorization code for tokens
   */
  async exchangeCode(code: string): Promise<SpotifyTokenResponse> {
    const response = await fetch(`${SPOTIFY_ACCOUNTS_BASE}/api/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: this.redirectUri,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to exchange code: ${error}`);
    }

    return response.json();
  }

  /**
   * Refresh an access token
   */
  async refreshToken(refreshToken: string): Promise<SpotifyTokenResponse> {
    const response = await fetch(`${SPOTIFY_ACCOUNTS_BASE}/api/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to refresh token: ${error}`);
    }

    return response.json();
  }

  /**
   * Get current user's profile
   */
  async getCurrentUser(accessToken: string): Promise<{ id: string; display_name: string }> {
    const response = await fetch(`${SPOTIFY_API_BASE}/me`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to get current user');
    }

    return response.json();
  }

  /**
   * Get playlist info
   */
  async getPlaylistInfo(accessToken: string, playlistId: string): Promise<PlaylistInfo> {
    const response = await fetch(
      `${SPOTIFY_API_BASE}/playlists/${playlistId}?fields=id,name,images,tracks.total`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Spotify getPlaylistInfo failed:', response.status, errorText);
      throw new Error(`Failed to get playlist info: ${response.status}`);
    }

    const data = await response.json();

    return {
      id: data.id,
      name: data.name,
      imageUrl: data.images?.[0]?.url || null,
      trackCount: data.tracks.total,
    };
  }

  /**
   * Get all tracks from a playlist
   */
  async getPlaylistTracks(
    accessToken: string,
    playlistId: string
  ): Promise<Track[]> {
    const tracks: Track[] = [];
    let offset = 0;
    const limit = 100;
    let hasMore = true;

    console.log('Getting playlist tracks for:', playlistId);

    while (hasMore) {
      const response = await fetch(
        `${SPOTIFY_API_BASE}/playlists/${playlistId}/tracks?offset=${offset}&limit=${limit}&fields=items(track(id,uri,name,artists(id,name),album(name,images),duration_ms,preview_url,is_playable),is_local)`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Spotify getPlaylistTracks failed:', response.status, errorText);
        throw new Error(`Failed to get playlist tracks: ${response.status}`);
      }

      const data = await response.json();
      const items: SpotifyPlaylistTrack[] = data.items;

      for (const item of items) {
        // Skip local files and null tracks
        if (item.is_local || !item.track) {
          continue;
        }

        // Skip unplayable tracks
        if (item.track.is_playable === false) {
          continue;
        }

        tracks.push({
          id: item.track.id,
          uri: item.track.uri,
          name: item.track.name,
          artists: item.track.artists.map((a) => ({
            id: a.id,
            name: a.name,
          })),
          albumName: item.track.album.name,
          albumImageUrl: item.track.album.images?.[0]?.url || null,
          durationMs: item.track.duration_ms,
          previewUrl: item.track.preview_url,
        });
      }

      offset += limit;
      hasMore = items.length === limit;
    }

    return tracks;
  }

  /**
   * Ensure access token is valid, refresh if needed
   */
  async ensureValidToken(auth: SpotifyAuth): Promise<SpotifyAuth> {
    // Check if token expires in less than 5 minutes
    const expiresInMs = auth.expiresAt - Date.now();
    console.log('Token expires in ms:', expiresInMs);

    if (expiresInMs > 5 * 60 * 1000) {
      console.log('Token still valid');
      return auth;
    }

    // Refresh the token
    console.log('Refreshing token...');
    try {
      const tokenResponse = await this.refreshToken(auth.refreshToken);
      console.log('Token refreshed successfully');

      return {
        accessToken: tokenResponse.access_token,
        refreshToken: tokenResponse.refresh_token || auth.refreshToken,
        expiresAt: Date.now() + tokenResponse.expires_in * 1000,
        userId: auth.userId,
      };
    } catch (error) {
      console.error('Token refresh failed:', error);
      throw error;
    }
  }

  /**
   * Parse playlist ID from URL or ID string
   */
  parsePlaylistId(input: string): string | null {
    // Direct ID
    if (/^[a-zA-Z0-9]{22}$/.test(input)) {
      return input;
    }

    // URL format: https://open.spotify.com/playlist/PLAYLIST_ID?...
    const urlMatch = input.match(/playlist\/([a-zA-Z0-9]{22})/);
    if (urlMatch) {
      return urlMatch[1];
    }

    // Spotify URI format: spotify:playlist:PLAYLIST_ID
    const uriMatch = input.match(/spotify:playlist:([a-zA-Z0-9]{22})/);
    if (uriMatch) {
      return uriMatch[1];
    }

    return null;
  }

  /**
   * Shuffle an array (Fisher-Yates)
   */
  shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }
}

export const spotifyService = new SpotifyService();
