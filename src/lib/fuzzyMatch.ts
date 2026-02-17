import stringSimilarity from 'string-similarity';
import type { Artist } from '@/types';

// Words to remove from song titles for better matching
const TITLE_NOISE_WORDS = [
  'remastered',
  'remaster',
  'remix',
  'radio edit',
  'radio version',
  'single version',
  'album version',
  'live',
  'acoustic',
  'instrumental',
  'extended',
  'explicit',
  'clean',
  'version',
  'edit',
  'mix',
  'deluxe',
  'bonus track',
  'original',
  'mono',
  'stereo',
  'anniversary',
  'edition',
  'feat',
  'featuring',
  'ft',
  'with',
];

// Minimum similarity threshold for fuzzy matching
const SIMILARITY_THRESHOLD = 0.75;

// Stricter threshold for very short strings
const SHORT_STRING_THRESHOLD = 0.85;
const SHORT_STRING_LENGTH = 5;

/**
 * Normalize a string for comparison:
 * - lowercase
 * - handle acronyms (P.I.M.P -> pimp)
 * - remove punctuation
 * - remove noise words
 * - trim whitespace
 * - collapse multiple spaces
 */
export function normalizeString(input: string): string {
  let normalized = input.toLowerCase();

  // Remove content in parentheses and brackets (often contains version info)
  normalized = normalized.replace(/\([^)]*\)/g, '');
  normalized = normalized.replace(/\[[^\]]*\]/g, '');

  // Remove everything after common separators that indicate version info
  normalized = normalized.replace(/\s*[-–—]\s*(remastered|remaster|remix|live|acoustic|radio|single|album|version|edit|mix|deluxe|bonus|original|mono|stereo|anniversary|edition|feat|featuring|ft|with).*/gi, '');

  // Handle acronyms: collapse single letters separated by dots/periods (P.I.M.P -> pimp)
  // Match patterns like "a.b.c.d" or "a.b.c" and remove the dots
  normalized = normalized.replace(/\b([a-z])\.([a-z])\.([a-z])\.?([a-z])?\.?([a-z])?\.?([a-z])?\b/gi, '$1$2$3$4$5$6');

  // Also handle patterns like "p. diddy" -> "p diddy" then "pdiddy" for matching
  // Remove standalone periods
  normalized = normalized.replace(/\./g, '');

  // Remove other punctuation (but keep spaces)
  normalized = normalized.replace(/[^\w\s]/g, ' ');

  // Remove noise words
  for (const word of TITLE_NOISE_WORDS) {
    const regex = new RegExp(`\\b${word}\\b`, 'gi');
    normalized = normalized.replace(regex, '');
  }

  // Collapse multiple spaces and trim
  normalized = normalized.replace(/\s+/g, ' ').trim();

  return normalized;
}

/**
 * Calculate similarity between two strings
 */
export function calculateSimilarity(str1: string, str2: string): number {
  const norm1 = normalizeString(str1);
  const norm2 = normalizeString(str2);

  if (norm1 === norm2) {
    return 1;
  }

  // Handle empty strings
  if (!norm1 || !norm2) {
    return 0;
  }

  // Use Dice coefficient for similarity
  return stringSimilarity.compareTwoStrings(norm1, norm2);
}

/**
 * Check if a guessed song title matches the correct title
 */
export function matchSongTitle(guess: string, correct: string): boolean {
  const similarity = calculateSimilarity(guess, correct);
  const normalizedGuess = normalizeString(guess);

  // Use stricter threshold for short strings
  const threshold =
    normalizedGuess.length <= SHORT_STRING_LENGTH
      ? SHORT_STRING_THRESHOLD
      : SIMILARITY_THRESHOLD;

  return similarity >= threshold;
}

/**
 * Check if a guessed artist matches any of the track's artists
 * A guess is correct if it matches ANY explicitly listed artist
 */
