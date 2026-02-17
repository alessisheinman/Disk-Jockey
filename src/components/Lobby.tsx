'use client';

import { useState } from 'react';
import type { SerializedRoom, DefaultPlaylist } from '@/types';
import { cn } from '@/lib/utils';
import {
  Music,
  Users,
  Play,
  Link2,
  Check,
  Copy,
  Crown,
  Wifi,
  WifiOff,
  ListMusic,
} from 'lucide-react';

interface LobbyProps {
  room: SerializedRoom;
  isHost: boolean;
  hasSpotifyAuth: boolean;
  onConnectSpotify: () => void;
  onLoadPlaylist: (playlistId: string) => void;
  onStartGame: () => void;
  defaultPlaylists: DefaultPlaylist[];
}

export default function Lobby({
  room,
  isHost,
  hasSpotifyAuth,
  onConnectSpotify,
  onLoadPlaylist,
  onStartGame,
  defaultPlaylists,
}: LobbyProps) {
  const [copied, setCopied] = useState(false);
  const [playlistInput, setPlaylistInput] = useState('');
  const [showDefaultPlaylists, setShowDefaultPlaylists] = useState(false);

  const connectedPlayers = room.players.filter((p) => p.isConnected);
  const canStart =
    isHost &&
    hasSpotifyAuth &&
    room.trackCount > 0 &&
    connectedPlayers.length >= 2;

  const copyRoomCode = () => {
    navigator.clipboard.writeText(room.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleLoadPlaylist = () => {
    if (playlistInput.trim()) {
      onLoadPlaylist(playlistInput.trim());
      setPlaylistInput('');
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4">
      <div className="max-w-lg w-full space-y-6">
        {/* Room header */}
        <div className="text-center">
          <div className="text-5xl mb-4">🏇</div>
          <h1 className="text-3xl font-bold mb-2">Disk Jockey</h1>
          <div className="flex items-center justify-center gap-2">
            <span className="text-white/60">Room Code:</span>
            <button
              onClick={copyRoomCode}
              className="flex items-center gap-2 bg-white/10 px-4 py-2 rounded-lg hover:bg-white/20 transition-colors"
            >
              <span className="font-mono text-2xl tracking-widest font-bold">
                {room.code}
              </span>
              {copied ? (
                <Check className="w-5 h-5 text-green-400" />
              ) : (
                <Copy className="w-5 h-5 text-white/60" />
              )}
            </button>
          </div>
        </div>

        {/* Players list */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Users className="w-5 h-5" />
              Players ({connectedPlayers.length}/{room.settings.maxPlayers})
            </h2>
          </div>
          <div className="space-y-2">
            {room.players.map((player) => (
              <div
                key={player.id}
                className={cn(
                  'flex items-center justify-between p-3 rounded-lg',
                  player.isConnected ? 'bg-white/5' : 'bg-white/5 opacity-50'
                )}
              >
                <div className="flex items-center gap-3">
                  {player.isHost && (
                    <Crown className="w-5 h-5 text-yellow-400" />
                  )}
                  <span className="font-medium">{player.nickname}</span>
                </div>
                <div className="flex items-center gap-2">
                  {player.isConnected ? (
                    <Wifi className="w-4 h-4 text-green-400" />
                  ) : (
                    <WifiOff className="w-4 h-4 text-red-400" />
                  )}
                </div>
              </div>
            ))}
          </div>
          {connectedPlayers.length < 2 && (
            <p className="text-white/40 text-sm mt-3 text-center">
              Need at least 2 players to start
            </p>
          )}
        </div>

        {/* Host controls */}
        {isHost && (
          <>
            {/* Spotify connection */}
            <div className="card">
              <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
                <Music className="w-5 h-5 text-spotify-green" />
                Spotify Connection
              </h2>

              {hasSpotifyAuth ? (
                <div className="flex items-center gap-2 text-green-400">
                  <Check className="w-5 h-5" />
                  <span>Spotify connected</span>
                </div>
              ) : (
                <button
                  onClick={onConnectSpotify}
                  className="btn-primary w-full flex items-center justify-center gap-2"
                >
                  <Music className="w-5 h-5" />
                  Connect Spotify Premium
                </button>
              )}
            </div>

            {/* Playlist selection */}
            {hasSpotifyAuth && (
              <div className="card">
                <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
                  <ListMusic className="w-5 h-5" />
                  Select Playlist
                </h2>

                {room.playlist ? (
                  <div className="flex items-center gap-4 p-3 bg-white/5 rounded-lg mb-4">
                    {room.playlist.imageUrl && (
                      <img
                        src={room.playlist.imageUrl}
                        alt={room.playlist.name}
                        className="w-12 h-12 rounded"
                      />
                    )}
                    <div className="flex-1">
                      <p className="font-semibold">{room.playlist.name}</p>
                      <p className="text-white/60 text-sm">
                        {room.trackCount} playable tracks
                      </p>
                    </div>
                    <Check className="w-5 h-5 text-green-400" />
                  </div>
                ) : null}

                {/* Playlist URL input */}
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={playlistInput}
                      onChange={(e) => setPlaylistInput(e.target.value)}
                      placeholder="Paste Spotify playlist URL or ID..."
                      className="input-field flex-1"
                    />
                    <button
                      onClick={handleLoadPlaylist}
                      disabled={!playlistInput.trim()}
                      className="btn-primary px-4"
                    >
                      <Link2 className="w-5 h-5" />
                    </button>
                  </div>

                  <div className="text-center">
                    <button
                      onClick={() => setShowDefaultPlaylists(!showDefaultPlaylists)}
                      className="text-sm text-white/60 hover:text-white underline"
                    >
                      {showDefaultPlaylists ? 'Hide' : 'Show'} default playlists
                    </button>
                  </div>

                  {showDefaultPlaylists && (
                    <div className="grid grid-cols-2 gap-2 mt-3">
                      {defaultPlaylists.map((playlist) => (
                        <button
                          key={playlist.id}
                          onClick={() => onLoadPlaylist(playlist.id)}
                          className="text-left p-3 bg-white/5 rounded-lg hover:bg-white/10 transition-colors"
                        >
                          <p className="font-medium text-sm">{playlist.name}</p>
                          <p className="text-white/40 text-xs">{playlist.description}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Start button */}
            <button
              onClick={onStartGame}
              disabled={!canStart}
              className="btn-primary w-full text-lg py-4 flex items-center justify-center gap-2"
            >
              <Play className="w-6 h-6" />
              Start Race
            </button>

            {!canStart && (
              <p className="text-white/40 text-sm text-center">
                {!hasSpotifyAuth && 'Connect Spotify Premium to start. '}
                {hasSpotifyAuth && room.trackCount === 0 && 'Load a playlist to start. '}
                {connectedPlayers.length < 2 && 'Need at least 2 players. '}
              </p>
            )}
          </>
        )}

        {/* Guest view */}
        {!isHost && (
          <div className="card text-center">
            <p className="text-white/60 mb-2">
              Waiting for host to start the race...
            </p>
            <div className="pulse-waiting inline-block">
              <div className="w-3 h-3 bg-spotify-green rounded-full" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
