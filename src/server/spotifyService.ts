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
   * Get playlist info only (no tracks) - efficient for initial load
   */
  async getPlaylistInfo(accessToken: string, playlistId: string): Promise<PlaylistInfo> {
    console.log('Getting playlist info for:', playlistId);
    const response = await fetch(
      `${SPOTIFY_API_BASE}/playlists/${playlistId}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After') || '5';
      throw new Error(`Rate limited by Spotify. Please wait ${retryAfter} seconds and try again.`);
    }
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to get playlist: ${response.status}`);
    }
    const data = await response.json();
    return {
      id: data.id,
      name: data.name,
      imageUrl: data.images?.[0]?.url || null,
      trackCount: data.tracks?.total || 0,
    };
  }

  /**
   * Get a random track from playlist (on-demand)
   */
  async getRandomTrack(
    accessToken: string,
    playlistId: string,
    totalTracks: number,
    usedTrackIds: Set<string>,
    maxRetries: number = 10
  ): Promise<Track | null> {
    if (usedTrackIds.size >= totalTracks) return null;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const offset = Math.floor(Math.random() * totalTracks);
      const response = await fetch(
        `${SPOTIFY_API_BASE}/playlists/${playlistId}/tracks?offset=${offset}&limit=1`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After') || '5';
        throw new Error(`Rate limited. Wait ${retryAfter} seconds.`);
      }
      if (!response.ok) continue;
      const data = await response.json();
      const item = data.items?.[0];
      if (!item || item.is_local || !item.track?.id) continue;
      if (usedTrackIds.has(item.track.id)) continue;
      const t = item.track;
      return {
        id: t.id,
        uri: t.uri || `spotify:track:${t.id}`,
        name: t.name || 'Unknown',
        artists: (t.artists || []).map((a: any) => ({ id: a.id || '', name: a.name || 'Unknown' })),
        albumName: t.album?.name || 'Unknown',
        albumImageUrl: t.album?.images?.[0]?.url || null,
        durationMs: t.duration_ms || 0,
        previewUrl: t.preview_url || null,
      };
    }
    return null;
  }

  /**
   * Get playlist info and tracks (legacy)
   */
  async getPlaylistWithTracks(accessToken: string, playlistId: string): Promise<{ info: PlaylistInfo; tracks: Track[] }> {
    console.log('Getting playlist with tracks for:', playlistId);

    const response = await fetch(
      `${SPOTIFY_API_BASE}/playlists/${playlistId}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    // Handle rate limiting
    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After') || '5';
      throw new Error(`Rate limited by Spotify. Please wait ${retryAfter} seconds and try again.`);
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Spotify getPlaylistWithTracks failed:', response.status, errorText);
      throw new Error(`Failed to get playlist: ${response.status}`);
    }

    const data = await response.json();
    console.log('Playlist response keys:', Object.keys(data));

    // Extract playlist info
    const info: PlaylistInfo = {
      id: data.id,
      name: data.name,
      imageUrl: data.images?.[0]?.url || null,
      trackCount: data.tracks?.total || data.tracks?.items?.length || data.items?.length || 0,
    };

    // Extract tracks
    const tracks: Track[] = [];
    let items: any[] = [];

    if (Array.isArray(data.tracks?.items)) {
      items = data.tracks.items;
    } else if (Array.isArray(data.items)) {
      items = data.items;
    }
    console.log('Items found:', items.length);

    for (const item of items) {
      if (item.is_local) continue;
      const track = item.track as any;
      if (!track || !track.id) continue;

      tracks.push({
        id: track.id,
        uri: track.uri || `spotify:track:${track.id}`,
        name: track.name || 'Unknown',
        artists: (track.artists || []).map((a: any) => ({
          id: a.id || '',
          name: a.name || 'Unknown Artist',
        })),
        albumName: track.album?.name || 'Unknown Album',
        albumImageUrl: track.album?.images?.[0]?.url || null,
        durationMs: track.duration_ms || 0,
        previewUrl: track.preview_url || null,
      });
    }

    // Handle pagination if there are more tracks
    let nextUrl = data.tracks?.next;
    while (nextUrl) {
      console.log('Fetching more tracks...');
      const nextResponse = await fetch(nextUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!nextResponse.ok) {
        console.error('Failed to get more tracks:', nextResponse.status);
        break;
      }

      const nextData = await nextResponse.json();
      for (const item of (nextData.items || [])) {
        if (item.is_local) continue;
        const track = item.track as any;
        if (!track || !track.id) continue;

        tracks.push({
          id: track.id,
          uri: track.uri || `spotify:track:${track.id}`,
          name: track.name || 'Unknown',
          artists: (track.artists || []).map((a: any) => ({
            id: a.id || '',
            name: a.name || 'Unknown Artist',
          })),
          albumName: track.album?.name || 'Unknown Album',
          albumImageUrl: track.album?.images?.[0]?.url || null,
          durationMs: track.duration_ms || 0,
          previewUrl: track.preview_url || null,
        });
      }

      nextUrl = nextData.next;
    }

    console.log('Total tracks loaded:', tracks.length);
    return { info, tracks };
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