export function matchArtist(guess: string, artists: Artist[]): boolean {
  const normalizedGuess = normalizeString(guess);

  if (!normalizedGuess) {
    return false;
  }

  // Check against each artist
  for (const artist of artists) {
    const similarity = calculateSimilarity(guess, artist.name);
    const normalizedArtistName = normalizeString(artist.name);

    // Use stricter threshold for short strings
    const threshold =
      Math.min(normalizedGuess.length, normalizedArtistName.length) <= SHORT_STRING_LENGTH
        ? SHORT_STRING_THRESHOLD
        : SIMILARITY_THRESHOLD;

    if (similarity >= threshold) {
      return true;
    }

    // Also check if the guess is contained in the artist name or vice versa
    // This helps with cases like "Travis Scott" matching "Travis"
    if (
      normalizedArtistName.includes(normalizedGuess) ||
      normalizedGuess.includes(normalizedArtistName)
    ) {
      // Only accept if the contained string is a significant portion
      const ratio = Math.min(normalizedGuess.length, normalizedArtistName.length) /
        Math.max(normalizedGuess.length, normalizedArtistName.length);
      if (ratio >= 0.5) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Parse featured artists from a string
 * Handles formats like "Artist ft. Other" or "Artist feat. Other" or "Artist & Other"
 */
export function parseArtistsFromString(artistString: string): string[] {
  // Split on common featuring patterns
  const parts = artistString
    .split(/\s*(?:feat\.?|ft\.?|featuring|&|,|and|x|\/)\s*/i)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  return parts;
}

/**
 * Score a player's answer against the correct track
 * Returns: 'BOTH' | 'ONE' | 'NONE'
 */
export function scoreAnswer(
  songGuess: string,
  artistGuess: string,
  correctTitle: string,
  correctArtists: Artist[]
): { result: 'BOTH' | 'ONE' | 'NONE'; songCorrect: boolean; artistCorrect: boolean } {
  const songCorrect = matchSongTitle(songGuess, correctTitle);
  const artistCorrect = matchArtist(artistGuess, correctArtists);

  let result: 'BOTH' | 'ONE' | 'NONE';
  if (songCorrect && artistCorrect) {
    result = 'BOTH';
  } else if (songCorrect || artistCorrect) {
    result = 'ONE';
  } else {
    result = 'NONE';
  }

  return { result, songCorrect, artistCorrect };
}

/**
 * Get the pace change based on the round result
 */
export function getPaceChange(result: 'BOTH' | 'ONE' | 'NONE'): number {
  switch (result) {
    case 'BOTH':
      return 1;
    case 'ONE':
      return 0;
    case 'NONE':
      return -3;
  }
}

/**
 * Clamp pace to valid range
 */
export function clampPace(pace: number): number {
  return Math.max(0, Math.min(10, pace));
}

/**
 * Calculate elimination threshold for a given round
 */
export function getEliminationThreshold(round: number): number {
  // Rounds 1-6: threshold 10
  // Rounds 7-12: threshold 9
  // Rounds 13-18: threshold 8
  // etc., minimum 1
  const period = Math.floor((round - 1) / 6);
  const threshold = 10 - period;
  return Math.max(1, threshold);
}

/**
 * Check which players should be eliminated
 */
export function checkEliminations(
  players: Map<string, { pace: number; isEliminated: boolean }>,
  round: number
): string[] {
  // Only check every 6 rounds
  if (round % 6 !== 0) {
    return [];
  }

  const threshold = getEliminationThreshold(round);
  const activePlayers = Array.from(players.entries()).filter(
    ([_, player]) => !player.isEliminated
  );

  if (activePlayers.length <= 1) {
    return [];
  }

  // Find the leader's pace
  const leaderPace = Math.max(...activePlayers.map(([_, p]) => p.pace));

  // Find players to eliminate
  const toEliminate: string[] = [];
  for (const [playerId, player] of activePlayers) {
    const gap = leaderPace - player.pace;
    if (gap >= threshold) {
      toEliminate.push(playerId);
    }
  }

  return toEliminate;
}
