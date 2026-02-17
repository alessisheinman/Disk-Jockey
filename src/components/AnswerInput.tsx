'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AnswerInputProps {
  onSubmit: (songTitle: string, artist: string) => void;
  hasSubmitted: boolean;
  timeLeft: number;
}

export default function AnswerInput({
  onSubmit,
  hasSubmitted,
  timeLeft,
}: AnswerInputProps) {
  const [songTitle, setSongTitle] = useState('');
  const [artist, setArtist] = useState('');
  const songInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Focus song input when round starts
    if (!hasSubmitted) {
      songInputRef.current?.focus();
    }
  }, [hasSubmitted]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasSubmitted) {
      onSubmit(songTitle.trim(), artist.trim());
    }
  };

  // Time urgency colors
  const isUrgent = timeLeft <= 10;
  const isCritical = timeLeft <= 5;

  if (hasSubmitted) {
    return (
      <div className="max-w-2xl mx-auto text-center py-4">
        <div className="inline-flex items-center gap-2 bg-green-500/20 text-green-400 px-4 py-2 rounded-full">
          <Send className="w-4 h-4" />
          Answer submitted! Waiting for others...
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold">What song is this?</h3>
        <div
          className={cn(
            'flex items-center gap-2 font-mono text-lg',
            isUrgent && 'text-yellow-400',
            isCritical && 'text-red-400 animate-pulse'
          )}
        >
          <Clock className="w-5 h-5" />
          {timeLeft}s
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
        <div>
          <label className="block text-sm text-white/60 mb-1">Song Title</label>
          <input
            ref={songInputRef}
            type="text"
            value={songTitle}
            onChange={(e) => setSongTitle(e.target.value)}
            placeholder="Enter song title..."
            className="input-field"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck="false"
          />
        </div>
        <div>
          <label className="block text-sm text-white/60 mb-1">Artist</label>
          <input
            type="text"
            value={artist}
            onChange={(e) => setArtist(e.target.value)}
            placeholder="Enter artist name..."
            className="input-field"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck="false"
          />
        </div>
      </div>

      <button
        type="submit"
        className={cn(
          'btn-primary w-full flex items-center justify-center gap-2',
          isUrgent && 'animate-pulse'
        )}
      >
        <Send className="w-5 h-5" />
        Submit Answer
      </button>

      <p className="text-center text-white/40 text-sm mt-2">
        Tip: Get both correct for +1, one correct for 0, none correct for -3
      </p>
    </form>
  );
}
