'use client';

import { cn } from '@/lib/utils';
import { Clock, Users, Hash, Music } from 'lucide-react';

interface GameHeaderProps {
  roomCode: string;
  roundNumber: number;
  timeLeft: number;
  totalPlayers: number;
  activePlayers: number;
}

export default function GameHeader({
  roomCode,
  roundNumber,
  timeLeft,
  totalPlayers,
  activePlayers,
}: GameHeaderProps) {
  const isUrgent = timeLeft <= 10;
  const isCritical = timeLeft <= 5;

  // Calculate next elimination round
  const nextElimination = Math.ceil(roundNumber / 6) * 6;
  const roundsToElimination = nextElimination - roundNumber;

  return (
    <div className="bg-black/40 backdrop-blur-lg border-b border-white/10">
      <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
        {/* Left: Room info */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🏇</span>
            <span className="font-mono text-white/60">{roomCode}</span>
          </div>
        </div>

        {/* Center: Round info */}
        <div className="flex items-center gap-6">
          <div className="text-center">
            <div className="flex items-center gap-1 text-white/60 text-sm">
              <Hash className="w-4 h-4" />
              Round
            </div>
            <div className="font-bold text-xl">{roundNumber}</div>
          </div>

          <div className="text-center">
            <div className="flex items-center gap-1 text-white/60 text-sm">
              <Clock className="w-4 h-4" />
              Time
            </div>
            <div
              className={cn(
                'font-mono font-bold text-xl',
                isUrgent && 'text-yellow-400',
                isCritical && 'text-red-400 animate-pulse'
              )}
            >
              {timeLeft}s
            </div>
          </div>

          <div className="text-center">
            <div className="flex items-center gap-1 text-white/60 text-sm">
              <Users className="w-4 h-4" />
              Active
            </div>
            <div className="font-bold text-xl">
              {activePlayers}/{totalPlayers}
            </div>
          </div>
        </div>

        {/* Right: Elimination warning */}
        <div className="text-right">
          {roundsToElimination === 0 ? (
            <div className="bg-red-500/20 text-red-400 px-3 py-1 rounded-full text-sm font-semibold animate-pulse">
              Elimination Check!
            </div>
          ) : (
            <div className="text-white/40 text-sm">
              Elimination in {roundsToElimination} round{roundsToElimination !== 1 ? 's' : ''}
            </div>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="progress-bar">
        <div
          className={cn(
            'progress-fill',
            isUrgent && 'bg-yellow-400',
            isCritical && 'bg-red-400'
          )}
          style={{ width: `${(timeLeft / 60) * 100}%` }}
        />
      </div>
    </div>
  );
}
