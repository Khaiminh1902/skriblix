/* eslint-disable @typescript-eslint/no-require-imports */
/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { FaTrophy } from "react-icons/fa";
import { DoodleLoadingScreen } from "@/app/components/doodle-loading-screen";
import { DoodleErrorPopup } from "@/app/components/doodle-error-popup";

const PLAYER_KEY_STORAGE_KEY = "skriblix-player-key";

function normalizeGuess(text: string): string {
  return text.toLowerCase().replace(/\s+/g, "").replace(/[^\w]/g, "");
}

function isCorrectGuess(guess: string, answer: string): boolean {
  const normalizedGuess = normalizeGuess(guess);
  const normalizedAnswer = normalizeGuess(answer);
  return normalizedGuess === normalizedAnswer;
}

interface Player {
  id: string;
  name: string;
  status: string;
  score?: number;
}

interface RoomMessage {
  playerId: string;
  message: string;
  timestamp: number;
  isCorrect: boolean;
}

interface DrawingSegment {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

interface Room {
  id: string;
  theme: string;
  hostId: string;
  players: Player[];
  drawer: string | null;
  currentWord: string | null;
  drawings: DrawingSegment[];
  messages: RoomMessage[];
  gameState: "waiting" | "countdown" | "starting" | "drawing" | "finished";
  currentRound?: number;
  totalRounds?: number;
  countdownEndsAt?: number | null;
  loadingEndsAt?: number | null;
  countdownRemaining?: number | null;
}

function getPlayerKey() {
  const existingKey = window.localStorage.getItem(PLAYER_KEY_STORAGE_KEY);
  if (existingKey) return existingKey;

  const nextKey =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `player-${Math.random().toString(36).slice(2, 10)}`;
  window.localStorage.setItem(PLAYER_KEY_STORAGE_KEY, nextKey);
  return nextKey;
}

export default function RoomGamePage() {
  const params = useParams<{ roomId: string }>();
  const router = useRouter();
  const roomId = params.roomId || "";
  const [isOpen, setIsOpen] = useState(false);
  const [room, setRoom] = useState<Room | null>(null);
  const [message, setMessage] = useState("");
  const [guess, setGuess] = useState("");
  const [guessResult, setGuessResult] = useState<
    "correct" | "incorrect" | null
  >(null);
  const [now, setNow] = useState(() => Date.now());
  const [playerId, setPlayerId] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const clearCanvasRef = useRef<((notifyServer?: boolean) => void) | undefined>(
    undefined,
  );
  const nextWordRef = useRef<(() => void) | undefined>(undefined);
  const socketRef = useRef<any>(null);

  const isDrawer = room?.drawer === playerId;
  const isSpectator = false;

  const drawSegment = useCallback((drawing: DrawingSegment) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    ctx.beginPath();
    ctx.moveTo(drawing.startX, drawing.startY);
    ctx.lineTo(drawing.endX, drawing.endY);
    ctx.stroke();
  }, []);

