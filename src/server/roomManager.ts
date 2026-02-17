import { v4 as uuidv4 } from 'uuid';
import type {
  Room,
  Player,
  GameState,
  SerializedRoom,
  RoomSettings,
} from '../types';

// Generate a random 4-character room code
function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Avoid confusing characters
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

class RoomManager {
  private rooms: Map<string, Room> = new Map();
  private playerToRoom: Map<string, string> = new Map();
  private socketToPlayer: Map<string, string> = new Map();

  /**
   * Create a new room
   */
  createRoom(hostNickname: string, socketId: string): { room: Room; playerId: string } {
    // Generate unique room code
    let code: string;
    do {
      code = generateRoomCode();
    } while (this.rooms.has(code));

    const playerId = uuidv4();
    const host: Player = {
      id: playerId,
      nickname: hostNickname,
      pace: 10,
      isHost: true,
      isEliminated: false,
      isConnected: true,
      socketId: socketId,
      currentAnswer: null,
      hasSubmitted: false,
      lastRoundResult: null,
    };

    const gameState: GameState = {
      status: 'LOBBY',
      currentRound: 0,
      currentTrack: null,
      roundStartTime: null,
      roundEndTime: null,
      isPaused: false,
      pauseReason: null,
      winnerId: null,
    };

    const settings: RoomSettings = {
      maxPlayers: 10,
      roundDurationMs: 60000,
      revealDurationMs: 8000,
    };

    const room: Room = {
      code,
      hostId: playerId,
      players: new Map([[playerId, host]]),
      gameState,
      spotifyAuth: null,
      playlist: null,
      tracks: [],
      usedTrackIds: new Set(),
      createdAt: Date.now(),
      settings,
    };

    this.rooms.set(code, room);
    this.playerToRoom.set(playerId, code);
    this.socketToPlayer.set(socketId, playerId);

    return { room, playerId };
  }

  /**
   * Join an existing room
   */
  joinRoom(
    roomCode: string,
    nickname: string,
    socketId: string
  ): { room: Room; playerId: string; isRejoin: boolean } | null {
    const room = this.rooms.get(roomCode.toUpperCase());
    if (!room) {
      return null;
    }

    // Check if this is a rejoin (same nickname)
    for (const [playerId, player] of room.players) {
      if (player.nickname.toLowerCase() === nickname.toLowerCase()) {
        // Rejoin existing player
        player.isConnected = true;
        player.socketId = socketId;
        this.socketToPlayer.set(socketId, playerId);
        return { room, playerId, isRejoin: true };
      }
    }

    // Check if room is full
    if (room.players.size >= room.settings.maxPlayers) {
      return null;
    }

    // Check if game has started (new players can't join mid-game)
    if (room.gameState.status !== 'LOBBY') {
      return null;
    }

    // Create new player
    const playerId = uuidv4();
    const player: Player = {
      id: playerId,
      nickname,
      pace: 10,
      isHost: false,
      isEliminated: false,
      isConnected: true,
      socketId,
      currentAnswer: null,
      hasSubmitted: false,
      lastRoundResult: null,
    };

    room.players.set(playerId, player);
    this.playerToRoom.set(playerId, room.code);
    this.socketToPlayer.set(socketId, playerId);

    return { room, playerId, isRejoin: false };
  }

  /**
   * Handle player disconnect
   */
  handleDisconnect(socketId: string): {
    room: Room | null;
    player: Player | null;
    wasHost: boolean;
  } {
    const playerId = this.socketToPlayer.get(socketId);
    if (!playerId) {
      return { room: null, player: null, wasHost: false };
    }

    const roomCode = this.playerToRoom.get(playerId);
    if (!roomCode) {
      return { room: null, player: null, wasHost: false };
    }

    const room = this.rooms.get(roomCode);
    if (!room) {
      return { room: null, player: null, wasHost: false };
    }

    const player = room.players.get(playerId);
    if (!player) {
      return { room: null, player: null, wasHost: false };
    }

    // Mark player as disconnected
    player.isConnected = false;
    player.socketId = null;
    this.socketToPlayer.delete(socketId);

    const wasHost = player.isHost;

    // If host disconnects during game, pause the game
    if (wasHost && room.gameState.status === 'PLAYING') {
      room.gameState.isPaused = true;
      room.gameState.pauseReason = 'Host disconnected. Waiting for host to reconnect...';
    }

    return { room, player, wasHost };
  }

