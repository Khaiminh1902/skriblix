/* eslint-disable @typescript-eslint/no-require-imports */
/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useSearchParams } from "next/navigation";

interface Player {
  id: string;
  name: string;
  status: string;
}

interface Room {
  id: string;
  theme: string;
  players: Player[];
  drawer: string | null;
  currentWord: string | null;
  drawings: any[];
  messages: any[];
  gameState: string;
}

export default function RoomPage() {
  const params = useParams<{ roomId: string }>();
  const searchParams = useSearchParams();
  const roomId = params.roomId || "";
  const playerName = searchParams.get("playerName") || "";

  const [room, setRoom] = useState<Room | null>(null);
  const [message, setMessage] = useState("");
  const [countdown, setCountdown] = useState(60);
  const [playerId, setPlayerId] = useState("");

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const clearCanvasRef = useRef<(() => void) | undefined>(undefined);
  const nextWordRef = useRef<(() => void) | undefined>(undefined);

  const player = room?.players.find((p) => p.id === playerId);
  const isDrawer = room?.drawer === playerId;
  const isSpectator = !player;

  useEffect(() => {
    const socketIo = require("socket.io-client");
    const s = socketIo();
    (window as any).socket = s;

    s.on("connect", () => {
      s.emit("join_room", { roomId, playerName });
    });

    s.on("room_joined", (data: any) => {
      setPlayerId(data.playerId);
      setRoom(data.room);
    });

    s.on("room_update", (data: any) => {
      setRoom(data.room);
    });

    s.on("player_joined", (data: any) => {
      setRoom((prev: any) => {
        if (!prev) return prev;
        return { ...prev, players: [...prev.players, data.player] };
      });
    });

    s.on("player_left", (data: any) => {
      setRoom((prev: any) => {
        if (!prev) return prev;
        return {
          ...prev,
          players: prev.players.filter((p: any) => p.id !== data.playerId),
        };
      });
    });

    s.on("game_started", (data: any) => {
      setRoom(data.room);
    });

    s.on("new_round", (data: any) => {
      setRoom((prev: any) => {
        if (!prev) return prev;
        return { ...prev, gameState: "drawing", drawer: data.drawerId };
      });
      setCountdown(60);
      clearCanvasRef.current?.();
    });

    s.on("drawing_update", (data: any) => {
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

    s.on("canvas_cleared", () => {
      clearCanvasRef.current?.();
    });

    s.on("new_message", (data: any) => {
      setRoom((prev: any) => {
        if (!prev) return prev;
        const existing = prev.messages?.find(
          (m: any) => m.timestamp === data.message.timestamp,
        );
        if (existing) return prev;
        return { ...prev, messages: [...prev.messages, data.message] };
      });
    });

    s.on("correct_guess", () => {
      setRoom((prev: any) => {
        if (!prev) return prev;
        return { ...prev, gameState: "waiting" };
      });
    });

    s.on("game_state_update", (data: any) => {
      setRoom(data.room);
    });

    s.on("error", (data: any) => {
      alert(data.message || "Unable to join room");
      window.location.href = "/";
    });

    return () => {
      s.off("error");
      s.disconnect();
    };
  }, [roomId, playerName]);

  // Canvas drawing setup
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    clearCanvasRef.current = () => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      (window as any).socket?.emit("clear_canvas", { roomId });
    };

    nextWordRef.current = () => {
      (window as any).socket?.emit("next_word", { roomId });
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
      if (!isDrawer || isSpectator) return;
      isDrawing = true;
      lastPos = getCanvasPos(e);
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDrawing || !isDrawer) return;
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

      (window as any).socket?.emit("drawing", {
        roomId,
        drawing: {
          startX: lastPos!.x,
          startY: lastPos!.y,
          endX: pos.x,
          endY: pos.y,
        },
      });

      lastPos = pos;
    };

    const handleMouseUp = () => {
      isDrawing = false;
      lastPos = null;
    };

    const handleTouchStart = (e: TouchEvent) => {
      if (!isDrawer || isSpectator) return;
      e.preventDefault();
      isDrawing = true;
      lastPos = getCanvasPos(e);
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isDrawing || !isDrawer) return;
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

      (window as any).socket?.emit("drawing", {
        roomId,
        drawing: {
          startX: lastPos!.x,
          startY: lastPos!.y,
          endX: pos.x,
          endY: pos.y,
        },
      });

      lastPos = pos;
    };

    const handleTouchEnd = (e: TouchEvent) => {
      e.preventDefault();
      isDrawing = false;
      lastPos = null;
    };

    canvas.addEventListener("mousedown", handleMouseDown);
    canvas.addEventListener("mousemove", handleMouseMove);
    canvas.addEventListener("mouseup", handleMouseUp);
    canvas.addEventListener("mouseleave", handleMouseUp);
    canvas.addEventListener("touchstart", handleTouchStart, { passive: false });
    canvas.addEventListener("touchmove", handleTouchMove, { passive: false });
    canvas.addEventListener("touchend", handleTouchEnd, { passive: false });

    return () => {
      canvas.removeEventListener("mousedown", handleMouseDown);
      canvas.removeEventListener("mousemove", handleMouseMove);
      canvas.removeEventListener("mouseup", handleMouseUp);
      canvas.removeEventListener("mouseleave", handleMouseUp);
      canvas.removeEventListener("touchstart", handleTouchStart);
      canvas.removeEventListener("touchmove", handleTouchMove);
      canvas.removeEventListener("touchend", handleTouchEnd);
    };
  }, [isDrawer, isSpectator, roomId]);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (room?.gameState === "drawing" && isDrawer) {
      timer = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            nextWordRef.current?.();
            return 60;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [room?.gameState, isDrawer]);

  const sendMessage = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!message.trim() || !playerId) return;

    (window as any).socket?.emit("chat_message", {
      roomId,
      message: message.trim(),
      playerId,
    });
    setMessage("");
  };

  const startGame = () => {
    (window as any).socket?.emit("start_game", { roomId });
  };

  const leaveRoom = () => {
    (window as any).socket?.emit("leave_room", { roomId });
    window.location.href = "/";
  };

  if (!room) {
    return (
      <div className="doodle-shell flex min-h-screen items-center justify-center px-6 text-zinc-950">
        <div className="doodle-card px-8 py-6 text-center">
          <p className="text-lg font-semibold">Loading room...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="doodle-shell min-h-screen text-zinc-950">
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
            className="doodle-button doodle-button-secondary px-4 py-3 font-bold uppercase tracking-[0.12em]"
          >
            Leave Room
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <div className="doodle-card p-5 md:p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-sm uppercase tracking-[0.14em] text-zinc-600">
                    Theme:{" "}
                    <span className="font-bold text-zinc-950 capitalize">
                      {room.theme}
                    </span>
                  </p>
                  <p className="mt-2 text-sm text-zinc-700">
                    {isDrawer
                      ? `You are the drawer!`
                      : isSpectator
                        ? `Spectating`
                        : `Guess the word!`}
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

              {isDrawer && room.gameState === "drawing" && (
                <div className="mb-4">
                  <div className="flex items-center gap-4 mb-2">
                    <p className="text-sm uppercase tracking-[0.14em] text-zinc-600">
                      Your word
                    </p>
                    <p className="rounded-xl border-2 border-zinc-950 bg-zinc-950 px-4 py-2 text-2xl font-black text-white shadow-[4px_4px_0_#111]">
                      {room.theme === "doodle" ? "???" : room.currentWord}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <p className="text-sm uppercase tracking-[0.14em] text-zinc-600">
                      Time left
                    </p>
                    <div className="h-3 flex-1 overflow-hidden rounded-full border-2 border-zinc-950 bg-white">
                      <div
                        className="h-full bg-zinc-950 transition-all duration-1000"
                        style={{ width: `${(countdown / 60) * 100}%` }}
                      ></div>
                    </div>
                    <p className="w-12 text-xl font-black text-zinc-950">
                      {countdown}s
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

              {isDrawer && (
                <div className="flex gap-3 mt-4">
                  <button
                    onClick={() => clearCanvasRef.current?.()}
                    className="doodle-button doodle-button-secondary px-4 py-3 font-bold uppercase tracking-[0.12em]"
                  >
                    Clear Canvas
                  </button>
                </div>
              )}
            </div>

            <div className="doodle-card p-4">
              {room.gameState === "waiting" && (
                <div className="flex gap-3 items-center">
                  {room.players.length >= 2 && !room.drawer && (
                    <button
                      onClick={startGame}
                      className="doodle-button px-6 py-3 font-bold uppercase tracking-[0.12em]"
                    >
                      Start Game
                    </button>
                  )}
                  {room.drawer && (
                    <button
                      onClick={() => nextWordRef.current?.()}
                      className="doodle-button doodle-button-secondary px-6 py-3 font-bold uppercase tracking-[0.12em]"
                    >
                      Next Word
                    </button>
                  )}
                  <p className="text-sm text-zinc-700">
                    Players: {room.players.length}
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <div className="doodle-card p-4">
              <h3 className="mb-3 text-lg font-black">Players</h3>
              <div className="space-y-2">
                {room.players.map((p) => (
                  <div
                    key={p.id}
                    className={`flex items-center gap-3 rounded-xl border-2 p-3 ${
                      p.id === room.drawer
                        ? "border-zinc-950 bg-zinc-950 text-white shadow-[4px_4px_0_#111]"
                        : "border-zinc-950 bg-white"
                    }`}
                  >
                    <div
                      className={`h-3 w-3 rounded-full border border-current ${
                        p.status === "connected" ? "bg-current" : "bg-white"
                      }`}
                    ></div>
                    <span className="font-semibold">{p.name}</span>
                    {p.id === room.drawer && (
                      <span className="ml-auto rounded-full border border-white px-2 py-0.5 text-xs font-bold uppercase tracking-[0.12em]">
                        Drawer
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="doodle-card flex min-h-100 flex-1 flex-col p-4">
              <h3 className="mb-3 text-lg font-black">Chat</h3>
              <div className="flex-1 overflow-y-auto mb-4 space-y-2 max-h-75">
                {room.messages?.length === 0 ? (
                  <p className="text-sm text-zinc-600">
                    No messages yet. Start chatting!
                  </p>
                ) : (
                  room.messages?.map((msg, i) => {
                    const isCorrect = msg.isCorrect;
                    return (
                      <div
                        key={i}
                        className="rounded-xl border-2 border-zinc-950 bg-white px-3 py-2"
                      >
                        <div className="flex items-baseline gap-2">
                          <span className="text-sm font-semibold text-zinc-600">
                            {room.players.find((p) => p.id === msg.playerId)
                              ?.name || "Unknown"}
                          </span>
                          <span
                            className={`text-sm ${
                              isCorrect
                                ? "font-bold text-zinc-950"
                                : "text-zinc-800"
                            }`}
                          >
                            {msg.message}
                            {isCorrect && " ✅"}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
              {!isSpectator && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    sendMessage();
                  }}
                  className="flex gap-2"
                >
                  <input
                    type="text"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Type a guess..."
                    className="doodle-input flex-1 px-4 py-2"
                    disabled={isSpectator}
                  />
                  <button
                    type="submit"
                    className="doodle-button px-4 py-2 font-bold uppercase tracking-[0.12em]"
                    disabled={isSpectator}
                  >
                    Send
                  </button>
                </form>
              )}
              {isSpectator && (
                <p className="py-2 text-center text-sm text-zinc-600">
                  Spectator mode - cannot chat
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
