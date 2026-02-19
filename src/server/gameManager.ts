import type { Server } from 'socket.io';
import type {
  Room,
  Player,
  Track,
  RoundResult,
  PlayerRoundResult,
  EliminatedPlayer,
  ServerToClientEvents,
  ClientToServerEvents,
} from '../types';
import { roomManager } from './roomManager';
import { spotifyService } from './spotifyService';
import {
  scoreAnswer,
  getPaceChange,
  clampPace,
  getEliminationThreshold,
  checkEliminations,
} from '../lib/fuzzyMatch';

const GAME_CONSTANTS = {
  MIN_PLAYERS: 2,
  MAX_PLAYERS: 10,
  STARTING_PACE: 10,
  MIN_PACE: 0,
  MAX_PACE: 10,
  ROUND_DURATION_MS: 60000,
  REVEAL_DURATION_MS: 8000,
  COUNTDOWN_DURATION_MS: 5000,
  ELIMINATION_INTERVAL: 6,
};

class GameManager {
  private io: Server<ClientToServerEvents, ServerToClientEvents> | null = null;
  private roundTimers: Map<string, NodeJS.Timeout> = new Map();
  private revealTimers: Map<string, NodeJS.Timeout> = new Map();

  setIO(io: Server<ClientToServerEvents, ServerToClientEvents>): void {
    this.io = io;
  }

  /**
   * Start the game
   */
  async startGame(roomCode: string): Promise<{ success: boolean; error?: string }> {
    console.log('[startGame] Starting game for room:', roomCode);
    const room = roomManager.getRoom(roomCode);
    if (!room) {
      return { success: false, error: 'Room not found' };
    }

    // Validate room state
    if (room.gameState.status !== 'LOBBY') {
      return { success: false, error: 'Game already in progress' };
    }

    const activePlayers = Array.from(room.players.values()).filter(
      (p) => p.isConnected
    );

    if (activePlayers.length < GAME_CONSTANTS.MIN_PLAYERS) {
      return { success: false, error: `Need at least ${GAME_CONSTANTS.MIN_PLAYERS} players to start` };
    }

    if (!room.spotifyAuth) {
      return { success: false, error: 'Spotify not connected' };
    }

    if (!room.playlistId || !room.playlist) {
      return { success: false, error: 'No playlist loaded' };
    }

    // Reset all players for new game
    for (const player of room.players.values()) {
      player.pace = GAME_CONSTANTS.STARTING_PACE;
      player.isEliminated = false;
      player.currentAnswer = null;
      player.hasSubmitted = false;
      player.lastRoundResult = null;
    }

    // Reset used tracks
    room.usedTrackIds.clear();

    // Update game state
    room.gameState.status = 'STARTING';
    room.gameState.currentRound = 0;
    room.gameState.isPaused = false;
    room.gameState.pauseReason = null;
    room.gameState.winnerId = null;

    // Emit game starting
    console.log('[startGame] Emitting gameStarting event');
    this.io?.to(roomCode).emit('gameStarting', {
      startsIn: GAME_CONSTANTS.COUNTDOWN_DURATION_MS,
    });

    // Start first round after countdown
    setTimeout(() => {
      this.startNextRound(roomCode);
    }, GAME_CONSTANTS.COUNTDOWN_DURATION_MS);

    return { success: true };
  }

  /**
   * Start the next round
   */
  private async startNextRound(roomCode: string): Promise<void> {
    console.log('[startNextRound] Starting next round for room:', roomCode);
    const room = roomManager.getRoom(roomCode);
    if (!room) {
      console.log('[startNextRound] Room not found');
      return;
    }

    // Check if game is paused
    if (room.gameState.isPaused) {
      return;
    }

    // Check for winner
    const activePlayers = Array.from(room.players.values()).filter(
      (p) => !p.isEliminated && p.isConnected
    );

    if (activePlayers.length <= 1) {
      this.endGame(roomCode, activePlayers[0]?.id || null);
      return;
    }

    // Fetch track on-demand from Spotify API
    if (!room.spotifyAuth || !room.playlistId || !room.playlist) {
      this.endGame(roomCode, null);
      return;
    }

    room.spotifyAuth = await spotifyService.ensureValidToken(room.spotifyAuth);

    console.log('[startNextRound] Fetching random track...');
    let track = await spotifyService.getRandomTrack(
      room.spotifyAuth.accessToken,
      room.playlistId,
      room.playlist.trackCount,
      room.usedTrackIds
    );

    if (!track) {
      console.log('[startNextRound] First track fetch returned null, clearing usedTrackIds');
      room.usedTrackIds.clear();
      track = await spotifyService.getRandomTrack(
        room.spotifyAuth.accessToken,
        room.playlistId,
        room.playlist.trackCount,
        room.usedTrackIds
      );
    }

    if (!track) {
      console.log('[startNextRound] Second track fetch returned null, ending game');
      this.endGame(roomCode, null);
      return;
    }

    room.usedTrackIds.add(track.id);
    room.gameState.currentTrack = track;
    // Reset player answers for new round
    for (const player of room.players.values()) {
      player.currentAnswer = null;
      player.hasSubmitted = false;
      player.lastRoundResult = null;
    }

    // Update game state
    room.gameState.currentRound++;
    room.gameState.status = 'PLAYING';
    room.gameState.roundStartTime = Date.now();
    room.gameState.roundEndTime = Date.now() + room.settings.roundDurationMs;

    // Emit round started (only send track URI, not name/artist)
    this.io?.to(roomCode).emit('roundStarted', {
      roundNumber: room.gameState.currentRound,
      durationMs: room.settings.roundDurationMs,
      trackUri: room.gameState.currentTrack!.uri,
    });

    // Send playback command to host
    const host = room.players.get(room.hostId);
    if (host?.socketId) {
      this.io?.to(host.socketId).emit('playbackCommand', {
        command: 'play',
        trackUri: room.gameState.currentTrack!.uri,
        positionMs: 0,
      });
    }

    // Set round timer
    const roundTimer = setTimeout(() => {
      this.endRound(roomCode);
    }, room.settings.roundDurationMs);

    this.roundTimers.set(roomCode, roundTimer);
  }

