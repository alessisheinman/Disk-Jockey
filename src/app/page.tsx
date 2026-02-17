'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getSocket } from '@/lib/socket';
import { Music, Users, Trophy, Zap } from 'lucide-react';

export default function HomePage() {
  const router = useRouter();
  const [nickname, setNickname] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'home' | 'create' | 'join'>('home');

  useEffect(() => {
    // Check for Spotify error in URL
    const params = new URLSearchParams(window.location.search);
    const spotifyError = params.get('spotify_error');
    if (spotifyError) {
      setError(`Spotify error: ${spotifyError}`);
      window.history.replaceState(null, '', '/');
    }
  }, []);

  const handleCreate = async () => {
    if (!nickname.trim()) {
      setError('Please enter a nickname');
      return;
    }

    setIsCreating(true);
    setError('');

    try {
      const socket = getSocket();

      socket.emit('createRoom', { nickname: nickname.trim() }, (response) => {
        if (response.success && response.roomCode && response.playerId) {
          // Store player info
          localStorage.setItem('diskJockey_playerId', response.playerId);
          localStorage.setItem('diskJockey_nickname', nickname.trim());
          localStorage.setItem('diskJockey_roomCode', response.roomCode);

          router.push(`/room/${response.roomCode}`);
        } else {
          setError(response.error || 'Failed to create room');
          setIsCreating(false);
        }
      });
    } catch (err) {
      setError('Connection error. Please try again.');
      setIsCreating(false);
    }
  };

  const handleJoin = async () => {
    if (!nickname.trim()) {
      setError('Please enter a nickname');
      return;
    }
    if (!roomCode.trim()) {
      setError('Please enter a room code');
      return;
    }

    setIsJoining(true);
    setError('');

    try {
      const socket = getSocket();
      const code = roomCode.trim().toUpperCase();

      socket.emit('joinRoom', { roomCode: code, nickname: nickname.trim() }, (response) => {
        if (response.success && response.playerId) {
          // Store player info
          localStorage.setItem('diskJockey_playerId', response.playerId);
          localStorage.setItem('diskJockey_nickname', nickname.trim());
          localStorage.setItem('diskJockey_roomCode', code);

          router.push(`/room/${code}`);
        } else {
          setError(response.error || 'Failed to join room');
          setIsJoining(false);
        }
      });
    } catch (err) {
      setError('Connection error. Please try again.');
      setIsJoining(false);
    }
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-4">
      {/* Logo and Title */}
      <div className="text-center mb-12">
        <div className="text-6xl mb-4">🏇</div>
        <h1 className="text-5xl font-bold mb-2 bg-gradient-to-r from-spotify-green to-emerald-400 bg-clip-text text-transparent">
          Disk Jockey
        </h1>
        <p className="text-white/60 text-lg">
          The ultimate music racing game
        </p>
      </div>

      {/* Features */}
      {mode === 'home' && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12 max-w-2xl">
          <div className="card text-center p-4">
            <Music className="w-8 h-8 mx-auto mb-2 text-spotify-green" />
            <p className="text-sm text-white/70">Spotify Music</p>
          </div>
          <div className="card text-center p-4">
            <Users className="w-8 h-8 mx-auto mb-2 text-spotify-green" />
            <p className="text-sm text-white/70">Multiplayer</p>
          </div>
          <div className="card text-center p-4">
            <Trophy className="w-8 h-8 mx-auto mb-2 text-spotify-green" />
            <p className="text-sm text-white/70">Last One Standing</p>
          </div>
          <div className="card text-center p-4">
            <Zap className="w-8 h-8 mx-auto mb-2 text-spotify-green" />
            <p className="text-sm text-white/70">Real-time Racing</p>
          </div>
        </div>
      )}

      {/* Main Actions */}
      <div className="card w-full max-w-md">
        {mode === 'home' && (
          <div className="space-y-4">
            <button
              onClick={() => setMode('create')}
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              <span className="text-xl">🏇</span>
              Create Race
            </button>
            <button
              onClick={() => setMode('join')}
              className="btn-secondary w-full flex items-center justify-center gap-2"
            >
              <Users className="w-5 h-5" />
              Join Race
            </button>
          </div>
        )}

        {mode === 'create' && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-center mb-4">Create a Race</h2>
            <div>
              <label className="block text-sm text-white/60 mb-2">Your Nickname</label>
              <input
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="Enter your name"
                className="input-field"
                maxLength={20}
                autoFocus
              />
            </div>
            {error && (
              <p className="text-red-400 text-sm text-center">{error}</p>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => { setMode('home'); setError(''); }}
                className="btn-secondary flex-1"
              >
                Back
              </button>
              <button
                onClick={handleCreate}
                disabled={isCreating}
                className="btn-primary flex-1"
              >
                {isCreating ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        )}

        {mode === 'join' && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-center mb-4">Join a Race</h2>
            <div>
              <label className="block text-sm text-white/60 mb-2">Your Nickname</label>
              <input
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="Enter your name"
                className="input-field"
                maxLength={20}
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm text-white/60 mb-2">Room Code</label>
              <input
                type="text"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                placeholder="XXXX"
                className="input-field text-center text-2xl tracking-widest font-mono"
                maxLength={4}
              />
            </div>
            {error && (
              <p className="text-red-400 text-sm text-center">{error}</p>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => { setMode('home'); setError(''); }}
                className="btn-secondary flex-1"
              >
                Back
              </button>
              <button
                onClick={handleJoin}
                disabled={isJoining}
                className="btn-primary flex-1"
              >
                {isJoining ? 'Joining...' : 'Join'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Instructions */}
      <div className="mt-12 text-center text-white/40 text-sm max-w-md">
        <p>
          Host creates a room with Spotify Premium.
          <br />
          Players join with room code on any device.
        </p>
      </div>
    </main>
  );
}
