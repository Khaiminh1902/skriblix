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

    socketIOServer.on("connection", (socket: any) => {
      console.log("Player connected:", socket.id);

      socket.on("join_lobby", () => {
        socket.join("lobby");
        socket.emit("lobby_joined", { playerId: socket.id });
        socket.emit("room_list", getRoomList());
      });

      socket.on(
        "create_room",
        (data: { playerName: string; theme: string }) => {
          const { playerName, theme = "doodle" } = data;
          const roomId = generateRoomId();

          const room = {
            id: roomId,
            theme,
            players: [{ id: socket.id, name: playerName, status: "connected" }],
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

      socket.on("join_room", (data: { roomId: string; playerName: string }) => {
        const { roomId, playerName } = data;
        const room = rooms.get(roomId);

        if (!room) {
          socket.emit("error", { message: "Room not found" });
          return;
        }

        if (room.gameState !== "waiting") {
          socket.emit("error", { message: "Game already in progress" });
          return;
        }

        const player = { id: socket.id, name: playerName, status: "connected" };
        room.players.push(player);
        socket.join(roomId);

        socket.emit("room_joined", { room, playerId: socket.id });
        socketIOServer.to(roomId).emit("player_joined", { player });
        socketIOServer.to(roomId).emit("room_update", { room });
        socketIOServer.to("lobby").emit("room_list", getRoomList());
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
          socketIOServer.to(roomId).emit("room_update", { room });
          socketIOServer.to("lobby").emit("room_list", getRoomList());
        }
      });

      socket.on("start_game", (data: { roomId: string }) => {
        const { roomId } = data;
        const room = rooms.get(roomId);

        if (!room) return;
        // Only the host can start the game
        if (room.hostId !== socket.id) {
          socket.emit("error", { message: "Only the host can start the game" });
          return;
        }
        if (room.players.length < 2) {
          socket.emit("error", { message: "Need at least 2 players to start" });
          return;
        }

        room.gameState = "drawing";
        room.drawer = room.players[0].id;
        room.currentWord = getRandomWord(room.theme);

        socketIOServer.to(roomId).emit("game_started", { room });
        socketIOServer.to(roomId).emit("new_round", {
          drawerId: room.drawer,
          word: room.theme === "doodle" ? "???" : room.currentWord,
        });
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
        socket.to(roomId).emit("canvas_cleared");
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

        const currentDrawerIndex = room.players.findIndex(
          (p: any) => p.id === room.drawer,
        );
        const nextDrawerIndex = (currentDrawerIndex + 1) % room.players.length;

        room.drawer = room.players[nextDrawerIndex].id;
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
