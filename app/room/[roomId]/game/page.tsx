/* eslint-disable @typescript-eslint/no-require-imports */
/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { DoodleLoadingScreen } from "@/app/components/doodle-loading-screen";
import { DoodleErrorPopup } from "@/app/components/doodle-error-popup";

const PLAYER_KEY_STORAGE_KEY = "skriblix-player-key";

interface Player {
  id: string;
  name: string;
  status: string;
}

interface RoomMessage {
  playerId: string;
  message: string;
  timestamp: number;
  isCorrect: boolean;
}

interface Room {
  id: string;
  theme: string;
  hostId: string;
  players: Player[];
  drawer: string | null;
  currentWord: string | null;
  drawings: any[];
  messages: RoomMessage[];
  gameState: "waiting" | "countdown" | "starting" | "drawing";
  countdownEndsAt?: number | null;
  loadingEndsAt?: number | null;
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

  const [room, setRoom] = useState<Room | null>(null);
  const [message, setMessage] = useState("");
  const [roundCountdown, setRoundCountdown] = useState(60);
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

   useEffect(() => {
     const playerName =
       typeof window !== "undefined"
         ? (localStorage.getItem("skriblix-join-name") ||
             localStorage.getItem("skriblix-create-name") ||
             "")
         : "";
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
      setRoundCountdown(60);
    });

