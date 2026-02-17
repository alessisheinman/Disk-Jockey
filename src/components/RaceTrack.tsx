'use client';

import { useEffect, useState } from 'react';
import type { Player } from '@/types';
import { cn } from '@/lib/utils';
import { Check, X } from 'lucide-react';

interface RaceTrackProps {
  players: Player[];
  currentPlayerId: string;
  submittedPlayers: Set<string>;
}

export default function RaceTrack({
  players,
  currentPlayerId,
  submittedPlayers,
}: RaceTrackProps) {
  // Sort players by pace (descending), then by name
  const sortedPlayers = [...players].sort((a, b) => {
    if (a.pace !== b.pace) return b.pace - a.pace;
    return a.nickname.localeCompare(b.nickname);
  });

  return (
    <div className="space-y-3">
      {sortedPlayers.map((player, index) => (
        <PlayerTrack
          key={player.id}
          player={player}
          isCurrentPlayer={player.id === currentPlayerId}
          hasSubmitted={submittedPlayers.has(player.id)}
          position={index + 1}
        />
      ))}
    </div>
  );
}

interface PlayerTrackProps {
  player: Player;
  isCurrentPlayer: boolean;
  hasSubmitted: boolean;
  position: number;
}

function PlayerTrack({
  player,
  isCurrentPlayer,
  hasSubmitted,
  position,
}: PlayerTrackProps) {
  const [animatedPace, setAnimatedPace] = useState(player.pace);

  useEffect(() => {
    // Animate pace changes
    const timer = setTimeout(() => {
      setAnimatedPace(player.pace);
    }, 100);
    return () => clearTimeout(timer);
  }, [player.pace]);

  // Calculate horse position (0-100%)
  const horsePosition = (animatedPace / 10) * 100;

  // Determine colors based on state
  const isDisconnected = !player.isConnected;
  const isEliminated = player.isEliminated;

  return (
    <div
      className={cn(
        'relative rounded-lg overflow-hidden transition-all duration-300',
        isCurrentPlayer && 'ring-2 ring-spotify-green ring-offset-2 ring-offset-black/50',
        isEliminated && 'opacity-50',
        isDisconnected && !isEliminated && 'opacity-70'
      )}
    >
      {/* Track background */}
      <div className="race-track h-16 relative">
        {/* Player info */}
        <div className="absolute left-3 top-1/2 -translate-y-1/2 z-10 flex items-center gap-2">
          <span
            className={cn(
              'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold',
              position === 1 && !isEliminated && 'bg-yellow-500 text-black',
              position === 2 && !isEliminated && 'bg-gray-300 text-black',
              position === 3 && !isEliminated && 'bg-amber-600 text-white',
              position > 3 && !isEliminated && 'bg-white/20 text-white',
              isEliminated && 'bg-red-500/50 text-white'
            )}
          >
            {position}
          </span>
          <span
            className={cn(
              'font-semibold text-white text-shadow',
              isCurrentPlayer && 'text-spotify-green'
            )}
          >
            {player.nickname}
          </span>
          {isCurrentPlayer && (
            <span className="text-xs bg-spotify-green/20 text-spotify-green px-2 py-0.5 rounded-full">
              You
            </span>
          )}
          {isDisconnected && !isEliminated && (
            <span className="text-xs bg-yellow-500/20 text-yellow-400 px-2 py-0.5 rounded-full">
              Offline
            </span>
          )}
        </div>

        {/* Submission status */}
        <div className="absolute right-3 top-1/2 -translate-y-1/2 z-10 flex items-center gap-2">
          {!isEliminated && (
            <>
              {hasSubmitted ? (
                <span className="flex items-center gap-1 text-green-400 text-sm">
                  <Check className="w-4 h-4" />
                  Submitted
                </span>
              ) : (
                <span className="flex items-center gap-1 text-white/50 text-sm">
                  <span className="w-2 h-2 bg-white/30 rounded-full animate-pulse" />
                  Guessing...
                </span>
              )}
            </>
          )}
          <span
            className={cn(
              'font-mono font-bold text-lg',
              player.pace >= 8 && 'text-green-400',
              player.pace >= 5 && player.pace < 8 && 'text-yellow-400',
              player.pace < 5 && 'text-red-400'
            )}
          >
            {player.pace}
          </span>
        </div>

        {/* Horse */}
        <div
          className={cn(
            'absolute top-1/2 -translate-y-1/2 transition-all duration-500 ease-out',
            !hasSubmitted && !isEliminated && 'horse-running'
          )}
          style={{ left: `calc(${horsePosition}% - 16px)` }}
        >
          <span className="text-3xl horse-icon">🏇</span>
        </div>

        {/* Eliminated overlay */}
        {isEliminated && (
          <div className="eliminated-overlay">
            <div className="eliminated-text flex items-center gap-2">
              <X className="w-5 h-5" />
              ELIMINATED
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