  useEffect(() => {
    let playerName = "";

    if (typeof window !== "undefined") {
      const action = sessionStorage.getItem("skriblix-room-action");

      if (action === "create") {
        playerName =
          sessionStorage.getItem("skriblix-create-player-name") || "";
      } else if (action === "join") {
        playerName = sessionStorage.getItem("skriblix-join-player-name") || "";
      }
    }
    const socketIo = require("socket.io-client");
    const socket = socketIo();
    socketRef.current = socket;

    socket.on("connect", () => {
      socket.emit("join_room", {
        roomId,
        playerName,
        playerKey: getPlayerKey(),
      });
    });

    socket.on("room_joined", (data: any) => {
      setPlayerId(data.playerId);
      setRoom(data.room);
    });

    socket.on("room_created", (data: any) => {
      setPlayerId(data.playerId);
      setRoom(data.room);
    });

    socket.on("room_update", (data: any) => {
      setRoom(data.room);
    });

    socket.on("game_started", (data: any) => {
      setRoom(data.room);
    });

    socket.on("new_round", (data: any) => {
      setIsOpen(false);
      setGuess("");
      setGuessResult(null);
      setRoom((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          drawer: data.drawerId,
          currentWord: data.word,
          gameState: "drawing",
        };
      });
      clearCanvasRef.current?.(false);
    });

    socket.on("drawing_update", (data: any) => {
      drawSegment(data.drawing);
    });

    socket.on("canvas_cleared", () => {
      clearCanvasRef.current?.(false);
    });

    socket.on("new_message", (data: any) => {
      setRoom((prev) => {
        if (!prev) return prev;
        const existing = prev.messages.find(
          (item) => item.timestamp === data.message.timestamp,
        );
        if (existing) return prev;
        return { ...prev, messages: [...prev.messages, data.message] };
      });
    });

    socket.on("game_state_update", (data: any) => {
      setRoom(data.room);
    });

    socket.on("countdown_tick", (data: any) => {
      if (data.gameState === "drawing") {
        setRoom((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            countdownRemaining: data.countdownRemaining ?? null,
          };
        });
      }
    });

    socket.on("correct_guess", () => {
      clearCanvasRef.current?.(false);
    });

    socket.on("game_finished", () => {
      router.replace(`/room/${roomId}/game/result`);
    });

    socket.on("error", (data: any) => {
      setErrorMessage(data.message || "Unable to join room");
      router.push("/");
    });