    socket.on("new_round", (data: any) => {
      setRoom((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          drawer: data.drawerId,
          currentWord: data.word,
          gameState: "drawing",
        };
      });
      setRoundCountdown(60);
      clearCanvasRef.current?.(false);
    });

    socket.on("drawing_update", (data: any) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.strokeStyle = "#000000";
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      ctx.beginPath();
      ctx.moveTo(data.drawing.startX, data.drawing.startY);
      ctx.lineTo(data.drawing.endX, data.drawing.endY);
      ctx.stroke();
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

    socket.on("correct_guess", () => {
      clearCanvasRef.current?.(false);
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
   }, [roomId, router]);

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
      if ("touches" in e) {
        return {
          x: e.touches[0].clientX - rect.left,
          y: e.touches[0].clientY - rect.top,
        };
      }

      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
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

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.strokeStyle = "#000000";
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      ctx.beginPath();
      ctx.moveTo(lastPos.x, lastPos.y);
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();

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

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.strokeStyle = "#000000";
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      ctx.beginPath();
      ctx.moveTo(lastPos.x, lastPos.y);
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();

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
  }, [isDrawer, isSpectator, room?.gameState, roomId]);

  useEffect(() => {
    if (room?.gameState !== "drawing" || !isDrawer) return;

    const timer = setInterval(() => {
      setRoundCountdown((prev) => {
        if (prev <= 1) {
          nextWordRef.current?.();
          return 60;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isDrawer, room?.gameState]);

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

   const leaveRoom = () => {
     socketRef.current?.emit("leave_room", { roomId });
     router.push("/");
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
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-4xl font-black tracking-tight">Skriblix</h1>
            <p className="mt-1 text-sm uppercase tracking-[0.16em] text-zinc-700">
              Room: {roomId}
            </p>
          </div>
          <button
            onClick={leaveRoom}
            className="doodle-button doodle-button-secondary px-4 py-3 font-bold uppercase tracking-[0.12em] cursor-pointer"
          >
            Leave Room
          </button>
        </div>

        {room.gameState !== "drawing" ? (
          <section className="doodle-card p-8 md:p-10">
            <p className="doodle-pill inline-flex items-center px-4 py-2 text-sm font-semibold uppercase tracking-[0.18em]">
              Waiting Room
            </p>
            <h2 className="mt-5 text-4xl font-black tracking-tight md:text-5xl">
              Pencils up
            </h2>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-zinc-700 md:text-base">
              The round is about to start. Hold tight while everyone enters together.
            </p>

            <div className="mt-8 rounded-4xl border-2 border-zinc-950 bg-white px-6 py-8 text-center shadow-[6px_6px_0_#111]">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-600">
                Starting In
              </p>
            </div>
          </section>
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="space-y-4 lg:col-span-2">
              <div className="doodle-card p-5 md:p-6">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm uppercase tracking-[0.14em] text-zinc-600">
                      Theme:{" "}
                      <span className="font-bold text-zinc-950 capitalize">
                        {room.theme}
                      </span>
                    </p>
                    <p className="mt-2 text-sm text-zinc-700">
                      {isDrawer
                        ? "You are the drawer!"
                        : isSpectator
                          ? "Spectating"
                          : "Guess the word!"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm uppercase tracking-[0.14em] text-zinc-600">
                      Current Drawer
                    </p>
                    <p className="text-lg font-black text-zinc-950">
                      {room.players.find((p) => p.id === room.drawer)?.name ||
                        "-"}
                    </p>
                  </div>
                </div>

                {isDrawer && (
                  <div className="mb-4">
                    <div className="mb-2 flex items-center gap-4">
                      <p className="text-sm uppercase tracking-[0.14em] text-zinc-600">
                        Your word
                      </p>
                      <p className="rounded-xl border-2 border-zinc-950 bg-zinc-950 px-4 py-2 text-2xl font-black text-white shadow-[4px_4px_0_#111]">
                        {room.currentWord ?? "???"}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <p className="text-sm uppercase tracking-[0.14em] text-zinc-600">
                        Time left
                      </p>
                      <div className="h-3 flex-1 overflow-hidden rounded-full border-2 border-zinc-950 bg-white">
                        <div
                          className="h-full bg-zinc-950 transition-all duration-1000"
                          style={{ width: `${(roundCountdown / 60) * 100}%` }}
                        />
                      </div>
                      <p className="w-12 text-xl font-black text-zinc-950">
                        {roundCountdown}s
                      </p>
                    </div>
                  </div>
                )}

                <div className="overflow-hidden rounded-2xl border-2 border-zinc-950 bg-white shadow-[4px_4px_0_#111]">
                  <canvas
                    ref={canvasRef}
                    width={800}
                    height={500}
                    className="w-full cursor-crosshair"
                    style={{ touchAction: "none" }}
                  />
                </div>

                {isDrawer ? (
                  <div className="mt-4 flex gap-3">
                    <button
                      onClick={() => clearCanvasRef.current?.()}
                      className="doodle-button doodle-button-secondary px-4 py-3 font-bold uppercase tracking-[0.12em] cursor-pointer"
                    >
                      Clear Canvas
                    </button>
                  </div>
                ) : null}
              </div>

              <div className="doodle-card p-4">
                <div className="flex items-center gap-3">
                  <p className="text-sm text-zinc-700">
                    Players: {room.players.length}
                  </p>
                  {room.drawer ? (
                    <button
                      onClick={() => nextWordRef.current?.()}
                      className="doodle-button doodle-button-secondary px-6 py-3 font-bold uppercase tracking-[0.12em] cursor-pointer"
                    >
                      Next Word
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
                          ? "border-zinc-950 bg-zinc-950 text-white shadow-[4px_4px_0_#111]"
                          : "border-zinc-950 bg-white"
                      }`}
                    >
                      <div
                        className={`h-3 w-3 rounded-full border border-current ${
                          roomPlayer.status === "connected"
                            ? "bg-current"
                            : "bg-white"
                        }`}
                      />
                      <span className="font-semibold">{roomPlayer.name}</span>
                      {roomPlayer.id === room.hostId ? (
                        <span className="ml-auto rounded-full border border-current px-2 py-0.5 text-xs font-bold uppercase tracking-[0.12em]">
                          Host
                        </span>
                      ) : null}
                      {roomPlayer.id === room.drawer ? (
                        <span className="ml-auto rounded-full border border-white px-2 py-0.5 text-xs font-bold uppercase tracking-[0.12em]">
                          Drawer
                        </span>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>

              <div className="doodle-card flex min-h-100 flex-1 flex-col p-4">
                <h3 className="mb-3 text-lg font-black">Chat</h3>
                <div className="mb-4 max-h-75 flex-1 space-y-2 overflow-y-auto">
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
                      placeholder="Type your guess..."
                      className="doodle-input min-w-0 flex-1 px-4 py-3 text-sm"
                      maxLength={120}
                    />
                    <button
                      type="submit"
                      className="doodle-button px-4 py-3 font-bold uppercase tracking-[0.12em] cursor-pointer"
                    >
                      Send
                    </button>
                  </form>
                ) : null}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
