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
  const gamePhaseTimers = new Map();
  const EMPTY_ROOM_TTL_MS = 60 * 1000;
  const PRE_GAME_COUNTDOWN_MS = 5 * 1000;
  const PRE_GAME_LOADING_MS = 1500;
  const DRAWING_ROUND_MS = 60 * 1000;
  const MAX_ROUNDS = 10;

  function normalizeGuess(text) {
    return text.toLowerCase().replace(/\s+/g, "").replace(/[^\w]/g, "");
  }

  function isCorrectGuess(guess, answer) {
    const normalizedGuess = normalizeGuess(guess);
    const normalizedAnswer = normalizeGuess(answer);
    return normalizedGuess === normalizedAnswer;
  }

  function clearRoomCleanup(roomId) {
    const timer = roomCleanupTimers.get(roomId);
    if (timer) {
      clearTimeout(timer);
      roomCleanupTimers.delete(roomId);
    }
  }

  function scheduleRoomCleanup(roomId) {
    clearRoomCleanup(roomId);
    clearGameTimers(roomId);
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

  function clearGameTimers(roomId) {
    const timers = gamePhaseTimers.get(roomId);
    if (!timers) return;

    if (timers.countdownTimer) {
      clearTimeout(timers.countdownTimer);
    }

    if (timers.loadingTimer) {
      clearTimeout(timers.loadingTimer);
    }

    if (timers.drawingTimer) {
      clearTimeout(timers.drawingTimer);
    }

    gamePhaseTimers.delete(roomId);
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
    "wifi",
    "gravity",
    "black hole",
    "taxes",
    "sigma",
    "touch grass",
    "shrek",
    "doge",
    "404 error",
    "loading screen",
    "captcha",
    "chaos",
    "broken truck",
    "inflation",
    "deja vu",
    "Mark Zuckerberg",
    "Tesla",
    "America",
    "Elon Musk",
    "gigachad",
    "capitalism",
    "panic attack",
    "unsubscribe",
    "death",
    "rage quit",
    "clickbait",
    "speedrun",
    "banana",
    "pigeon",
    "Mr Beast",
    "Easter egg",
    "tax evasion",
    "pirate",
    "dinosaur",
    "democracy",
    "Rome",
    "human",
    "social anxiety",
    "NPC",
    "zombie",
  ];

  function getRandomWord() {
    return doodleWords[Math.floor(Math.random() * doodleWords.length)];
  }

  function getRandomDrawerId(players, previousDrawerId = null) {
    const eligiblePlayers =
      players.length > 1
        ? players.filter((player) => player.id !== previousDrawerId)
        : players;

    return eligiblePlayers[Math.floor(Math.random() * eligiblePlayers.length)]
      ?.id;
  }

  function generateRoomId() {
    let roomId = "";
    do {
      roomId = String(Math.floor(100000 + Math.random() * 900000));
    } while (rooms.has(roomId));
    return roomId;
  }

  function emitRoomState(roomId) {
    const room = rooms.get(roomId);
    if (!room) return;

    io.to(roomId).emit("room_update", { room });
    io.to("lobby").emit("room_list", getRoomList());
  }

  function areAllPlayersReady(room) {
    return (
      room.players.length >= 2 &&
      room.players.every((player) => player.status === "ready")
    );
  }

  function finishGame(roomId) {
    const room = rooms.get(roomId);
    if (!room) return;

    clearGameTimers(roomId);
    room.gameState = "finished";
    room.resultPlayers = room.players.map((player) => ({ ...player }));
    room.countdownEndsAt = null;
    room.loadingEndsAt = null;
    room.drawer = null;
    room.currentWord = null;

    io.to(roomId).emit("game_finished", { room });
    emitRoomState(roomId);
  }

  function startDrawingRound(roomId) {
    const room = rooms.get(roomId);
    if (!room || room.players.length === 0) return;

    room.currentRound = (room.currentRound ?? 0) + 1;
    const isFinalRound = room.currentRound >= MAX_ROUNDS;

    room.drawer = getRandomDrawerId(room.players, room.drawer);
    room.currentWord = getRandomWord();
    room.drawings = [];
    room.gameState = "drawing";
    room.countdownEndsAt = Date.now() + DRAWING_ROUND_MS;
    room.loadingEndsAt = null;

    clearGameTimers(roomId);

    const drawingTimer = setTimeout(() => {
      const activeRoom = rooms.get(roomId);
      if (!activeRoom || activeRoom.gameState !== "drawing") return;

      if (isFinalRound) {
        finishGame(roomId);
        return;
      }

      startDrawingRound(roomId);
    }, DRAWING_ROUND_MS);

    gamePhaseTimers.set(roomId, { drawingTimer });

    io.to(roomId).emit("game_started", { room });
    io.to(roomId).emit("new_round", {
      drawerId: room.drawer,
      word: room.currentWord,
      currentRound: room.currentRound,
      totalRounds: room.totalRounds,
    });
    emitRoomState(roomId);
  }

  function cancelPreGameIfNeeded(roomId) {
    const room = rooms.get(roomId);
    if (!room) return;

    if (
      room.players.length < 2 &&
      (room.gameState === "countdown" || room.gameState === "starting")
    ) {
      clearGameTimers(roomId);
      room.gameState = "waiting";
      room.drawer = null;
      room.currentWord = null;
      room.countdownEndsAt = null;
      room.loadingEndsAt = null;
      emitRoomState(roomId);
    }
  }

  function startPreGameCountdown(roomId) {
    const room = rooms.get(roomId);
    if (!room || room.gameState !== "waiting" || !areAllPlayersReady(room)) {
      return;
    }

    clearGameTimers(roomId);
    room.gameState = "countdown";
    room.drawer = null;
    room.currentWord = null;
    room.drawings = [];
    room.countdownEndsAt = Date.now() + PRE_GAME_COUNTDOWN_MS;
    room.loadingEndsAt = null;
    emitRoomState(roomId);

    const countdownTimer = setTimeout(() => {
      const activeRoom = rooms.get(roomId);
      if (!activeRoom) return;
      if (!areAllPlayersReady(activeRoom)) {
        cancelPreGameIfNeeded(roomId);
        return;
      }

      activeRoom.gameState = "starting";
      activeRoom.countdownEndsAt = null;
      activeRoom.loadingEndsAt = Date.now() + PRE_GAME_LOADING_MS;
      emitRoomState(roomId);

      const loadingTimer = setTimeout(() => {
        const loadingRoom = rooms.get(roomId);
        if (!loadingRoom) return;
        if (!areAllPlayersReady(loadingRoom)) {
          cancelPreGameIfNeeded(roomId);
          return;
        }

        startDrawingRound(roomId);
      }, PRE_GAME_LOADING_MS);

      gamePhaseTimers.set(roomId, { loadingTimer });
    }, PRE_GAME_COUNTDOWN_MS);

    gamePhaseTimers.set(roomId, { countdownTimer });
  }

  io.on("connection", (socket) => {
    console.log("Player connected:", socket.id);

    socket.on("join_lobby", () => {
      socket.join("lobby");
      socket.emit("lobby_joined", { playerId: socket.id });
      socket.emit("room_list", getRoomList());
    });

    socket.on("check_room_exists", ({ roomId }) => {
      socket.emit("room_exists", {
        roomId,
        exists: rooms.has(roomId),
      });
    });

    socket.on(
      "create_room",
      ({
        playerName,
        playerKey,
        theme = "doodle",
        roomId: requestedRoomId,
      }) => {
        const roomId = requestedRoomId || generateRoomId();

        if (!/^\d{6}$/.test(roomId)) {
          socket.emit("error", { message: "Room ID must be a 6-digit number" });
          return;
        }

        if (!playerKey) {
          socket.emit("error", { message: "Missing player identity" });
          return;
        }

        if (rooms.has(roomId)) {
          socket.emit("error", { message: "Room ID already in use" });
          return;
        }

        const room = {
          id: roomId,
          theme,
          hostId: socket.id,
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
          resultPlayers: [],
          currentRound: 0,
          totalRounds: MAX_ROUNDS,
          countdownEndsAt: null,
          loadingEndsAt: null,
          createdAt: Date.now(),
        };

        rooms.set(roomId, room);
        clearRoomCleanup(roomId);
        socket.join(roomId);
        socket.emit("room_created", { room, playerId: socket.id });
        io.to("lobby").emit("room_list", getRoomList());
      },
    );

    socket.on("join_room", ({ roomId, playerName, playerKey }) => {
      const room = rooms.get(roomId);

      if (!room) {
        socket.emit("error", { message: "Room not found" });
        return;
      }

      if (!playerKey) {
        socket.emit("error", { message: "Missing player identity" });
        return;
      }

      clearRoomCleanup(roomId);

      const existingPlayer = room.players.find(
        (player) => player.playerKey === playerKey,
      );

      if (
        !existingPlayer &&
        room.gameState !== "waiting" &&
        room.gameState !== "finished"
      ) {
        socket.emit("error", { message: "Game already in progress" });
        return;
      }

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
        room.messages.forEach((chatMsg) => {
          if (chatMsg.playerId === previousPlayerId) {
            chatMsg.playerId = socket.id;
          }
        });
        room.drawings.forEach((drawing) => {
          if (drawing.playerId === previousPlayerId) {
            drawing.playerId = socket.id;
          }
        });
      } else {
        const player = {
          id: socket.id,
          playerKey,
          name: playerName,
          status: "not_ready",
        };
        room.players.push(player);
        io.to(roomId).emit("player_joined", { player });
      }

      socket.join(roomId);
      socket.emit("room_joined", { room, playerId: socket.id });
      emitRoomState(roomId);
    });

    socket.on("leave_room", ({ roomId }) => {
      const room = rooms.get(roomId);

      if (!room) return;

      room.players = room.players.filter((player) => player.id !== socket.id);
      socket.leave(roomId);

      if (room.players.length === 0) {
        scheduleRoomCleanup(roomId);
      } else {
        if (room.hostId === socket.id) {
          room.hostId = room.players[0].id;
        }
        io.to(roomId).emit("player_left", { playerId: socket.id });
        cancelPreGameIfNeeded(roomId);
        emitRoomState(roomId);
        startPreGameCountdown(roomId);
      }

      io.to("lobby").emit("room_list", getRoomList());
    });

    socket.on("player_ready", ({ roomId }) => {
      const room = rooms.get(roomId);

      if (!room || room.gameState !== "waiting") return;

      const player = room.players.find(
        (roomPlayer) => roomPlayer.id === socket.id,
      );
      if (!player) return;

      player.status = "ready";
      emitRoomState(roomId);
      startPreGameCountdown(roomId);
    });

    socket.on("start_game", ({ roomId }) => {
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

      room.players.forEach((player) => {
        player.status = "ready";
      });
      room.resultPlayers = [];
      room.currentRound = 0;
      room.totalRounds = MAX_ROUNDS;
      emitRoomState(roomId);
      startPreGameCountdown(roomId);
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
      const room = rooms.get(roomId);
      if (room) {
        room.drawings = [];
        emitRoomState(roomId);
      }
      io.to(roomId).emit("canvas_cleared");
    });

    socket.on("chat_message", ({ roomId, message }) => {
      const room = rooms.get(roomId);

      if (!room) return;

      const chatMsg = {
        playerId: socket.id,
        message,
        timestamp: Date.now(),
        isCorrect: false,
      };
      room.messages.push(chatMsg);

      const isCorrectGuessResult =
        room.gameState === "drawing" &&
        room.currentWord &&
        isCorrectGuess(message, room.currentWord);

      if (isCorrectGuessResult) {
        chatMsg.isCorrect = true;
        const correctWord = room.currentWord;
        clearGameTimers(roomId);

        io.to(roomId).emit("correct_guess", {
          playerId: socket.id,
          word: correctWord,
        });

        if (room.currentRound >= room.totalRounds) {
          finishGame(roomId);
        } else {
          startDrawingRound(roomId);
        }
      }

      io.to(roomId).emit("new_message", { message: chatMsg });
    });

    socket.on("next_word", ({ roomId }) => {
      const room = rooms.get(roomId);

      if (!room) return;

      startDrawingRound(roomId);
    });

    socket.on("disconnect", () => {
      console.log("Player disconnected:", socket.id);

      for (const [roomId, room] of rooms.entries()) {
        const playerIndex = room.players.findIndex(
          (player) => player.id === socket.id,
        );
        if (playerIndex === -1) continue;

        if (
          room.gameState === "countdown" ||
          room.gameState === "starting" ||
          room.gameState === "drawing"
        ) {
          socket.leave(roomId);
          continue;
        }

        room.players.splice(playerIndex, 1);
        socket.leave(roomId);

        if (room.players.length === 0) {
          scheduleRoomCleanup(roomId);
        } else {
          if (room.hostId === socket.id) {
            room.hostId = room.players[0].id;
          }
          io.to(roomId).emit("player_left", { playerId: socket.id });
          cancelPreGameIfNeeded(roomId);
          emitRoomState(roomId);
          startPreGameCountdown(roomId);
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
