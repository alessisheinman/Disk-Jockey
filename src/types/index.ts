// Player types
export interface Player {
  id: string;
  nickname: string;
  pace: number;
  isHost: boolean;
  isEliminated: boolean;
  isConnected: boolean;
  socketId: string | null;
  currentAnswer: PlayerAnswer | null;
  hasSubmitted: boolean;
  lastRoundResult: RoundResult | null;
}

export interface PlayerAnswer {
  songTitle: string;
  artist: string;
  submittedAt: number;
}

export type RoundResult = 'BOTH' | 'ONE' | 'NONE';

// Room types
export interface Room {
  code: string;
  hostId: string;
  players: Map<string, Player>;
  gameState: GameState;
  spotifyAuth: SpotifyAuth | null;
  playlist: PlaylistInfo | null;
  tracks: Track[];
  usedTrackIds: Set<string>;
  createdAt: number;
  settings: RoomSettings;
}

export interface RoomSettings {
  maxPlayers: number;
  roundDurationMs: number;
  revealDurationMs: number;
}

export interface PlaylistInfo {
  id: string;
  name: string;
  imageUrl: string | null;
  trackCount: number;
}

// Game state types
export interface GameState {
  status: GameStatus;
  currentRound: number;
  currentTrack: Track | null;
  roundStartTime: number | null;
  roundEndTime: number | null;
  isPaused: boolean;
  pauseReason: string | null;
  winnerId: string | null;
}

export type GameStatus =
  | 'LOBBY'
  | 'STARTING'
  | 'PLAYING'
  | 'ROUND_REVEAL'
  | 'ELIMINATION_CHECK'
  | 'GAME_OVER';

// Track types
export interface Track {
  id: string;
  uri: string;
  name: string;
  artists: Artist[];
  albumName: string;
  albumImageUrl: string | null;
  durationMs: number;
  previewUrl: string | null;
}

export interface Artist {
  id: string;
  name: string;
}

// Spotify types
export interface SpotifyAuth {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  userId: string;
}

export interface SpotifyTokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
  expires_in: number;
  refresh_token?: string;
}

export interface SpotifyPlaylistTrack {
  track: {
    id: string;
    uri: string;
    name: string;
    artists: { id: string; name: string }[];
    album: {
      name: string;
      images: { url: string; width: number; height: number }[];
    };
    duration_ms: number;
    preview_url: string | null;
    is_playable?: boolean;
  } | null;
  is_local: boolean;
}

// Socket event types
export interface ServerToClientEvents {
  // Room events
  roomJoined: (data: RoomJoinedPayload) => void;
  roomUpdated: (data: RoomUpdatedPayload) => void;
  playerJoined: (data: PlayerJoinedPayload) => void;
  playerLeft: (data: PlayerLeftPayload) => void;
  playerReconnected: (data: PlayerReconnectedPayload) => void;

  // Game events
  gameStarting: (data: GameStartingPayload) => void;
  roundStarted: (data: RoundStartedPayload) => void;
  playerSubmitted: (data: PlayerSubmittedPayload) => void;
  roundEnded: (data: RoundEndedPayload) => void;
  eliminationCheck: (data: EliminationCheckPayload) => void;
  gameOver: (data: GameOverPayload) => void;
  gamePaused: (data: GamePausedPayload) => void;
  gameResumed: () => void;

  // Spotify events
  spotifyConnected: (data: SpotifyConnectedPayload) => void;
  playlistLoaded: (data: PlaylistLoadedPayload) => void;
  playbackCommand: (data: PlaybackCommandPayload) => void;

  // Error events
  error: (data: ErrorPayload) => void;
}

export interface ClientToServerEvents {
  // Room events
  createRoom: (data: CreateRoomData, callback: (response: CreateRoomResponse) => void) => void;
  joinRoom: (data: JoinRoomData, callback: (response: JoinRoomResponse) => void) => void;
  leaveRoom: () => void;

  // Game events
  startGame: () => void;
  submitAnswer: (data: SubmitAnswerData) => void;
  restartGame: () => void;

  // Spotify events
  setSpotifyAuth: (data: SetSpotifyAuthData) => void;
  loadPlaylist: (data: LoadPlaylistData) => void;
  playbackReady: () => void;
  playbackEnded: () => void;
}

// Event payloads
export interface RoomJoinedPayload {
  room: SerializedRoom;
  playerId: string;
}

export interface RoomUpdatedPayload {
  room: SerializedRoom;
}

export interface PlayerJoinedPayload {
  player: Player;
}

export interface PlayerLeftPayload {
  playerId: string;
  nickname: string;
}

export interface PlayerReconnectedPayload {
  playerId: string;
  nickname: string;
}

