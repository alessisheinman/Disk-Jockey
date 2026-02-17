'use client';

declare global {
  interface Window {
    Spotify: typeof Spotify;
    onSpotifyWebPlaybackSDKReady: () => void;
  }
}

export interface SpotifyTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

// Parse tokens from URL fragment
export function parseSpotifyTokensFromUrl(): SpotifyTokens | null {
  if (typeof window === 'undefined') return null;

  const hash = window.location.hash.substring(1);
  if (!hash) return null;

  const params = new URLSearchParams(hash);
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  const expiresIn = params.get('expires_in');

  if (accessToken && refreshToken && expiresIn) {
    // Clear the hash from URL
    window.history.replaceState(null, '', window.location.pathname);

    return {
      accessToken,
      refreshToken,
      expiresIn: parseInt(expiresIn, 10),
    };
  }

  return null;
}

// Refresh access token
export async function refreshAccessToken(refreshToken: string): Promise<SpotifyTokens | null> {
  try {
    const response = await fetch('/api/spotify/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!response.ok) return null;

    const data = await response.json();
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
    };
  } catch {
    return null;
  }
}

// Load Spotify Web Playback SDK
export function loadSpotifySDK(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.Spotify) {
      resolve();
      return;
    }

    window.onSpotifyWebPlaybackSDKReady = () => {
      resolve();
    };

    const script = document.createElement('script');
    script.src = 'https://sdk.scdn.co/spotify-player.js';
    script.async = true;
    script.onerror = () => reject(new Error('Failed to load Spotify SDK'));
    document.body.appendChild(script);
  });
}

// Create Spotify player instance
export function createSpotifyPlayer(
  accessToken: string,
  name: string,
  onReady: (deviceId: string) => void,
  onNotReady: () => void,
  onError: (error: Error) => void,
  onStateChange: (state: Spotify.PlaybackState | null) => void
): Spotify.Player {
  const player = new window.Spotify.Player({
    name,
    getOAuthToken: (cb) => cb(accessToken),
    volume: 0.5,
  });

  player.addListener('ready', ({ device_id }) => {
    console.log('Spotify player ready with device ID:', device_id);
    onReady(device_id);
  });

  player.addListener('not_ready', ({ device_id }) => {
    console.log('Spotify player not ready:', device_id);
    onNotReady();
  });

  player.addListener('initialization_error', ({ message }) => {
    console.error('Initialization error:', message);
    onError(new Error(message));
  });

  player.addListener('authentication_error', ({ message }) => {
    console.error('Authentication error:', message);
    onError(new Error(message));
  });

  player.addListener('account_error', ({ message }) => {
    console.error('Account error (Premium required):', message);
    onError(new Error('Spotify Premium required'));
  });

  player.addListener('player_state_changed', (state) => {
    onStateChange(state);
  });

  return player;
}

// Play a track on a device
export async function playTrack(
  accessToken: string,
  deviceId: string,
  trackUri: string,
  positionMs: number = 0
): Promise<void> {
  await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      uris: [trackUri],
      position_ms: positionMs,
    }),
  });
}

// Pause playback
export async function pausePlayback(accessToken: string): Promise<void> {
  await fetch('https://api.spotify.com/v1/me/player/pause', {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
}
