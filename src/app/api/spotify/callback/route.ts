import { NextRequest, NextResponse } from 'next/server';

const SPOTIFY_ACCOUNTS_BASE = 'https://accounts.spotify.com';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  const baseUrl = process.env.BASE_URL || 'http://localhost:3000';

  if (error) {
    return NextResponse.redirect(
      `${baseUrl}?spotify_error=${encodeURIComponent(error)}`
    );
  }

  if (!code) {
    return NextResponse.redirect(
      `${baseUrl}?spotify_error=${encodeURIComponent('No authorization code')}`
    );
  }

  // Parse state to get room code
  let roomCode = '';
  if (state) {
    try {
      const stateData = JSON.parse(Buffer.from(state, 'base64').toString());
      roomCode = stateData.roomCode || '';
    } catch {
      // Ignore state parsing errors
    }
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  const redirectUri = process.env.SPOTIFY_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    return NextResponse.redirect(
      `${baseUrl}?spotify_error=${encodeURIComponent('Spotify not configured')}`
    );
  }

  try {
    // Exchange code for tokens
    const tokenResponse = await fetch(`${SPOTIFY_ACCOUNTS_BASE}/api/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('Token exchange failed:', errorText);
      return NextResponse.redirect(
        `${baseUrl}?spotify_error=${encodeURIComponent('Failed to get tokens')}`
      );
    }

    const tokens = await tokenResponse.json();

    // Redirect back to room with tokens in fragment (more secure than query params)
    const redirectUrl = roomCode
      ? `${baseUrl}/room/${roomCode}`
      : baseUrl;

    // Pass tokens via fragment to avoid them being logged in server
    const fragment = new URLSearchParams({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_in: tokens.expires_in.toString(),
    }).toString();

    return NextResponse.redirect(`${redirectUrl}#${fragment}`);
  } catch (err) {
    console.error('OAuth callback error:', err);
    return NextResponse.redirect(
      `${baseUrl}?spotify_error=${encodeURIComponent('OAuth failed')}`
    );
  }
}