export interface GameStartingPayload {
  startsIn: number;
}

export interface RoundStartedPayload {
  roundNumber: number;
  durationMs: number;
  trackUri: string;
}

export interface PlayerSubmittedPayload {
  playerId: string;
  nickname: string;
}

export interface RoundEndedPayload {
  track: Track;
  results: PlayerRoundResult[];
  nextRoundIn: number;
}

export interface PlayerRoundResult {
  playerId: string;
  nickname: string;
  answer: PlayerAnswer | null;
  result: RoundResult;
  paceChange: number;
  newPace: number;
  songCorrect: boolean;
  artistCorrect: boolean;
}

export interface EliminationCheckPayload {
  round: number;
  threshold: number;
  leaderPace: number;
  eliminated: EliminatedPlayer[];
  survivors: string[];
}

export interface EliminatedPlayer {
  playerId: string;
  nickname: string;
  pace: number;
  gap: number;
}

export interface GameOverPayload {
  winnerId: string;
  winnerNickname: string;
  finalStandings: FinalStanding[];
}

export interface FinalStanding {
  playerId: string;
  nickname: string;
  pace: number;
  eliminatedRound: number | null;
}

export interface GamePausedPayload {
  reason: string;
}

export interface SpotifyConnectedPayload {
  userId: string;
}

export interface PlaylistLoadedPayload {
  playlist: PlaylistInfo;
  trackCount: number;
}

export interface PlaybackCommandPayload {
  command: 'play' | 'pause' | 'stop';
  trackUri?: string;
  positionMs?: number;
}

export interface ErrorPayload {
  message: string;
  code?: string;
}

// Request/Response types
export interface CreateRoomData {
  nickname: string;
}

export interface CreateRoomResponse {
  success: boolean;
  roomCode?: string;
  playerId?: string;
  error?: string;
}

export interface JoinRoomData {
  roomCode: string;
  nickname: string;
}

export interface JoinRoomResponse {
  success: boolean;
  playerId?: string;
  error?: string;
}

export interface SubmitAnswerData {
  songTitle: string;
  artist: string;
}

export interface SetSpotifyAuthData {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface LoadPlaylistData {
  playlistId: string;
}

// Serialized types for sending over socket
export interface SerializedRoom {
  code: string;
  hostId: string;
  players: Player[];
  gameState: GameState;
  hasSpotifyAuth: boolean;
  playlist: PlaylistInfo | null;
  trackCount: number;
  settings: RoomSettings;
}

// Default playlists
export interface DefaultPlaylist {
  id: string;
  name: string;
  description: string;
}

export const DEFAULT_PLAYLISTS: DefaultPlaylist[] = [
  {
    id: '37i9dQZF1DXcBWIGoYBM5M',
    name: "Today's Top Hits",
    description: 'The hottest songs right now',
  },
  {
    id: '37i9dQZF1DX0XUsuxWHRQd',
    name: 'RapCaviar',
    description: 'New music from Drake, Travis Scott, and more',
  },
  {
    id: '37i9dQZF1DX4SBhb3fqCJd',
    name: 'Are & Be',
    description: 'The best in R&B right now',
  },
  {
    id: '37i9dQZF1DWXRqgorJj26U',
    name: 'Rock Classics',
    description: 'Rock legends & iconic songs',
  },
  {
    id: '37i9dQZF1DX4o1oenSJRJd',
    name: 'All Out 2000s',
    description: 'The biggest songs of the 2000s',
  },
  {
    id: '37i9dQZF1DX4UtSsGT1Sbe',
    name: 'All Out 90s',
    description: 'The biggest songs of the 1990s',
  },
  {
    id: '37i9dQZF1DX4sWSpwq3LiO',
    name: 'Peaceful Piano',
    description: 'Relax and indulge with beautiful piano pieces',
  },
  {
    id: '37i9dQZF1DXbTxeAdrVG2l',
    name: 'All Out 80s',
    description: 'The biggest songs of the 1980s',
  },
];

// Game constants
export const GAME_CONSTANTS = {
  MIN_PLAYERS: 2,
  MAX_PLAYERS: 10,
  STARTING_PACE: 10,
  MIN_PACE: 0,
  MAX_PACE: 10,
  ROUND_DURATION_MS: 60000,
  REVEAL_DURATION_MS: 8000,
  COUNTDOWN_DURATION_MS: 5000,
  ELIMINATION_INTERVAL: 6,
  INITIAL_ELIMINATION_THRESHOLD: 10,
  MIN_ELIMINATION_THRESHOLD: 1,
  SCORE_BOTH_CORRECT: 1,
  SCORE_ONE_CORRECT: 0,
  SCORE_NONE_CORRECT: -3,
} as const;
