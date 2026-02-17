# Disk Jockey

A horse-racing themed music elimination game using Spotify. Players race as horses, guessing songs to maintain their pace and avoid elimination.

## Features

- Real-time multiplayer (up to 10 players)
- Spotify Premium integration for music playback
- Horse race visualization with smooth animations
- Fuzzy matching for song/artist guesses
- Progressive elimination system
- Mobile-friendly design

## Tech Stack

- **Frontend**: Next.js 14 (App Router), React, Tailwind CSS, Framer Motion
- **Backend**: Node.js, Express, Socket.IO
- **Music**: Spotify Web Playback SDK, Spotify Web API
- **Language**: TypeScript

## Prerequisites

- Node.js 18+
- Spotify Developer Account
- Spotify Premium Account (for hosting)

## Local Development Setup

### 1. Clone and Install

```bash
cd disk-jockey
npm install
```

### 2. Create Spotify App

1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Create a new app
3. Set redirect URI to `http://localhost:3000/api/spotify/callback`
4. Note your Client ID and Client Secret

### 3. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your values:

```env
SPOTIFY_CLIENT_ID=your_client_id
SPOTIFY_CLIENT_SECRET=your_client_secret
SPOTIFY_REDIRECT_URI=http://localhost:3000/api/spotify/callback
SESSION_SECRET=random_string_here
BASE_URL=http://localhost:3000
PORT=3000
NODE_ENV=development
```

### 4. Add Sound Files (Optional)

Place victory sounds in `public/sounds/`:
- `trumpet.mp3` - Victory fanfare
- `applause.mp3` - Crowd applause

### 5. Run Development Server

```bash
npm run dev
```

Visit `http://localhost:3000`

## Production Deployment

### Option 1: Railway

1. Create new project on [Railway](https://railway.app)
2. Connect your GitHub repository
3. Add environment variables
4. Deploy

Railway auto-detects Node.js and runs `npm start`.

### Option 2: Render

1. Create new Web Service on [Render](https://render.com)
2. Connect repository
3. Set build command: `npm install && npm run build`
4. Set start command: `npm start`
5. Add environment variables

### Option 3: DigitalOcean App Platform

1. Create new App
2. Connect repository
3. Configure as Web Service
4. Add environment variables
5. Deploy

### Option 4: Self-hosted (VPS)

```bash
# Clone repository
git clone <your-repo>
cd disk-jockey

# Install dependencies
npm install

# Build
npm run build

# Start with PM2
npm install -g pm2
pm2 start npm --name "disk-jockey" -- start

# Or use systemd service
```

### Environment Variables for Production

```env
SPOTIFY_CLIENT_ID=your_client_id
SPOTIFY_CLIENT_SECRET=your_client_secret
SPOTIFY_REDIRECT_URI=https://yourdomain.com/api/spotify/callback
SESSION_SECRET=strong_random_secret
BASE_URL=https://yourdomain.com
PORT=3000
NODE_ENV=production
```

**Important**: Update your Spotify app's redirect URI to match your production domain.

## WebSocket Considerations

This app uses Socket.IO for real-time communication. Ensure your hosting platform supports WebSockets:

- **Railway**: Full WebSocket support
- **Render**: Full WebSocket support
- **Heroku**: Full WebSocket support
- **Vercel**: Limited (use separate WebSocket server)
- **Netlify**: No WebSocket support for functions

For platforms without WebSocket support, deploy the server separately on Railway/Render.

## Game Rules

### Scoring
- **Both correct** (song + artist): +1 pace
- **One correct**: No change
- **Neither correct**: -3 pace

### Pace System
- Starting pace: 10
- Maximum pace: 10
- Minimum pace: 0

### Elimination
Every 6 rounds, players too far behind the leader are eliminated:
- Rounds 1-6: Gap of 10+
- Rounds 7-12: Gap of 9+
- Rounds 13-18: Gap of 8+
- (continues decreasing, minimum threshold: 1)

### Win Condition
Last player standing wins!

## Fuzzy Matching

The game uses forgiving string matching:
- Case insensitive
- Ignores punctuation
- Handles acronyms (P.I.M.P = pimp)
- Removes noise words (remastered, remix, etc.)
- Accepts any featured artist as correct

## Project Structure

```
disk-jockey/
├── src/
│   ├── app/                 # Next.js pages
│   │   ├── api/spotify/     # Spotify OAuth routes
│   │   ├── room/[code]/     # Game room page
│   │   └── page.tsx         # Home page
│   ├── components/          # React components
│   │   ├── RaceTrack.tsx
│   │   ├── AnswerInput.tsx
│   │   ├── RoundReveal.tsx
│   │   ├── VictoryScreen.tsx
│   │   ├── EliminationScreen.tsx
│   │   ├── Lobby.tsx
│   │   └── GameHeader.tsx
│   ├── lib/                 # Client utilities
│   │   ├── socket.ts
│   │   ├── spotify.ts
│   │   ├── fuzzyMatch.ts
│   │   └── utils.ts
│   ├── server/              # Server code
│   │   ├── index.ts         # Main server
│   │   ├── roomManager.ts
│   │   ├── gameManager.ts
│   │   └── spotifyService.ts
│   └── types/               # TypeScript types
│       └── index.ts
├── public/sounds/           # Victory sounds
├── package.json
├── tsconfig.json
├── tailwind.config.js
└── .env.example
```

## Troubleshooting

### Spotify Connection Issues
- Ensure you have Spotify Premium
- Check redirect URI matches exactly
- Verify client credentials

### WebSocket Connection Failed
- Check if your host supports WebSockets
- Verify CORS settings
- Check firewall rules

### Players Can't Join
- Verify room code is correct (4 characters)
- Check if game already started (can't join mid-game)
- Ensure room isn't full (max 10 players)

## License

MIT
