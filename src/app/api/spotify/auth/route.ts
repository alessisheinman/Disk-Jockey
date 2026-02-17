import { NextRequest, NextResponse } from 'next/server';

const SPOTIFY_ACCOUNTS_BASE = 'https://accounts.spotify.com';

export async function GET(request: NextRequest) {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const redirectUri = process.env.SPOTIFY_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    return NextResponse.json(
      { error: 'Spotify not configured' },
      { status: 500 }
    );
  }

  const scopes = [
    'streaming',
    'user-read-email',
    'user-read-private',
    'user-read-playback-state',
    'user-modify-playback-state',
    'playlist-read-private',
    'playlist-read-collaborative',
  ].join(' ');

  // Get room code from query params to pass through OAuth flow
  const searchParams = request.nextUrl.searchParams;
  const roomCode = searchParams.get('roomCode') || '';

  const state = Buffer.from(
    JSON.stringify({ roomCode, timestamp: Date.now() })
  ).toString('base64');

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    scope: scopes,
    redirect_uri: redirectUri,
    state: state,
    show_dialog: 'false',
  });

  const authUrl = `${SPOTIFY_ACCOUNTS_BASE}/authorize?${params.toString()}`;

  return NextResponse.redirect(authUrl);
}
