'use client';

import { useEffect, useRef, useState } from 'react';
import type { FinalStanding } from '@/types';
import { cn } from '@/lib/utils';
import { Trophy, Medal, RotateCcw, Home } from 'lucide-react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';

interface VictoryScreenProps {
  winnerId: string;
  winnerNickname: string;
  finalStandings: FinalStanding[];
  isHost: boolean;
  onRestart: () => void;
  currentPlayerId: string;
}

export default function VictoryScreen({
  winnerId,
  winnerNickname,
  finalStandings,
  isHost,
  onRestart,
  currentPlayerId,
}: VictoryScreenProps) {
  const router = useRouter();
  const [showConfetti, setShowConfetti] = useState(true);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Check if current player is the winner
  const isWinner = currentPlayerId === winnerId;

  useEffect(() => {
    // Play victory sounds
    try {
      // Trumpet fanfare
      const trumpet = new Audio('/sounds/trumpet.mp3');
      trumpet.volume = 0.5;
      trumpet.play().catch(() => {});

      // Crowd applause
      setTimeout(() => {
        const applause = new Audio('/sounds/applause.mp3');
        applause.volume = 0.3;
        applause.play().catch(() => {});
      }, 500);
    } catch (e) {
      // Audio playback failed, ignore
    }

    // Stop confetti after a few seconds
    const timer = setTimeout(() => setShowConfetti(false), 5000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="fixed inset-0 z-50 bg-gradient-to-b from-black via-spotify-black to-black flex items-center justify-center overflow-auto">
      {/* Confetti */}
      {showConfetti && <Confetti />}

      <div className="max-w-lg w-full p-6 space-y-8">
        {/* Trophy */}
        <motion.div
          initial={{ scale: 0, rotate: -180 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', delay: 0.2 }}
          className="text-center"
        >
          <div className="inline-block p-6 bg-yellow-500/20 rounded-full mb-4">
            <Trophy className="w-20 h-20 text-yellow-400" />
          </div>
        </motion.div>

        {/* Winner announcement */}
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="text-center"
        >
          <p className="text-white/60 text-lg mb-2">
            {isWinner ? 'Congratulations!' : 'The winner is'}
          </p>
          <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-yellow-400 via-yellow-200 to-yellow-400 bg-clip-text text-transparent">
            {winnerNickname}
          </h1>
          {isWinner && (
            <p className="text-spotify-green text-xl mt-2">You won! 🎉</p>
          )}
        </motion.div>

        {/* Final standings */}
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.8 }}
          className="card"
        >
          <h3 className="text-lg font-semibold mb-4 text-center">Final Standings</h3>
          <div className="space-y-2">
            {finalStandings.map((standing, index) => (
              <div
                key={standing.playerId}
                className={cn(
                  'flex items-center justify-between p-3 rounded-lg',
                  index === 0 && 'bg-yellow-500/20 border border-yellow-500/30',
                  index === 1 && 'bg-gray-300/10 border border-gray-300/30',
                  index === 2 && 'bg-amber-600/20 border border-amber-600/30',
                  index > 2 && 'bg-white/5',
                  standing.playerId === currentPlayerId && 'ring-2 ring-spotify-green'
                )}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={cn(
                      'w-8 h-8 rounded-full flex items-center justify-center font-bold',
                      index === 0 && 'bg-yellow-500 text-black',
                      index === 1 && 'bg-gray-300 text-black',
                      index === 2 && 'bg-amber-600 text-white',
                      index > 2 && 'bg-white/20 text-white'
                    )}
                  >
                    {index === 0 && <Trophy className="w-4 h-4" />}
                    {index === 1 && <Medal className="w-4 h-4" />}
                    {index === 2 && <Medal className="w-4 h-4" />}
                    {index > 2 && index + 1}
                  </span>
                  <span className="font-semibold">{standing.nickname}</span>
                  {standing.playerId === currentPlayerId && (
                    <span className="text-xs text-spotify-green">(You)</span>
                  )}
                </div>
                <div className="flex items-center gap-4 text-sm">
                  {standing.eliminatedRound !== null && (
                    <span className="text-red-400/70">
                      Eliminated R{standing.eliminatedRound}
                    </span>
                  )}
                  <span className="font-mono text-white/60">
                    Pace: {standing.pace}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Actions */}
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 1.1 }}
          className="flex gap-4"
        >
          <button
            onClick={() => router.push('/')}
            className="btn-secondary flex-1 flex items-center justify-center gap-2"
          >
            <Home className="w-5 h-5" />
            Leave
          </button>
          {isHost && (
            <button
              onClick={onRestart}
              className="btn-primary flex-1 flex items-center justify-center gap-2"
            >
              <RotateCcw className="w-5 h-5" />
              Play Again
            </button>
          )}
        </motion.div>
      </div>
    </div>
  );
}

// Confetti component
function Confetti() {
  const colors = ['#FFD700', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8'];
  const pieces = Array.from({ length: 50 }, (_, i) => ({
    id: i,
    color: colors[Math.floor(Math.random() * colors.length)],
    left: Math.random() * 100,
    delay: Math.random() * 2,
    duration: 2 + Math.random() * 2,
  }));

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden">
      {pieces.map((piece) => (
        <div
          key={piece.id}
          className="confetti-piece"
          style={{
            backgroundColor: piece.color,
            left: `${piece.left}%`,
            animationDelay: `${piece.delay}s`,
            animationDuration: `${piece.duration}s`,
          }}
        />
      ))}
    </div>
  );
}
