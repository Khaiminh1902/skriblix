/* eslint-disable @typescript-eslint/no-require-imports */
const { createServer } = require("node:http");
const next = require("next");
const { Server } = require("socket.io");

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME || "0.0.0.0";
const port = Number.parseInt(process.env.PORT || "3000", 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

function registerSocketHandlers(io) {
  const rooms = new Map();
  const roomCleanupTimers = new Map();
  const EMPTY_ROOM_TTL_MS = 60 * 1000;

  function clearRoomCleanup(roomId) {
    const timer = roomCleanupTimers.get(roomId);
    if (timer) {
      clearTimeout(timer);
      roomCleanupTimers.delete(roomId);
    }
  }

  function scheduleRoomCleanup(roomId) {
    clearRoomCleanup(roomId);
    const timer = setTimeout(() => {
      const room = rooms.get(roomId);
      if (room && room.players.length === 0) {
        rooms.delete(roomId);
        io.to("lobby").emit("room_list", getRoomList());
      }
      roomCleanupTimers.delete(roomId);
    }, EMPTY_ROOM_TTL_MS);
    roomCleanupTimers.set(roomId, timer);
  }

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

  function getRandomWord() {
    return doodleWords[Math.floor(Math.random() * doodleWords.length)];
  }

  function generateRoomId() {
    let roomId = "";
    do {
      roomId = String(Math.floor(100000 + Math.random() * 900000));
    } while (rooms.has(roomId));
    return roomId;
  }

  io.on("connection", (socket) => {
    console.log("Player connected:", socket.id);

    socket.on("join_lobby", () => {
      socket.join("lobby");
      socket.emit("lobby_joined", { playerId: socket.id });
      socket.emit("room_list", getRoomList());
    });

    socket.on("create_room", ({ playerName, theme = "doodle", roomId: requestedRoomId }) => {
      const roomId = requestedRoomId || generateRoomId();

      if (!/^\d{6}$/.test(roomId)) {
        socket.emit("error", { message: "Room ID must be a 6-digit number" });
        return;
      }

      if (rooms.has(roomId)) {
        socket.emit("error", { message: "Room ID already in use" });
        return;
      }

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
      };

      rooms.set(roomId, room);
      clearRoomCleanup(roomId);
      socket.join(roomId);
      socket.emit("room_created", { room, playerId: socket.id });
      io.to("lobby").emit("room_list", getRoomList());
    });

    socket.on("join_room", ({ roomId, playerName }) => {
      const room = rooms.get(roomId);

      if (!room) {
        socket.emit("error", { message: "Room not found" });
        return;
      }

      clearRoomCleanup(roomId);

      if (room.gameState !== "waiting") {
        socket.emit("error", { message: "Game already in progress" });
        return;
      }

      const existingPlayer = room.players.find((player) => player.id === socket.id);
      if (!existingPlayer) {
        const player = { id: socket.id, name: playerName, status: "connected" };
        room.players.push(player);
        io.to(roomId).emit("player_joined", { player });
      }

      socket.join(roomId);
      socket.emit("room_joined", { room, playerId: socket.id });
      io.to(roomId).emit("room_update", { room });
      io.to("lobby").emit("room_list", getRoomList());
    });

    socket.on("leave_room", ({ roomId }) => {
      const room = rooms.get(roomId);

      if (!room) return;

      room.players = room.players.filter((player) => player.id !== socket.id);
      socket.leave(roomId);

      if (room.players.length === 0) {
        scheduleRoomCleanup(roomId);
      } else {
        io.to(roomId).emit("player_left", { playerId: socket.id });
        io.to(roomId).emit("room_update", { room });
      }

      io.to("lobby").emit("room_list", getRoomList());
    });

    socket.on("start_game", ({ roomId }) => {
      const room = rooms.get(roomId);

      if (!room) return;
      if (room.players.length < 2) {
        socket.emit("error", { message: "Need at least 2 players to start" });
        return;
      }

      room.gameState = "drawing";
      room.drawer = room.players[0].id;
      room.currentWord = getRandomWord();

      io.to(roomId).emit("game_started", { room });
      io.to(roomId).emit("new_round", {
        drawerId: room.drawer,
        word: room.theme === "doodle" ? "???" : room.currentWord,
      });
    });

    socket.on("drawing", ({ roomId, drawing }) => {
      const room = rooms.get(roomId);

      if (!room) return;
      room.drawings.push({
        ...drawing,
        playerId: socket.id,
        timestamp: Date.now(),
      });
      socket.to(roomId).emit("drawing_update", { drawing });
    });

    socket.on("clear_canvas", ({ roomId }) => {
      socket.to(roomId).emit("canvas_cleared");
    });

    socket.on("chat_message", ({ roomId, message, playerId }) => {
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
        io.to(roomId).emit("correct_guess", { playerId, word: room.currentWord });
        io.to(roomId).emit("game_state_update", { room });
      }

      io.to(roomId).emit("new_message", { message: chatMsg });
    });

    socket.on("next_word", ({ roomId }) => {
      const room = rooms.get(roomId);

      if (!room) return;

      const currentDrawerIndex = room.players.findIndex(
        (player) => player.id === room.drawer,
      );
      const nextDrawerIndex = (currentDrawerIndex + 1) % room.players.length;

      room.drawer = room.players[nextDrawerIndex].id;
      room.currentWord = getRandomWord();
      room.gameState = "drawing";
      room.drawings = [];

      io.to(roomId).emit("new_round", {
        drawerId: room.drawer,
        word: room.theme === "doodle" ? "???" : room.currentWord,
      });
      io.to(roomId).emit("game_state_update", { room });
    });

    socket.on("disconnect", () => {
      console.log("Player disconnected:", socket.id);

      for (const [roomId, room] of rooms.entries()) {
        const playerIndex = room.players.findIndex((player) => player.id === socket.id);
        if (playerIndex === -1) continue;

        room.players.splice(playerIndex, 1);
        socket.leave(roomId);

        if (room.players.length === 0) {
          scheduleRoomCleanup(roomId);
        } else {
          io.to(roomId).emit("player_left", { playerId: socket.id });
          io.to(roomId).emit("room_update", { room });
        }

        io.to("lobby").emit("room_list", getRoomList());
      }
    });
  });
}

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    handle(req, res);
  });

  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  registerSocketHandlers(io);

  httpServer.listen(port, hostname, () => {
    console.log(
      `> Server listening at http://${hostname}:${port} as ${
        dev ? "development" : "production"
      }`,
    );
  });
});
