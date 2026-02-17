'use client';

import { useEffect, useState } from 'react';
import type { Track, PlayerRoundResult } from '@/types';
import { cn } from '@/lib/utils';
import { Check, X, Minus, Music, User, TrendingUp, TrendingDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface RoundRevealProps {
  track: Track;
  results: PlayerRoundResult[];
  currentPlayerId: string;
}

export default function RoundReveal({
  track,
  results,
  currentPlayerId,
}: RoundRevealProps) {
  const [showResults, setShowResults] = useState(false);

  useEffect(() => {
    // Show results after a short delay
    const timer = setTimeout(() => setShowResults(true), 500);
    return () => clearTimeout(timer);
  }, []);

  // Sort results by new pace (descending)
  const sortedResults = [...results].sort((a, b) => b.newPace - a.newPace);

  // Get current player's result
  const myResult = results.find((r) => r.playerId === currentPlayerId);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-30 bg-black/90 flex items-center justify-center p-4 overflow-auto"
    >
      <div className="max-w-2xl w-full space-y-6">
        {/* Correct answer reveal */}
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="card text-center"
        >
          <p className="text-white/60 text-sm mb-2">The correct answer was</p>

          <div className="flex items-center justify-center gap-4 mb-4">
            {track.albumImageUrl && (
              <img
                src={track.albumImageUrl}
                alt={track.albumName}
                className="w-20 h-20 rounded-lg shadow-lg"
              />
            )}
            <div className="text-left">
              <h2 className="text-2xl font-bold text-spotify-green">{track.name}</h2>
              <p className="text-white/70 text-lg">
                {track.artists.map((a) => a.name).join(', ')}
              </p>
              <p className="text-white/40 text-sm">{track.albumName}</p>
            </div>
          </div>

          {/* Current player result highlight */}
          {myResult && (
            <div
              className={cn(
                'inline-flex items-center gap-3 px-4 py-2 rounded-full',
                myResult.result === 'BOTH' && 'bg-green-500/20 text-green-400',
                myResult.result === 'ONE' && 'bg-yellow-500/20 text-yellow-400',
                myResult.result === 'NONE' && 'bg-red-500/20 text-red-400'
              )}
            >
              <span className="font-semibold">
                {myResult.result === 'BOTH' && 'Perfect! +1 pace'}
                {myResult.result === 'ONE' && 'Half right! No change'}
                {myResult.result === 'NONE' && 'Wrong! -3 pace'}
              </span>
              {myResult.result === 'BOTH' && <TrendingUp className="w-5 h-5" />}
              {myResult.result === 'ONE' && <Minus className="w-5 h-5" />}
              {myResult.result === 'NONE' && <TrendingDown className="w-5 h-5" />}
            </div>
          )}
        </motion.div>

        {/* All results */}
        <AnimatePresence>
          {showResults && (
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="card"
            >
              <h3 className="text-lg font-semibold mb-4">Round Results</h3>
              <div className="space-y-2">
                {sortedResults.map((result, index) => (
                  <motion.div
                    key={result.playerId}
                    initial={{ x: -20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ delay: 0.6 + index * 0.1 }}
                    className={cn(
                      'flex items-center justify-between p-3 rounded-lg',
                      result.playerId === currentPlayerId
                        ? 'bg-spotify-green/20 border border-spotify-green/30'
                        : 'bg-white/5'
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-semibold">{result.nickname}</span>
                      {result.playerId === currentPlayerId && (
                        <span className="text-xs text-spotify-green">(You)</span>
                      )}
                    </div>

                    <div className="flex items-center gap-4">
                      {/* Answer indicators */}
                      <div className="flex items-center gap-2 text-sm">
                        <span
                          className={cn(
                            'flex items-center gap-1',
                            result.songCorrect ? 'text-green-400' : 'text-red-400'
                          )}
                        >
                          <Music className="w-4 h-4" />
                          {result.songCorrect ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                        </span>
                        <span
                          className={cn(
                            'flex items-center gap-1',
                            result.artistCorrect ? 'text-green-400' : 'text-red-400'
                          )}
                        >
                          <User className="w-4 h-4" />
                          {result.artistCorrect ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                        </span>
                      </div>

                      {/* Pace change */}
                      <span
                        className={cn(
                          'font-mono font-bold',
                          result.paceChange > 0 && 'text-green-400',
                          result.paceChange === 0 && 'text-yellow-400',
                          result.paceChange < 0 && 'text-red-400'
                        )}
                      >
                        {result.paceChange > 0 ? '+' : ''}{result.paceChange}
                      </span>

                      {/* New pace */}
                      <span className="font-mono text-white/60 w-8 text-right">
                        {result.newPace}
                      </span>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
