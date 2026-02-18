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
      `${SPOTIFY_API_BASE}/playlists/${playlistId}`,
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
      trackCount: data.tracks?.total || data.tracks?.items?.length || data.items?.length || 0,
    };
  }

  /**
   * Get all tracks from a playlist using the main playlist endpoint
   * (the /tracks endpoint returns 403 for apps in Development Mode)
   */
  async getPlaylistTracks(
    accessToken: string,
    playlistId: string
  ): Promise<Track[]> {
    const tracks: Track[] = [];

    console.log('Getting playlist tracks for:', playlistId);

    // Get the playlist with tracks included
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
      console.error('Spotify getPlaylistTracks failed:', response.status, errorText);
      let errorMsg = `Failed to get playlist: ${response.status}`;
      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.error?.message) {
          errorMsg = `Spotify error: ${errorJson.error.message}`;
        }
      } catch {}
      throw new Error(errorMsg);
    }

    const playlist = await response.json();
    console.log('Playlist response keys:', Object.keys(playlist));
    console.log('playlist.tracks type:', typeof playlist.tracks);
    console.log('playlist.tracks?.items type:', typeof playlist.tracks?.items);

    // Tracks can be in playlist.tracks.items OR playlist.items depending on endpoint
    let items: SpotifyPlaylistTrack[] = [];
    if (Array.isArray(playlist.tracks?.items)) {
      items = playlist.tracks.items;
    } else if (Array.isArray(playlist.items)) {
      items = playlist.items;
    }
    console.log('Items found:', items.length);

    if (items.length > 0) {
      console.log('First item structure:', JSON.stringify(items[0], null, 2).substring(0, 500));
    }

    for (const item of items) {
      // Skip local files
      if (item.is_local) {
        console.log('Skipping local file');
        continue;
      }

      // Handle different response structures - track could be nested or direct
      const track = item.track || item;

      if (!track || !track.id) {
        console.log('Skipping item - no track or track id');
        continue;
      }

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

    // Handle pagination if there are more tracks (playlist > 100 tracks)
    let nextUrl = playlist.tracks?.next || playlist.next;
    while (nextUrl) {
      console.log('Fetching more tracks from:', nextUrl);
      const nextResponse = await fetch(nextUrl, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!nextResponse.ok) {
        console.error('Failed to get more tracks:', nextResponse.status);
        break; // Stop pagination but return what we have
      }

      const nextData = await nextResponse.json();
      const nextItems: SpotifyPlaylistTrack[] = nextData.items || [];

      for (const item of nextItems) {
        if (item.is_local) continue;
        const track = item.track || item;
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
