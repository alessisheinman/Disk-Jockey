'use client';

import { useEffect, useState } from 'react';
import type { EliminatedPlayer } from '@/types';
import { cn } from '@/lib/utils';
import { Skull, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface EliminationScreenProps {
  round: number;
  threshold: number;
  leaderPace: number;
  eliminated: EliminatedPlayer[];
  currentPlayerId: string;
}

export default function EliminationScreen({
  round,
  threshold,
  leaderPace,
  eliminated,
  currentPlayerId,
}: EliminationScreenProps) {
  const [showList, setShowList] = useState(false);

  // Check if current player was eliminated
  const wasEliminated = eliminated.some((e) => e.playerId === currentPlayerId);

  useEffect(() => {
    const timer = setTimeout(() => setShowList(true), 500);
    return () => clearTimeout(timer);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-30 bg-black/90 flex items-center justify-center p-4"
    >
      <div className="max-w-md w-full space-y-6">
        {/* Header */}
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="text-center"
        >
          <div className={cn(
            'inline-block p-4 rounded-full mb-4',
            eliminated.length > 0 ? 'bg-red-500/20' : 'bg-green-500/20'
          )}>
            {eliminated.length > 0 ? (
              <Skull className="w-12 h-12 text-red-400" />
            ) : (
              <AlertTriangle className="w-12 h-12 text-green-400" />
            )}
          </div>

          <h2 className="text-2xl font-bold mb-2">
            Elimination Check
          </h2>
          <p className="text-white/60">
            Round {round} - Threshold: {threshold} behind leader
          </p>
          <p className="text-white/40 text-sm mt-1">
            Leader pace: {leaderPace}
          </p>
        </motion.div>

        {/* Eliminated players */}
        <AnimatePresence>
          {showList && eliminated.length > 0 && (
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className="card"
            >
              <h3 className="text-lg font-semibold mb-4 text-red-400 text-center">
                {eliminated.length} Player{eliminated.length > 1 ? 's' : ''} Eliminated
              </h3>
              <div className="space-y-2">
                {eliminated.map((player, index) => (
                  <motion.div
                    key={player.playerId}
                    initial={{ x: -20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ delay: index * 0.15 }}
                    className={cn(
                      'flex items-center justify-between p-3 rounded-lg bg-red-500/10 border border-red-500/30',
                      player.playerId === currentPlayerId && 'ring-2 ring-red-500'
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <Skull className="w-5 h-5 text-red-400" />
                      <span className="font-semibold">{player.nickname}</span>
                      {player.playerId === currentPlayerId && (
                        <span className="text-xs text-red-400">(You)</span>
                      )}
                    </div>
                    <div className="text-sm text-white/60">
                      Pace: {player.pace} (Gap: {player.gap})
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}

          {showList && eliminated.length === 0 && (
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className="card text-center"
            >
              <h3 className="text-lg font-semibold text-green-400 mb-2">
                No Eliminations!
              </h3>
              <p className="text-white/60">
                Everyone stays in the race. Keep it up!
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Personal elimination message */}
        {wasEliminated && (
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.8 }}
            className="card bg-red-500/20 border border-red-500/30 text-center"
          >
            <p className="text-red-400 font-semibold">
              You have been eliminated!
            </p>
            <p className="text-white/60 text-sm mt-1">
              You can still watch the rest of the race.
            </p>
          </motion.div>
        )}

        {/* Continue message */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
          className="text-center text-white/40 text-sm"
        >
          Next round starting soon...
        </motion.p>
      </div>
    </motion.div>
  );
}
