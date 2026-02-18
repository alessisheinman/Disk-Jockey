import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import next from 'next';
import cors from 'cors';
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  CreateRoomData,
  JoinRoomData,
  SubmitAnswerData,
  SetSpotifyAuthData,
  LoadPlaylistData,
} from '../types';
import { roomManager } from './roomManager';
import { gameManager } from './gameManager';
import { spotifyService } from './spotifyService';

const dev = process.env.NODE_ENV !== 'production';
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev });
const handle = app.getRequestHandler();
// Rate limiting: Track last playlist load time per room
const lastPlaylistLoad = new Map<string, number>();
const PLAYLIST_LOAD_COOLDOWN = 5000; // 5 seconds between playlist loads


app.prepare().then(() => {
  const server = express();
  const httpServer = createServer(server);

  // CORS configuration
  const corsOptions = {
    origin: process.env.BASE_URL || 'http://localhost:3000',
    methods: ['GET', 'POST'],
    credentials: true,
  };

  server.use(cors(corsOptions));
  server.use(express.json());

  // Socket.IO setup
  const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    cors: corsOptions,
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // Share IO instance with game manager
  gameManager.setIO(io);

  // Socket.IO connection handling
  io.on('connection', (socket) => {
    console.log(`Client connected: ${socket.id}`);

    // Create room
    socket.on('createRoom', (data: CreateRoomData, callback) => {
      try {
        const { room, playerId } = roomManager.createRoom(data.nickname, socket.id);
        socket.join(room.code);

        callback({
          success: true,
          roomCode: room.code,
          playerId,
        });

        socket.emit('roomJoined', {
          room: roomManager.serializeRoom(room),
          playerId,
        });

        console.log(`Room ${room.code} created by ${data.nickname}`);
      } catch (error) {
        console.error('Error creating room:', error);
        callback({
          success: false,
          error: 'Failed to create room',
        });
      }
    });

    // Join room
    socket.on('joinRoom', (data: JoinRoomData, callback) => {
      try {
        const result = roomManager.joinRoom(data.roomCode, data.nickname, socket.id);

        if (!result) {
          callback({
            success: false,
            error: 'Room not found, full, or game in progress',
          });
          return;
        }

        const { room, playerId, isRejoin } = result;
        socket.join(room.code);

        callback({
          success: true,
          playerId,
        });

        socket.emit('roomJoined', {
          room: roomManager.serializeRoom(room),
          playerId,
        });

        if (isRejoin) {
          // Notify others of reconnection
          socket.to(room.code).emit('playerReconnected', {
            playerId,
            nickname: data.nickname,
          });

          // If host reconnected and game was paused, resume
          const player = room.players.get(playerId);
          if (player?.isHost && room.gameState.isPaused) {
            gameManager.resumeGame(room.code);
          }
        } else {
          // Notify others of new player
          const player = room.players.get(playerId)!;
          socket.to(room.code).emit('playerJoined', { player });
        }

        console.log(`${data.nickname} ${isRejoin ? 'rejoined' : 'joined'} room ${room.code}`);
      } catch (error) {
        console.error('Error joining room:', error);
        callback({
          success: false,
          error: 'Failed to join room',
        });
      }
    });

    // Leave room
    socket.on('leaveRoom', () => {
      const { room, player, roomDeleted } = roomManager.removePlayer(socket.id);

      if (room && player) {
        socket.leave(room.code);
        socket.to(room.code).emit('playerLeft', {
          playerId: player.id,
          nickname: player.nickname,
        });

        // Update room state for remaining players
        io.to(room.code).emit('roomUpdated', {
          room: roomManager.serializeRoom(room),
        });

        console.log(`${player.nickname} left room ${room.code}`);
      }
    });

    // Set Spotify auth
    socket.on('setSpotifyAuth', async (data: SetSpotifyAuthData) => {
      const room = roomManager.getRoomBySocketId(socket.id);
      if (!room) {
        socket.emit('error', { message: 'Room not found' });
        return;
      }

      const player = roomManager.getPlayerBySocketId(socket.id);
      if (!player?.isHost) {
        socket.emit('error', { message: 'Only host can connect Spotify' });
        return;
      }

      try {
        // Get user info
        const user = await spotifyService.getCurrentUser(data.accessToken);

        room.spotifyAuth = {
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
          expiresAt: Date.now() + data.expiresIn * 1000,
          userId: user.id,
        };

        socket.emit('spotifyConnected', { userId: user.id });

        // Update room for all players
        io.to(room.code).emit('roomUpdated', {
          room: roomManager.serializeRoom(room),
        });

        console.log(`Spotify connected for room ${room.code} by ${user.display_name}`);
      } catch (error) {
        console.error('Error setting Spotify auth:', error);
        socket.emit('error', { message: 'Failed to connect Spotify' });
      }
    });

    // Load playlist
    socket.on('loadPlaylist', async (data: LoadPlaylistData) => {
      const room = roomManager.getRoomBySocketId(socket.id);
      if (!room) {
        socket.emit('error', { message: 'Room not found' });
        return;
      }

      const player = roomManager.getPlayerBySocketId(socket.id);
      if (!player?.isHost) {
        socket.emit('error', { message: 'Only host can load playlist' });
        return;
      }

      if (!room.spotifyAuth) {
        socket.emit('error', { message: 'Spotify not connected' });
        return;
      }
      // Rate limiting check
      const lastLoad = lastPlaylistLoad.get(room.code);
      const now = Date.now();
      if (lastLoad && (now - lastLoad) < PLAYLIST_LOAD_COOLDOWN) {
        const waitTime = Math.ceil((PLAYLIST_LOAD_COOLDOWN - (now - lastLoad)) / 1000);
        socket.emit('error', { message: 'Please wait ' + waitTime + ' seconds before loading another playlist' });
        return;
      }
      lastPlaylistLoad.set(room.code, now);

      try {
        console.log('Loading playlist, input:', data.playlistId);
        console.log('Room has Spotify auth:', !!room.spotifyAuth);

        // Ensure token is valid
        room.spotifyAuth = await spotifyService.ensureValidToken(room.spotifyAuth);
        console.log('Token validated, expires at:', new Date(room.spotifyAuth.expiresAt).toISOString());

        const playlistId = spotifyService.parsePlaylistId(data.playlistId);
        console.log('Parsed playlist ID:', playlistId);

        if (!playlistId) {
          socket.emit('error', { message: 'Invalid playlist ID or URL' });
          return;
        }

        // Get playlist info and tracks in a single API call
        console.log('Fetching playlist...');
        const { info: playlistInfo, tracks } = await spotifyService.getPlaylistWithTracks(
          room.spotifyAuth.accessToken,
          playlistId
        );
        console.log('Playlist info:', playlistInfo);
        console.log('Tracks count:', tracks.length);

        // Shuffle tracks
        room.tracks = spotifyService.shuffleArray(tracks);
        room.playlist = playlistInfo;
        room.usedTrackIds.clear();

        socket.emit('playlistLoaded', {
          playlist: playlistInfo,
          trackCount: tracks.length,
        });

        // Update room for all players
        io.to(room.code).emit('roomUpdated', {
          room: roomManager.serializeRoom(room),
        });

        console.log(`Playlist loaded for room ${room.code}: ${playlistInfo.name} (${tracks.length} tracks)`);
      } catch (error: any) {
        console.error('Error loading playlist:', error.message || error);
        console.error('Full error:', error);
        socket.emit('error', { message: `Failed to load playlist: ${error.message || 'Unknown error'}` });
      }
    });

    // Start game
    socket.on('startGame', async () => {
      const room = roomManager.getRoomBySocketId(socket.id);
      if (!room) {
        socket.emit('error', { message: 'Room not found' });
        return;
      }

      const player = roomManager.getPlayerBySocketId(socket.id);
      if (!player?.isHost) {
        socket.emit('error', { message: 'Only host can start game' });
        return;
      }

      const result = await gameManager.startGame(room.code);
      if (!result.success) {
        socket.emit('error', { message: result.error || 'Failed to start game' });
      }
    });

    // Submit answer
    socket.on('submitAnswer', (data: SubmitAnswerData) => {
      const result = gameManager.submitAnswer(
        socket.id,
        data.songTitle,
        data.artist
      );

      if (!result.success) {
        socket.emit('error', { message: result.error || 'Failed to submit answer' });
      }
    });

    // Restart game
    socket.on('restartGame', () => {
      const result = gameManager.restartGame(socket.id);
      if (!result.success) {
        socket.emit('error', { message: result.error || 'Failed to restart game' });
      }
    });

    // Playback ready (host confirms playback started)
    socket.on('playbackReady', () => {
      // Host confirms playback has started
      console.log('Host playback ready');
    });

    // Playback ended (track finished naturally)
    socket.on('playbackEnded', () => {
      // Track ended naturally, this is handled by round timer
      console.log('Playback ended');
    });

    // Handle disconnect
    socket.on('disconnect', () => {
      const { room, player, wasHost } = roomManager.handleDisconnect(socket.id);

      if (room && player) {
        io.to(room.code).emit('roomUpdated', {
          room: roomManager.serializeRoom(room),
        });

        if (wasHost && room.gameState.status === 'PLAYING') {
          io.to(room.code).emit('gamePaused', {
            reason: 'Host disconnected. Waiting for host to reconnect...',
          });
        }

        console.log(`${player.nickname} disconnected from room ${room.code}`);
      }
    });
  });

  // Health check endpoint
  server.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Handle all other routes with Next.js
  server.all('*', (req, res) => {
    return handle(req, res);
  });

  httpServer.listen(port, () => {
    console.log(`> Server ready on http://localhost:${port}`);
    console.log(`> Environment: ${dev ? 'development' : 'production'}`);
  });
});