    return () => {
      socket.off("error");
      socket.disconnect();
      socketRef.current = null;
    };
  }, [drawSegment, roomId, router]);

  useEffect(() => {
    if (room?.gameState === "finished") {
      router.replace(`/room/${roomId}/game/result`);
    }
  }, [room?.gameState, roomId, router]);

  useEffect(() => {
    if (room?.gameState !== "drawing") {
      return;
    }

    const interval = window.setInterval(() => {
      setNow(Date.now());
    }, 250);

    return () => window.clearInterval(interval);
  }, [room?.gameState]);

  const roundCountdown =
    room?.gameState === "drawing"
      ? typeof room.countdownRemaining === "number"
        ? room.countdownRemaining
        : room.countdownEndsAt
          ? Math.max(0, Math.ceil((room.countdownEndsAt - now) / 1000))
          : null
      : null;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (room?.gameState !== "drawing") return;

    room.drawings.forEach((drawing) => {
      drawSegment(drawing);
    });
  }, [drawSegment, room?.drawings, room?.gameState]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    clearCanvasRef.current = (notifyServer = true) => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (notifyServer) {
        socketRef.current?.emit("clear_canvas", { roomId });
      }
    };

    nextWordRef.current = () => {
      socketRef.current?.emit("next_word", { roomId });
    };

    let isDrawing = false;
    let lastPos: { x: number; y: number } | null = null;

    const getCanvasPos = (e: MouseEvent | TouchEvent) => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;

      if ("touches" in e) {
        return {
          x: (e.touches[0].clientX - rect.left) * scaleX,
          y: (e.touches[0].clientY - rect.top) * scaleY,
        };
      }

      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY,
      };
    };

    const handleMouseDown = (e: MouseEvent) => {
      if (!isDrawer || isSpectator || room?.gameState !== "drawing") return;
      isDrawing = true;
      lastPos = getCanvasPos(e);
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDrawing || !isDrawer || room?.gameState !== "drawing") return;
      const pos = getCanvasPos(e);
      if (!lastPos) return;

      drawSegment({
        startX: lastPos.x,
        startY: lastPos.y,
        endX: pos.x,
        endY: pos.y,
      });

      socketRef.current?.emit("drawing", {
        roomId,
        drawing: {
          startX: lastPos.x,
          startY: lastPos.y,
          endX: pos.x,
          endY: pos.y,
        },
      });

      lastPos = pos;
    };

    const handlePointerUp = () => {
      isDrawing = false;
      lastPos = null;
    };

    const handleTouchStart = (e: TouchEvent) => {
      if (!isDrawer || isSpectator || room?.gameState !== "drawing") return;
      e.preventDefault();
      isDrawing = true;
      lastPos = getCanvasPos(e);
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isDrawing || !isDrawer || room?.gameState !== "drawing") return;
      e.preventDefault();
      const pos = getCanvasPos(e);
      if (!lastPos) return;

      drawSegment({
        startX: lastPos.x,
        startY: lastPos.y,
        endX: pos.x,
        endY: pos.y,
      });

      socketRef.current?.emit("drawing", {
        roomId,
        drawing: {
          startX: lastPos.x,
          startY: lastPos.y,
          endX: pos.x,
          endY: pos.y,
        },
      });

      lastPos = pos;
    };

    const handleTouchEnd = (e: TouchEvent) => {
      e.preventDefault();
      handlePointerUp();
    };

    canvas.addEventListener("mousedown", handleMouseDown);
    canvas.addEventListener("mousemove", handleMouseMove);
    canvas.addEventListener("mouseup", handlePointerUp);
    canvas.addEventListener("mouseleave", handlePointerUp);
    canvas.addEventListener("touchstart", handleTouchStart, { passive: false });
    canvas.addEventListener("touchmove", handleTouchMove, { passive: false });
    canvas.addEventListener("touchend", handleTouchEnd, { passive: false });

    return () => {
      canvas.removeEventListener("mousedown", handleMouseDown);
      canvas.removeEventListener("mousemove", handleMouseMove);
      canvas.removeEventListener("mouseup", handlePointerUp);
      canvas.removeEventListener("mouseleave", handlePointerUp);
      canvas.removeEventListener("touchstart", handleTouchStart);
      canvas.removeEventListener("touchmove", handleTouchMove);
      canvas.removeEventListener("touchend", handleTouchEnd);
    };
  }, [drawSegment, isDrawer, isSpectator, room?.gameState, roomId]);

  const sendMessage = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!message.trim() || !playerId) return;

    socketRef.current?.emit("chat_message", {
      roomId,
      message: message.trim(),
      playerId,
    });
    setMessage("");
  };

  const submitGuess = () => {
    if (!guess.trim() || !playerId || !room?.currentWord || isDrawer) return;

    const isCorrect = isCorrectGuess(guess, room.currentWord);

    socketRef.current?.emit("chat_message", {
      roomId,
      message: guess.trim(),
      playerId,
    });

    setGuessResult(isCorrect ? "correct" : "incorrect");
    setGuess("");

    setTimeout(() => {
      setIsOpen(false);
      setGuessResult(null);
    }, 1500);
  };

  if (!room) {
    return (
      <DoodleLoadingScreen
        badge="Joining"
        title="Opening the sketchbook"
        subtitle="Loading your drawing workspace..."
        roomId={roomId}
      />
    );
  }

  return (
    <div className="doodle-shell min-h-screen text-zinc-950">
      {errorMessage && (
        <DoodleErrorPopup
          message={errorMessage}
          onClose={() => setErrorMessage(null)}
        />
      )}
      <div className="mx-auto max-w-7xl px-6 py-8 md:px-8 md:py-10">
        <div className="flex justify-between">
          <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-4xl font-black tracking-tight">Skriblix</h1>
              <p className="mt-1 text-sm uppercase tracking-[0.16em] text-zinc-700">
                Room: {roomId}
              </p>
            </div>
          </div>
          <div className="doodle-card mb-10 p-2 flex items-center justify-center min-w-32 h-13 font-bold text-center">
            <p>
              ROUND: {room.currentRound ?? 1}/{room.totalRounds ?? 10}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <div className="doodle-card p-5 md:p-6">
              <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                {isDrawer ? (
                  <div>
                    <div className="flex flex-wrap items-center gap-3">
                      <p className="text-sm uppercase font-semibold tracking-[0.14em] text-zinc-600">
                        Your word
                      </p>
                      <p className="rounded-xl border-zinc-950 bg-zinc-950 px-4 py-1.5 text-[24px] font-black text-white uppercase">
                        {room.currentWord ?? "???"}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div />
                )}
                <div className="sm:text-right">
                  <p className="text-sm uppercase tracking-[0.14em] text-zinc-600">
                    Current Drawer
                  </p>
                  <p className="text-lg font-black text-zinc-950">
                    {room.players.find((p) => p.id === room.drawer)?.name ||
                      "No players found"}
                  </p>
                </div>
              </div>

              {room.gameState === "drawing" && roundCountdown !== null && (
                <div className="mb-4">
                  <div className="flex items-center gap-3">
                    <p className="text-sm uppercase tracking-[0.14em] text-zinc-600 font-semibold">
                      Time left
                    </p>
                    <div className="h-3 flex-1 overflow-hidden rounded-full border-2 border-zinc-950 bg-white">
                      <div
                        className="h-full bg-zinc-950 transition-all duration-1000"
                        style={{
                          width: `${(Math.max(0, roundCountdown) / 60) * 100}%`,
                        }}
                      />
                    </div>
                    <p className="w-12 text-xl font-black text-zinc-950">
                      {roundCountdown}s
                    </p>
                  </div>
                </div>
              )}

              <div className="relative overflow-hidden rounded-2xl border-2 border-zinc-950 bg-white shadow-[4px_4px_0_#111]">
                <canvas
                  ref={canvasRef}
                  width={800}
                  height={500}
                  className="block h-auto max-w-full cursor-crosshair"
                  style={{ touchAction: "none" }}
                />
                {isDrawer ? (
                  <button
                    type="button"
                    aria-label="Clear canvas"
                    title="Clear canvas"
                    onClick={() => clearCanvasRef.current?.()}
                    className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-xl border-2 border-zinc-950 bg-white text-zinc-950 shadow-[3px_3px_0_#111] transition hover:translate-x-px hover:translate-y-px hover:shadow-[2px_2px_0_#111] cursor-pointer"
                  >
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 24 24"
                      className="h-5 w-5"
                      fill="none"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2.25"
                    >
                      <path d="M3 6h18" />
                      <path d="M8 6V4h8v2" />
                      <path d="M6 6l1 16h10l1-16" />
                      <path d="M10 11v6" />
                      <path d="M14 11v6" />
                    </svg>
                  </button>
                ) : null}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="doodle-card p-4">
              <h3 className="mb-3 text-lg font-black">Players</h3>
              <div className="space-y-2">
                {room.players.map((roomPlayer) => (
                  <div
                    key={roomPlayer.id}
                    className={`flex items-center gap-3 rounded-xl border-2 p-3 ${
                      roomPlayer.id === room.drawer
                        ? "border-zinc-950 bg-zinc-950 text-white"
                        : "border-zinc-950 bg-white"
                    }`}
                  >
                    <div
                      className={`h-3 w-3 rounded-full border border-current ${
                        roomPlayer.status === "ready"
                          ? "bg-current"
                          : "bg-white"
                      }`}
                    />
                    <span className="font-semibold">{roomPlayer.name}</span>
                    <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
                      {roomPlayer.id === room.hostId ? (
                        <span className="rounded-full border border-current px-2 py-0.5 text-xs font-bold uppercase tracking-[0.12em]">
                          Host
                        </span>
                      ) : null}
                      {roomPlayer.id === room.drawer ? (
                        <span className="rounded-full border border-white px-2 py-0.5 text-xs font-bold uppercase tracking-[0.12em]">
                          Drawer
                        </span>
                      ) : null}
                      <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/40 bg-amber-100 px-2 py-0.5 text-xs font-black uppercase tracking-[0.12em] text-amber-700 shadow-[inset_0_0_0_1px_rgba(251,191,36,0.2)]">
                        <FaTrophy className="text-amber-500" />
                        {roomPlayer.score ?? 0}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="doodle-card flex min-h-100 flex-1 flex-col p-4">
              <h3 className="mb-3 text-lg font-black">Chat</h3>
              <div className="mb-4 h-65 space-y-2 overflow-y-auto thin-black-scrollbar">
                {room.messages.length === 0 ? (
                  <p className="text-sm text-zinc-600">
                    No messages yet. Start chatting!
                  </p>
                ) : (
                  room.messages.map((roomMessage, index) => (
                    <div
                      key={index}
                      className="rounded-xl border-2 border-zinc-950 bg-white px-3 py-2"
                    >
                      <div className="flex items-baseline gap-2">
                        <span className="text-sm font-semibold text-zinc-600">
                          {room.players.find(
                            (roomPlayer) =>
                              roomPlayer.id === roomMessage.playerId,
                          )?.name || "Unknown"}
                        </span>
                        <span
                          className={`text-sm ${
                            roomMessage.isCorrect
                              ? "font-bold text-zinc-950"
                              : "text-zinc-800"
                          }`}
                        >
                          {roomMessage.message}
                          {roomMessage.isCorrect ? " ✅" : ""}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {!isSpectator ? (
                <form
                  onSubmit={(e) => {
                    sendMessage(e);
                  }}
                  className="flex gap-2"
                >
                  <input
                    type="text"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Type a message..."
                    className="doodle-input min-w-0 flex-1 px-4 py-3 text-sm"
                    maxLength={120}
                  />
                  <button
                    type="submit"
                    className="doodle-button doodle-button-secondary px-4 py-3 font-bold uppercase tracking-[0.12em] cursor-pointer text-sm"
                  >
                    Send
                  </button>
                </form>
              ) : null}
            </div>
            {!isSpectator && !isDrawer ? (
              <div>
                <button
                  type="button"
                  className="flex justify-center items-center text-xl font-bold doodle-button doodle-button-secondary w-30 mx-auto h-12 mt-6 cursor-pointer"
                  onClick={() => setIsOpen(true)}
                >
                  GUESS
                </button>
              </div>
            ) : null}
            {isOpen && (
              <div
                className="fixed inset-0 flex items-center justify-center bg-black/40"
                onClick={() => setIsOpen(false)}
              >
                <div
                  className="relative bg-white p-8 rounded-lg doodle-card"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    className="absolute top-2 right-4.5 text-xl font-bold cursor-pointer"
                    onClick={() => setIsOpen(false)}
                    aria-label="Close modal"
                  >
                    ×
                  </button>

                  <h2 className="text-2xl font-bold mb-6 flex items-center justify-center">
                    YOUR GUESS
                  </h2>

                  {guessResult ? (
                    <div
                      className={`text-center text-3xl font-black mb-4 ${
                        guessResult === "correct"
                          ? "text-green-600"
                          : "text-red-600"
                      }`}
                    >
                      {guessResult === "correct"
                        ? "You guessed correct!"
                        : "Not quite! Try again!"}
                    </div>
                  ) : (
                    <>
                      <div>
                        <input
                          className="outline-none border-2 p-2 rounded-xl w-65 placeholder:text-[15px] text-[15px]"
                          placeholder="Your guess..."
                          value={guess}
                          onChange={(e) => setGuess(e.target.value)}
                          onKeyPress={(e) => {
                            if (e.key === "Enter") submitGuess();
                          }}
                          autoFocus
                        />
                      </div>

                      <button
                        onClick={submitGuess}
                        className="mt-5 px-4 py-2 rounded doodle-button doodle-button-secondary flex items-center justify-center text-center w-full cursor-pointer"
                      >
                        Submit
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