  /**
   * Submit a player's answer
   */
  submitAnswer(
    socketId: string,
    songTitle: string,
    artist: string
  ): { success: boolean; error?: string } {
    const room = roomManager.getRoomBySocketId(socketId);
    if (!room) {
      return { success: false, error: 'Room not found' };
    }

    const playerId = roomManager.getPlayerIdBySocketId(socketId);
    if (!playerId) {
      return { success: false, error: 'Player not found' };
    }

    const player = room.players.get(playerId);
    if (!player) {
      return { success: false, error: 'Player not found' };
    }

    if (player.isEliminated) {
      return { success: false, error: 'Player is eliminated' };
    }

    if (room.gameState.status !== 'PLAYING') {
      return { success: false, error: 'Game is not in playing state' };
    }

    // Record answer
    player.currentAnswer = {
      songTitle,
      artist,
      submittedAt: Date.now(),
    };
    player.hasSubmitted = true;

    // Notify other players
    this.io?.to(room.code).emit('playerSubmitted', {
      playerId: player.id,
      nickname: player.nickname,
    });

    // Check if all active players have submitted
    const activePlayers = Array.from(room.players.values()).filter(
      (p) => !p.isEliminated && p.isConnected
    );
    const allSubmitted = activePlayers.every((p) => p.hasSubmitted);

    if (allSubmitted) {
      // End round early
      const timer = this.roundTimers.get(room.code);
      if (timer) {
        clearTimeout(timer);
        this.roundTimers.delete(room.code);
      }
      this.endRound(room.code);
    }

    return { success: true };
  }

  /**
   * End the current round
   */
  private async endRound(roomCode: string): Promise<void> {
    const room = roomManager.getRoom(roomCode);
    if (!room || !room.gameState.currentTrack) return;

    // Clear round timer
    const timer = this.roundTimers.get(roomCode);
    if (timer) {
      clearTimeout(timer);
      this.roundTimers.delete(roomCode);
    }

    // Stop playback
    const host = room.players.get(room.hostId);
    if (host?.socketId) {
      this.io?.to(host.socketId).emit('playbackCommand', {
        command: 'stop',
      });
    }

    room.gameState.status = 'ROUND_REVEAL';

    const track = room.gameState.currentTrack;
    const results: PlayerRoundResult[] = [];

    // Score each player
    for (const player of room.players.values()) {
      if (player.isEliminated) continue;

      let result: RoundResult;
      let songCorrect = false;
      let artistCorrect = false;

      if (player.currentAnswer) {
        const scored = scoreAnswer(
          player.currentAnswer.songTitle,
          player.currentAnswer.artist,
          track.name,
          track.artists
        );
        result = scored.result;
        songCorrect = scored.songCorrect;
        artistCorrect = scored.artistCorrect;
      } else {
        // No answer submitted = wrong
        result = 'NONE';
      }

      const paceChange = getPaceChange(result);
      const newPace = clampPace(player.pace + paceChange);

      player.pace = newPace;
      player.lastRoundResult = result;

      results.push({
        playerId: player.id,
        nickname: player.nickname,
        answer: player.currentAnswer,
        result,
        paceChange,
        newPace,
        songCorrect,
        artistCorrect,
      });
    }

    // Emit round results
    this.io?.to(roomCode).emit('roundEnded', {
      track,
      results,
      nextRoundIn: room.settings.revealDurationMs,
    });

    // Check for eliminations every 6 rounds
    if (room.gameState.currentRound % 6 === 0) {
      const revealTimer = setTimeout(() => {
        this.checkEliminations(roomCode);
      }, room.settings.revealDurationMs);
      this.revealTimers.set(roomCode, revealTimer);
    } else {
      // Start next round after reveal
      const revealTimer = setTimeout(() => {
        this.startNextRound(roomCode);
      }, room.settings.revealDurationMs);
      this.revealTimers.set(roomCode, revealTimer);
    }
  }

