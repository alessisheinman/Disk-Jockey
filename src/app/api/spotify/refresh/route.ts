import { NextRequest, NextResponse } from 'next/server';

const SPOTIFY_ACCOUNTS_BASE = 'https://accounts.spotify.com';

export async function POST(request: NextRequest) {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { error: 'Spotify not configured' },
      { status: 500 }
    );
  }

  try {
    const body = await request.json();
    const { refresh_token } = body;

    if (!refresh_token) {
      return NextResponse.json(
        { error: 'Refresh token required' },
        { status: 400 }
      );
    }

    const response = await fetch(`${SPOTIFY_ACCOUNTS_BASE}/api/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refresh_token,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Token refresh failed:', errorText);
      return NextResponse.json(
        { error: 'Failed to refresh token' },
        { status: 401 }
      );
    }

    const tokens = await response.json();

    return NextResponse.json({
      access_token: tokens.access_token,
      expires_in: tokens.expires_in,
      refresh_token: tokens.refresh_token || refresh_token,
    });
  } catch (err) {
    console.error('Refresh token error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
