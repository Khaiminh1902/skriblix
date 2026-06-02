/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { Server } from "socket.io";

declare global {
  var socketIOServer: any;
}

let socketIOServer: any;

export function setupSocket(httpServer: any) {
  if (!socketIOServer) {
    socketIOServer = new Server(httpServer, {
      path: "/api/socket",
      addTrailingSlash: false,
      cors: {
        origin: "*",
        methods: ["GET", "POST"],
      },
    });

    const rooms = new Map<string, any>();
    const gamePhaseTimers = new Map<string, NodeJS.Timeout>();
    const PRE_GAME_COUNTDOWN_MS = 5 * 1000;

    function getRoomList() {
      return Array.from(rooms.values()).map((room) => ({
        id: room.id,
        theme: room.theme,
        playerCount: room.players.length,
        maxPlayers: 8,
        gameState: room.gameState,
      }));
    }

    const doodleWords = [
      "cat",
      "dog",
      "house",
      "tree",
      "flower",
      "sun",
      "moon",
      "star",
      "cloud",
      "bird",
      "fish",
      "car",
      "bike",
      "ball",
      "apple",
      "pizza",
      "cake",
      "cup",
      "hat",
      "shoe",
      "book",
      "pen",
      "heart",
      "star",
      "fish",
      "boat",
      "plane",
      "train",
      "bus",
      "clock",
      "key",
      "door",
      "window",
      "chair",
      "table",
      "bed",
      "lamp",
      "phone",
      "camera",
      "guitar",
    ];

    function getRandomWord(theme: string) {
      return doodleWords[Math.floor(Math.random() * doodleWords.length)];
    }

    function getRandomDrawerId(players: any[], previousDrawerId: string | null = null) {
      const eligiblePlayers =
        players.length > 1
          ? players.filter((player: any) => player.id !== previousDrawerId)
          : players;

      return eligiblePlayers[Math.floor(Math.random() * eligiblePlayers.length)]?.id;
    }

    function generateRoomId() {
      const words = [
        "cat",
        "dog",
        "art",
        "draw",
        "skrib",
        "pix",
        "doodle",
        "line",
        "ink",
        "pen",
        "fun",
        "play",
        "game",
        "room",
        "hub",
        "zone",
        "club",
        "crew",
        "team",
        "gang",
      ];
      const word1 = words[Math.floor(Math.random() * words.length)];
      const word2 = words[Math.floor(Math.random() * words.length)];
      const num = Math.floor(Math.random() * 99) + 1;
      return `${word1}-${word2}-${num}`;
    }

    function emitRoomState(roomId: string) {
      const room = rooms.get(roomId);
      if (!room) return;

      socketIOServer.to(roomId).emit("room_update", { room });
      socketIOServer.to("lobby").emit("room_list", getRoomList());
    }

    function areAllPlayersReady(room: any) {
      return (
        room.players.length >= 2 &&
        room.players.every((player: any) => player.status === "ready")
      );
    }

    function clearGameTimer(roomId: string) {
      const timer = gamePhaseTimers.get(roomId);
      if (!timer) return;

      clearTimeout(timer);
      gamePhaseTimers.delete(roomId);
    }

    function startDrawingRound(roomId: string) {
      const room = rooms.get(roomId);
      if (!room || !areAllPlayersReady(room)) return;

      clearGameTimer(roomId);
      room.gameState = "drawing";
      room.drawer = getRandomDrawerId(room.players, room.drawer);
      room.currentWord = getRandomWord(room.theme);
      room.drawings = [];
      room.countdownEndsAt = null;

      socketIOServer.to(roomId).emit("game_started", { room });
      socketIOServer.to(roomId).emit("new_round", {
        drawerId: room.drawer,
        word: room.theme === "doodle" ? "???" : room.currentWord,
      });
      emitRoomState(roomId);
    }

    function startPreGameCountdown(roomId: string) {
      const room = rooms.get(roomId);
      if (!room || room.gameState !== "waiting" || !areAllPlayersReady(room)) {
        return;
      }

      clearGameTimer(roomId);
      room.gameState = "countdown";
      room.drawer = null;
      room.currentWord = null;
      room.drawings = [];
      room.countdownEndsAt = Date.now() + PRE_GAME_COUNTDOWN_MS;
      emitRoomState(roomId);

      const countdownTimer = setTimeout(() => {
        startDrawingRound(roomId);
      }, PRE_GAME_COUNTDOWN_MS);
      gamePhaseTimers.set(roomId, countdownTimer);
    }

    socketIOServer.on("connection", (socket: any) => {
      console.log("Player connected:", socket.id);

      socket.on("join_lobby", () => {
        socket.join("lobby");
        socket.emit("lobby_joined", { playerId: socket.id });
        socket.emit("room_list", getRoomList());
      });

      socket.on("check_room_exists", (data: { roomId: string }) => {
        socket.emit("room_exists", {
          roomId: data.roomId,
          exists: rooms.has(data.roomId),
        });
      });

      socket.on(
        "create_room",
        (data: { playerName: string; playerKey?: string; theme: string }) => {
          const { playerName, playerKey, theme = "doodle" } = data;
          const roomId = generateRoomId();

          const room = {
            id: roomId,
            theme,
            players: [
              {
                id: socket.id,
                playerKey,
                name: playerName,
                status: "not_ready",
              },
            ],
            drawer: null,
            currentWord: null,
            drawings: [],
            messages: [],
            gameState: "waiting",
            createdAt: Date.now(),
            hostId: socket.id,
          };

          rooms.set(roomId, room);
          socket.join(roomId);
          socket.emit("room_created", { room, playerId: socket.id });
          socketIOServer.to("lobby").emit("room_list", getRoomList());
        },
      );

      socket.on("join_room", (data: { roomId: string; playerName: string; playerKey?: string }) => {
        const { roomId, playerName, playerKey } = data;
        const room = rooms.get(roomId);

        if (!room) {
          socket.emit("error", { message: "Room not found" });
          return;
        }

        const existingPlayer = playerKey
          ? room.players.find((player: any) => player.playerKey === playerKey)
          : null;

        if (!existingPlayer && room.gameState !== "waiting") {
          socket.emit("error", { message: "Game already in progress" });
          return;
        }

        const player = existingPlayer || {
          id: socket.id,
          playerKey,
          name: playerName,
          status: "not_ready",
        };
        if (existingPlayer) {
          const previousPlayerId = existingPlayer.id;
          existingPlayer.id = socket.id;
          existingPlayer.name = playerName;
          if (room.hostId === previousPlayerId) {
            room.hostId = socket.id;
          }
          if (room.drawer === previousPlayerId) {
            room.drawer = socket.id;
          }
        } else {
          room.players.push(player);
        }
        socket.join(roomId);

        socket.emit("room_joined", { room, playerId: socket.id });
        if (!existingPlayer) {
          socketIOServer.to(roomId).emit("player_joined", { player });
        }
        emitRoomState(roomId);
      });

      socket.on("leave_room", (data: { roomId: string }) => {
        const { roomId } = data;
        const room = rooms.get(roomId);

        if (!room) return;

        room.players = room.players.filter((p: any) => p.id !== socket.id);
        socket.leave(roomId);

        if (room.players.length === 0) {
          rooms.delete(roomId);
          socketIOServer.to("lobby").emit("room_list", getRoomList());
        } else {
          socketIOServer
            .to(roomId)
            .emit("player_left", { playerId: socket.id });
          emitRoomState(roomId);
          startPreGameCountdown(roomId);
        }
      });

      socket.on("player_ready", (data: { roomId: string }) => {
        const { roomId } = data;
        const room = rooms.get(roomId);

        if (!room || room.gameState !== "waiting") return;

        const player = room.players.find((roomPlayer: any) => roomPlayer.id === socket.id);
        if (!player) return;

        player.status = "ready";
        emitRoomState(roomId);
        startPreGameCountdown(roomId);
      });

      socket.on("start_game", (data: { roomId: string }) => {
        const { roomId } = data;
        const room = rooms.get(roomId);

        if (!room) return;
        if (room.hostId !== socket.id) {
          socket.emit("error", { message: "Only the host can start the game" });
          return;
        }
        if (room.players.length < 2) {
          socket.emit("error", { message: "Need at least 2 players to start" });
          return;
        }

        room.players.forEach((player: any) => {
          player.status = "ready";
        });
        emitRoomState(roomId);
        startPreGameCountdown(roomId);
      });

      socket.on("drawing", (data: { roomId: string; drawing: any }) => {
        const { roomId, drawing } = data;
        const room = rooms.get(roomId);

        if (!room) return;
        room.drawings.push({
          ...drawing,
          playerId: socket.id,
          timestamp: Date.now(),
        });
        socket.to(roomId).emit("drawing_update", { drawing });
      });

      socket.on("clear_canvas", (data: { roomId: string }) => {
        const { roomId } = data;
        const room = rooms.get(roomId);
        if (room) {
          room.drawings = [];
          emitRoomState(roomId);
        }
        socketIOServer.to(roomId).emit("canvas_cleared");
      });

      socket.on(
        "chat_message",
        (data: { roomId: string; message: string; playerId: string }) => {
          const { roomId, message, playerId } = data;
          const room = rooms.get(roomId);

          if (!room) return;

          const chatMsg = {
            playerId,
            message,
            timestamp: Date.now(),
            isCorrect: false,
          };
          room.messages.push(chatMsg);

          const isCorrectGuess =
            room.gameState === "drawing" &&
            room.currentWord &&
            message.toLowerCase() === room.currentWord.toLowerCase();

          if (isCorrectGuess) {
            chatMsg.isCorrect = true;
            room.gameState = "waiting";
            room.drawings = [];
            socketIOServer
              .to(roomId)
              .emit("correct_guess", { playerId, word: room.currentWord });
            socketIOServer.to(roomId).emit("game_state_update", { room });
          }

          socketIOServer.to(roomId).emit("new_message", { message: chatMsg });
        },
      );

      socket.on("next_word", (data: { roomId: string }) => {
        const { roomId } = data;
        const room = rooms.get(roomId);

        if (!room) return;

        room.drawer = getRandomDrawerId(room.players, room.drawer);
        room.currentWord = getRandomWord(room.theme);
        room.gameState = "drawing";
        room.drawings = [];

        socketIOServer.to(roomId).emit("new_round", {
          drawerId: room.drawer,
          word: room.theme === "doodle" ? "???" : room.currentWord,
        });
        socketIOServer.to(roomId).emit("game_state_update", { room });
      });

      socket.on("disconnect", () => {
        console.log("Player disconnected:", socket.id);

        rooms.forEach((room: any, roomId: string) => {
          const playerIndex = room.players.findIndex(
            (p: any) => p.id === socket.id,
          );
          if (playerIndex !== -1) {
            if (
              room.gameState === "countdown" ||
              room.gameState === "starting" ||
              room.gameState === "drawing"
            ) {
              socket.leave(roomId);
              return;
            }

            room.players.splice(playerIndex, 1);
            socket.leave(roomId);

            if (room.players.length === 0) {
              rooms.delete(roomId);
              socketIOServer.to("lobby").emit("room_list", getRoomList());
            } else {
              socketIOServer
                .to(roomId)
                .emit("player_left", { playerId: socket.id });
              socketIOServer.to(roomId).emit("room_update", { room });
              socketIOServer.to("lobby").emit("room_list", getRoomList());
            }
          }
        });
      });
    });
  }

  return socketIOServer;
}

export function getSocketServer() {
  return socketIOServer;
}