  /**
   * Check and process eliminations
   */
  private checkEliminations(roomCode: string): void {
    const room = roomManager.getRoom(roomCode);
    if (!room) return;

    room.gameState.status = 'ELIMINATION_CHECK';

    const round = room.gameState.currentRound;
    const threshold = getEliminationThreshold(round);

    const activePlayers = Array.from(room.players.values()).filter(
      (p) => !p.isEliminated
    );

    if (activePlayers.length <= 1) {
      this.endGame(roomCode, activePlayers[0]?.id || null);
      return;
    }

    const leaderPace = Math.max(...activePlayers.map((p) => p.pace));
    const eliminated: EliminatedPlayer[] = [];
    const survivors: string[] = [];

    for (const player of activePlayers) {
      const gap = leaderPace - player.pace;
      if (gap >= threshold) {
        player.isEliminated = true;
        eliminated.push({
          playerId: player.id,
          nickname: player.nickname,
          pace: player.pace,
          gap,
        });
      } else {
        survivors.push(player.id);
      }
    }

    // Emit elimination results
    this.io?.to(roomCode).emit('eliminationCheck', {
      round,
      threshold,
      leaderPace,
      eliminated,
      survivors,
    });

    // Check for winner after eliminations
    const remainingPlayers = Array.from(room.players.values()).filter(
      (p) => !p.isEliminated
    );

    if (remainingPlayers.length <= 1) {
      setTimeout(() => {
        this.endGame(roomCode, remainingPlayers[0]?.id || null);
      }, 3000);
    } else {
      // Continue game
      setTimeout(() => {
        this.startNextRound(roomCode);
      }, 3000);
    }
  }

  /**
   * End the game
   */
  private endGame(roomCode: string, winnerId: string | null): void {
    const room = roomManager.getRoom(roomCode);
    if (!room) return;

    room.gameState.status = 'GAME_OVER';
    room.gameState.winnerId = winnerId;

    // Stop any playback
    const host = room.players.get(room.hostId);
    if (host?.socketId) {
      this.io?.to(host.socketId).emit('playbackCommand', {
        command: 'stop',
      });
    }

    // Build final standings
    const finalStandings = Array.from(room.players.values())
      .map((p) => ({
        playerId: p.id,
        nickname: p.nickname,
        pace: p.pace,
        eliminatedRound: p.isEliminated ? room.gameState.currentRound : null,
      }))
      .sort((a, b) => {
        // Winner first, then by elimination round (null = not eliminated)
        if (a.playerId === winnerId) return -1;
        if (b.playerId === winnerId) return 1;
        if (a.eliminatedRound === null && b.eliminatedRound !== null) return -1;
        if (a.eliminatedRound !== null && b.eliminatedRound === null) return 1;
        if (a.eliminatedRound !== null && b.eliminatedRound !== null) {
          return b.eliminatedRound - a.eliminatedRound;
        }
        return b.pace - a.pace;
      });

    const winner = winnerId ? room.players.get(winnerId) : null;

    this.io?.to(roomCode).emit('gameOver', {
      winnerId: winnerId || '',
      winnerNickname: winner?.nickname || 'No winner',
      finalStandings,
    });
  }

  /**
   * Restart the game
   */
  restartGame(socketId: string): { success: boolean; error?: string } {
    const room = roomManager.getRoomBySocketId(socketId);
    if (!room) {
      return { success: false, error: 'Room not found' };
    }

    const player = roomManager.getPlayerBySocketId(socketId);
    if (!player?.isHost) {
      return { success: false, error: 'Only host can restart' };
    }

    // Clear any timers
    const roundTimer = this.roundTimers.get(room.code);
    if (roundTimer) {
      clearTimeout(roundTimer);
      this.roundTimers.delete(room.code);
    }

    const revealTimer = this.revealTimers.get(room.code);
    if (revealTimer) {
      clearTimeout(revealTimer);
      this.revealTimers.delete(room.code);
    }

    // Reset game state
    room.gameState = {
      status: 'LOBBY',
      currentRound: 0,
      currentTrack: null,
      roundStartTime: null,
      roundEndTime: null,
      isPaused: false,
      pauseReason: null,
      winnerId: null,
    };

    // Reset players
    for (const p of room.players.values()) {
      p.pace = GAME_CONSTANTS.STARTING_PACE;
      p.isEliminated = false;
      p.currentAnswer = null;
      p.hasSubmitted = false;
      p.lastRoundResult = null;
    }

    // Emit room update
    this.io?.to(room.code).emit('roomUpdated', {
      room: roomManager.serializeRoom(room),
    });

    return { success: true };
  }

  /**
   * Resume game after host reconnects
   */
  resumeGame(roomCode: string): void {
    const room = roomManager.getRoom(roomCode);
    if (!room) return;

    if (room.gameState.isPaused) {
      room.gameState.isPaused = false;
      room.gameState.pauseReason = null;

      this.io?.to(roomCode).emit('gameResumed');

      // Continue with next round
      if (room.gameState.status === 'PLAYING') {
        this.startNextRound(roomCode);
      }
    }
  }
}

export const gameManager = new GameManager();