  /**
   * Remove player from room (leave)
   */
  removePlayer(socketId: string): {
    room: Room | null;
    player: Player | null;
    roomDeleted: boolean;
  } {
    const playerId = this.socketToPlayer.get(socketId);
    if (!playerId) {
      return { room: null, player: null, roomDeleted: false };
    }

    const roomCode = this.playerToRoom.get(playerId);
    if (!roomCode) {
      return { room: null, player: null, roomDeleted: false };
    }

    const room = this.rooms.get(roomCode);
    if (!room) {
      return { room: null, player: null, roomDeleted: false };
    }

    const player = room.players.get(playerId);
    if (!player) {
      return { room: null, player: null, roomDeleted: false };
    }

    // Remove player
    room.players.delete(playerId);
    this.playerToRoom.delete(playerId);
    this.socketToPlayer.delete(socketId);

    // If room is empty, delete it
    if (room.players.size === 0) {
      this.rooms.delete(roomCode);
      return { room: null, player, roomDeleted: true };
    }

    // If host left, assign new host
    if (player.isHost) {
      const newHost = room.players.values().next().value;
      if (newHost) {
        newHost.isHost = true;
        room.hostId = newHost.id;
      }
    }

    return { room, player, roomDeleted: false };
  }

  /**
   * Get room by code
   */
  getRoom(code: string): Room | undefined {
    return this.rooms.get(code.toUpperCase());
  }

  /**
   * Get room by player ID
   */
  getRoomByPlayerId(playerId: string): Room | undefined {
    const roomCode = this.playerToRoom.get(playerId);
    if (!roomCode) return undefined;
    return this.rooms.get(roomCode);
  }

  /**
   * Get room by socket ID
   */
  getRoomBySocketId(socketId: string): Room | undefined {
    const playerId = this.socketToPlayer.get(socketId);
    if (!playerId) return undefined;
    return this.getRoomByPlayerId(playerId);
  }

  /**
   * Get player by socket ID
   */
  getPlayerBySocketId(socketId: string): Player | undefined {
    const playerId = this.socketToPlayer.get(socketId);
    if (!playerId) return undefined;
    const room = this.getRoomByPlayerId(playerId);
    if (!room) return undefined;
    return room.players.get(playerId);
  }

  /**
   * Get player ID by socket ID
   */
  getPlayerIdBySocketId(socketId: string): string | undefined {
    return this.socketToPlayer.get(socketId);
  }

  /**
   * Serialize room for sending to clients
   */
  serializeRoom(room: Room): SerializedRoom {
    return {
      code: room.code,
      hostId: room.hostId,
      players: Array.from(room.players.values()),
      gameState: room.gameState,
      hasSpotifyAuth: room.spotifyAuth !== null,
      playlist: room.playlist,
      trackCount: room.tracks.length,
      settings: room.settings,
    };
  }

  /**
   * Clean up stale rooms (older than 24 hours with no connected players)
   */
  cleanupStaleRooms(): void {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours

    for (const [code, room] of this.rooms) {
      const hasConnectedPlayers = Array.from(room.players.values()).some(
        (p) => p.isConnected
      );

      if (!hasConnectedPlayers && now - room.createdAt > maxAge) {
        // Clean up all player mappings
        for (const playerId of room.players.keys()) {
          this.playerToRoom.delete(playerId);
        }
        this.rooms.delete(code);
      }
    }
  }
}

export const roomManager = new RoomManager();

// Run cleanup every hour
setInterval(() => {
  roomManager.cleanupStaleRooms();
}, 60 * 60 * 1000);
