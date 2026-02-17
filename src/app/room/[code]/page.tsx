'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getSocket } from '@/lib/socket';
import {
  parseSpotifyTokensFromUrl,
  loadSpotifySDK,
  createSpotifyPlayer,
  playTrack,
  pausePlayback,
} from '@/lib/spotify';
import type {
  SerializedRoom,
  Player,
  Track,
  PlayerRoundResult,
  EliminatedPlayer,
  FinalStanding,
  PlaybackCommandPayload,
} from '@/types';
import { DEFAULT_PLAYLISTS } from '@/types';
import RaceTrack from '@/components/RaceTrack';
import AnswerInput from '@/components/AnswerInput';
import RoundReveal from '@/components/RoundReveal';
import VictoryScreen from '@/components/VictoryScreen';
import EliminationScreen from '@/components/EliminationScreen';
import Lobby from '@/components/Lobby';
import GameHeader from '@/components/GameHeader';
import { Music, AlertCircle, Loader2 } from 'lucide-react';

export default function RoomPage() {
  const params = useParams();
  const router = useRouter();
  const roomCode = (params.code as string)?.toUpperCase();

  // Player state
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [room, setRoom] = useState<SerializedRoom | null>(null);
  const [isConnecting, setIsConnecting] = useState(true);
  const [error, setError] = useState('');

  // Game state
  const [roundNumber, setRoundNumber] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [submittedPlayers, setSubmittedPlayers] = useState<Set<string>>(new Set());

  // Round reveal state
  const [showReveal, setShowReveal] = useState(false);
  const [revealTrack, setRevealTrack] = useState<Track | null>(null);
  const [revealResults, setRevealResults] = useState<PlayerRoundResult[]>([]);

  // Elimination state
  const [showElimination, setShowElimination] = useState(false);
  const [eliminationData, setEliminationData] = useState<{
    round: number;
    threshold: number;
    leaderPace: number;
    eliminated: EliminatedPlayer[];
  } | null>(null);

  // Victory state
  const [showVictory, setShowVictory] = useState(false);
  const [victoryData, setVictoryData] = useState<{
    winnerId: string;
    winnerNickname: string;
    finalStandings: FinalStanding[];
  } | null>(null);

  // Spotify state
  const [spotifyPlayer, setSpotifyPlayer] = useState<Spotify.Player | null>(null);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  // Refs
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const socketRef = useRef(getSocket());

  // Get current player
  const currentPlayer = room?.players.find((p) => p.id === playerId);
  const isHost = currentPlayer?.isHost ?? false;

  // Initialize socket connection
  useEffect(() => {
    const socket = socketRef.current;
    const storedPlayerId = localStorage.getItem('diskJockey_playerId');
    const storedNickname = localStorage.getItem('diskJockey_nickname');
    const storedRoomCode = localStorage.getItem('diskJockey_roomCode');

    // Check for Spotify tokens in URL (OAuth callback)
    const tokens = parseSpotifyTokensFromUrl();
    if (tokens) {
      setAccessToken(tokens.accessToken);
      setRefreshToken(tokens.refreshToken);

      // Send tokens to server
      socket.emit('setSpotifyAuth', {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresIn: tokens.expiresIn,
      });
    }

    // Try to rejoin room
    if (storedRoomCode?.toUpperCase() === roomCode && storedNickname) {
      socket.emit('joinRoom', { roomCode, nickname: storedNickname }, (response) => {
        if (response.success && response.playerId) {
          setPlayerId(response.playerId);
          localStorage.setItem('diskJockey_playerId', response.playerId);
        } else {
          // Clear stored data and redirect
          localStorage.removeItem('diskJockey_playerId');
          localStorage.removeItem('diskJockey_nickname');
          localStorage.removeItem('diskJockey_roomCode');
          router.push('/');
        }
        setIsConnecting(false);
      });
    } else {
      router.push('/');
    }

    // Socket event handlers
    socket.on('roomJoined', ({ room, playerId: id }) => {
      setRoom(room);
      setPlayerId(id);
      setIsConnecting(false);
    });

    socket.on('roomUpdated', ({ room }) => {
      setRoom(room);
    });

    socket.on('playerJoined', ({ player }) => {
      setRoom((prev) =>
        prev
          ? { ...prev, players: [...prev.players, player] }
          : null
      );
    });

    socket.on('playerLeft', ({ playerId: leftId }) => {
      setRoom((prev) =>
        prev
          ? { ...prev, players: prev.players.filter((p) => p.id !== leftId) }
          : null
      );
    });

    socket.on('playerReconnected', ({ playerId: reconId }) => {
      setRoom((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          players: prev.players.map((p) =>
            p.id === reconId ? { ...p, isConnected: true } : p
          ),
        };
      });
    });

    socket.on('gameStarting', ({ startsIn }) => {
      // Game starting countdown
      setShowReveal(false);
      setShowElimination(false);
      setShowVictory(false);
    });

    socket.on('roundStarted', ({ roundNumber: rn, durationMs }) => {
      setRoundNumber(rn);
      setTimeLeft(Math.ceil(durationMs / 1000));
      setHasSubmitted(false);
      setSubmittedPlayers(new Set());
      setShowReveal(false);
      setShowElimination(false);

      // Start countdown timer
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            if (timerRef.current) clearInterval(timerRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    });

    socket.on('playerSubmitted', ({ playerId: submittedId }) => {
      setSubmittedPlayers((prev) => new Set([...prev, submittedId]));
    });

    socket.on('roundEnded', ({ track, results }) => {
      if (timerRef.current) clearInterval(timerRef.current);
      setRevealTrack(track);
      setRevealResults(results);
      setShowReveal(true);

      // Update player paces
      setRoom((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          players: prev.players.map((p) => {
            const result = results.find((r) => r.playerId === p.id);
            return result ? { ...p, pace: result.newPace } : p;
          }),
        };
      });
    });

    socket.on('eliminationCheck', (data) => {
      setShowReveal(false);
      setEliminationData(data);
      setShowElimination(true);

      // Update eliminated players
      setRoom((prev) => {
        if (!prev) return null;
        const eliminatedIds = new Set(data.eliminated.map((e) => e.playerId));
        return {
          ...prev,
          players: prev.players.map((p) =>
            eliminatedIds.has(p.id) ? { ...p, isEliminated: true } : p
          ),
        };
      });
    });

    socket.on('gameOver', (data) => {
      setShowReveal(false);
      setShowElimination(false);
      setVictoryData(data);
      setShowVictory(true);
    });

    socket.on('gamePaused', ({ reason }) => {
      setRoom((prev) =>
        prev
          ? { ...prev, gameState: { ...prev.gameState, isPaused: true, pauseReason: reason } }
          : null
      );
    });

    socket.on('gameResumed', () => {
      setRoom((prev) =>
        prev
          ? { ...prev, gameState: { ...prev.gameState, isPaused: false, pauseReason: null } }
          : null
      );
    });

    socket.on('spotifyConnected', () => {
      // Spotify auth successful
    });

    socket.on('playlistLoaded', ({ playlist, trackCount }) => {
      setRoom((prev) =>
        prev ? { ...prev, playlist, trackCount } : null
      );
    });

    socket.on('error', ({ message }) => {
      setError(message);
      setTimeout(() => setError(''), 5000);
    });

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      socket.off('roomJoined');
      socket.off('roomUpdated');
      socket.off('playerJoined');
      socket.off('playerLeft');
      socket.off('playerReconnected');
      socket.off('gameStarting');
      socket.off('roundStarted');
      socket.off('playerSubmitted');
      socket.off('roundEnded');
      socket.off('eliminationCheck');
      socket.off('gameOver');
      socket.off('gamePaused');
      socket.off('gameResumed');
      socket.off('spotifyConnected');
      socket.off('playlistLoaded');
      socket.off('error');
    };
  }, [roomCode, router]);

  // Handle playback commands (host only)
  useEffect(() => {
    if (!isHost || !deviceId || !accessToken) return;

    const socket = socketRef.current;

    const handlePlayback = async (data: PlaybackCommandPayload) => {
      try {
        if (data.command === 'play' && data.trackUri) {
          await playTrack(accessToken, deviceId, data.trackUri, data.positionMs || 0);
          setIsPlaying(true);
        } else if (data.command === 'pause' || data.command === 'stop') {
          await pausePlayback(accessToken);
          setIsPlaying(false);
        }
      } catch (err) {
        console.error('Playback error:', err);
      }
    };

    socket.on('playbackCommand', handlePlayback);

    return () => {
      socket.off('playbackCommand', handlePlayback);
    };
  }, [isHost, deviceId, accessToken]);

  // Initialize Spotify player (host only)
  useEffect(() => {
    if (!isHost || !accessToken || spotifyPlayer) return;

    const initPlayer = async () => {
      try {
        await loadSpotifySDK();

        const player = createSpotifyPlayer(
          accessToken,
          'Disk Jockey',
          (devId) => {
            setDeviceId(devId);
            socketRef.current.emit('playbackReady');
          },
          () => {
            setDeviceId(null);
          },
          (err) => {
            setError(err.message);
          },
          (state) => {
            if (state) {
              setIsPlaying(!state.paused);
            }
          }
        );

        await player.connect();
        setSpotifyPlayer(player);
      } catch (err) {
        console.error('Failed to initialize Spotify player:', err);
        setError('Failed to initialize Spotify player');
      }
    };

    initPlayer();

    return () => {
      if (spotifyPlayer) {
        spotifyPlayer.disconnect();
      }
    };
  }, [isHost, accessToken, spotifyPlayer]);

  // Handle answer submission
  const handleSubmit = useCallback((songTitle: string, artist: string) => {
    if (hasSubmitted || currentPlayer?.isEliminated) return;

    socketRef.current.emit('submitAnswer', { songTitle, artist });
    setHasSubmitted(true);
  }, [hasSubmitted, currentPlayer?.isEliminated]);

  // Handle game start (host only)
  const handleStartGame = useCallback(() => {
    socketRef.current.emit('startGame');
  }, []);

  // Handle game restart (host only)
  const handleRestartGame = useCallback(() => {
    socketRef.current.emit('restartGame');
    setShowVictory(false);
    setVictoryData(null);
    setRoundNumber(0);
  }, []);

  // Handle playlist load (host only)
  const handleLoadPlaylist = useCallback((playlistId: string) => {
    socketRef.current.emit('loadPlaylist', { playlistId });
  }, []);

  // Connect Spotify (host only)
  const handleConnectSpotify = useCallback(() => {
    window.location.href = `/api/spotify/auth?roomCode=${roomCode}`;
  }, [roomCode]);

  // Loading state
  if (isConnecting) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-spotify-green mx-auto mb-4" />
          <p className="text-white/60">Connecting to room...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (!room) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <p className="text-white/60">Room not found</p>
          <button
            onClick={() => router.push('/')}
            className="btn-secondary mt-4"
          >
            Go Home
          </button>
        </div>
      </div>
    );
  }

  // Victory screen
  if (showVictory && victoryData) {
    return (
      <VictoryScreen
        winnerId={victoryData.winnerId}
        winnerNickname={victoryData.winnerNickname}
        finalStandings={victoryData.finalStandings}
        isHost={isHost}
        onRestart={handleRestartGame}
        currentPlayerId={playerId || ''}
      />
    );
  }

  // Game in progress
  const isGameActive = room.gameState.status === 'PLAYING' || room.gameState.status === 'ROUND_REVEAL';

  return (
    <div className="min-h-screen flex flex-col">
      {/* Error toast */}
      {error && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-red-500/90 text-white px-4 py-2 rounded-lg shadow-lg">
          {error}
        </div>
      )}

      {/* Paused overlay */}
      {room.gameState.isPaused && (
        <div className="fixed inset-0 z-40 bg-black/80 flex items-center justify-center">
          <div className="card text-center">
            <Loader2 className="w-12 h-12 animate-spin text-yellow-400 mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-2">Game Paused</h2>
            <p className="text-white/60">{room.gameState.pauseReason}</p>
          </div>
        </div>
      )}

      {/* Lobby */}
      {room.gameState.status === 'LOBBY' && (
        <Lobby
          room={room}
          isHost={isHost}
          hasSpotifyAuth={room.hasSpotifyAuth}
          onConnectSpotify={handleConnectSpotify}
          onLoadPlaylist={handleLoadPlaylist}
          onStartGame={handleStartGame}
          defaultPlaylists={DEFAULT_PLAYLISTS}
        />
      )}

      {/* Game header */}
      {isGameActive && (
        <GameHeader
          roomCode={room.code}
          roundNumber={roundNumber}
          timeLeft={timeLeft}
          totalPlayers={room.players.length}
          activePlayers={room.players.filter((p) => !p.isEliminated).length}
        />
      )}

      {/* Race track */}
      {isGameActive && (
        <div className="flex-1 p-4">
          <RaceTrack
            players={room.players}
            currentPlayerId={playerId || ''}
            submittedPlayers={submittedPlayers}
          />
        </div>
      )}

      {/* Answer input */}
      {room.gameState.status === 'PLAYING' && !currentPlayer?.isEliminated && (
        <div className="p-4 bg-black/20">
          <AnswerInput
            onSubmit={handleSubmit}
            hasSubmitted={hasSubmitted}
            timeLeft={timeLeft}
          />
        </div>
      )}

      {/* Round reveal */}
      {showReveal && revealTrack && (
        <RoundReveal
          track={revealTrack}
          results={revealResults}
          currentPlayerId={playerId || ''}
        />
      )}

      {/* Elimination screen */}
      {showElimination && eliminationData && (
        <EliminationScreen
          round={eliminationData.round}
          threshold={eliminationData.threshold}
          leaderPace={eliminationData.leaderPace}
          eliminated={eliminationData.eliminated}
          currentPlayerId={playerId || ''}
        />
      )}
    </div>
  );
}
