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

interface Room {
  id: string;
  theme: string;
  hostId: string;
  players: Player[];
  drawer: string | null;
  currentWord: string | null;
  drawings: any[];
  messages: any[];
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

export default function RoomPage() {
  const params = useParams<{ roomId: string }>();
  const router = useRouter();
  const roomId = params.roomId || "";

  const [room, setRoom] = useState<Room | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copyLabel, setCopyLabel] = useState("Copy");

  const socketRef = useRef<any>(null);
  const copyResetRef = useRef<NodeJS.Timeout | null>(null);

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
      setRoom(data.room);
    });

    socket.on("room_created", (data: any) => {
      setRoom(data.room);
    });

    socket.on("room_update", (data: any) => {
      setRoom(data.room);
    });

    socket.on("game_started", (data: any) => {
      setRoom(data.room);
    });

    socket.on("new_round", (data: any) => {
      setRoom(data.room);
    });

    socket.on("game_state_update", (data: any) => {
      setRoom(data.room);
    });

    socket.on("error", (data: any) => {
      setErrorMessage(data.message || "Unable to join room");
      router.push("/");
    });

    return () => {
      if (copyResetRef.current) {
        clearTimeout(copyResetRef.current);
      }
      socket.off("error");
      socket.disconnect();
      socketRef.current = null;
    };
  }, [roomId, router]);

  useEffect(() => {
    if (room?.gameState === "starting" || room?.gameState === "drawing") {
      router.replace(`/room/${roomId}/game`);
    }
  }, [room, roomId, router]);

   const playerName =
     typeof window !== "undefined"
       ? (localStorage.getItem("skriblix-join-name") ||
           localStorage.getItem("skriblix-create-name") ||
           "")
       : "";
   const playerId = room?.players.find((p) => p.name === playerName)?.id || "";
  const isHost = room?.hostId === playerId;
  const canStartGame = Boolean(
    room?.gameState === "waiting" && room.players.length >= 2 && isHost,
  );

  const startGame = () => {
    socketRef.current?.emit("start_game", { roomId });
  };

  const leaveRoom = () => {
    socketRef.current?.emit("leave_room", { roomId });
    router.push("/");
  };

  const copyRoomId = async () => {
    try {
      await navigator.clipboard.writeText(roomId);
      setCopyLabel("Copied");
      if (copyResetRef.current) {
        clearTimeout(copyResetRef.current);
      }
      copyResetRef.current = setTimeout(() => {
        setCopyLabel("Copy");
      }, 1500);
    } catch {
      setCopyLabel("Failed");
    }
  };

  if (!room) {
    return (
      <DoodleLoadingScreen
        badge="Joining"
        title="Opening the waiting room"
        subtitle="Checking the room code and pulling down the latest player list."
        roomId={roomId}
      />
    );
  }

  if (room.gameState === "starting" || room.gameState === "drawing") {
    return (
      <DoodleLoadingScreen
        badge="Redirecting"
        title="Taking you to the game"
        subtitle="Loading the drawing board..."
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

        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <section className="doodle-card p-8 md:p-10">
            <p className="doodle-pill inline-flex items-center px-4 py-2 text-sm font-semibold uppercase tracking-[0.18em]">
              Waiting Room
            </p>
            <h2 className="mt-5 text-4xl font-black tracking-tight md:text-5xl">
              {room.gameState === "countdown"
                ? "Pencils up"
                : "Gather your players"}
            </h2>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-zinc-700 md:text-base">
              {room.gameState === "countdown"
                ? "The round is about to start. Hold tight while everyone enters together."
                : "You need at least two players before the game can start. Share the room code and wait for the crew to assemble."}
            </p>

            <div className="mt-8 rounded-4xl border-2 border-zinc-950 bg-white px-6 py-8 text-center shadow-[6px_6px_0_#111]">
              {room.gameState === "countdown" ? (
                <>
                  <p className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-600">
                    Starting In
                  </p>
                  <p className="mt-4 text-7xl font-black tracking-tight md:text-8xl">
                    --
                  </p>
                  <p className="mt-4 text-sm text-zinc-600">
                    The game opens right after the countdown finishes.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-600">
                    Players Ready
                  </p>
                  <p className="mt-4 text-6xl font-black tracking-tight">
                    {room.players.length}
                    <span className="ml-2 text-2xl text-zinc-500">/ 2+</span>
                  </p>
                  <p className="mt-4 text-sm text-zinc-600">
                    Start unlocks once at least two players are in the room.
                  </p>
                </>
              )}
            </div>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              {isHost ? (
                <button
                  onClick={startGame}
                  disabled={!canStartGame}
                  className="doodle-button px-6 py-4 text-lg font-bold uppercase tracking-[0.12em] cursor-pointer"
                >
                  {room.gameState === "countdown"
                    ? "Countdown Running"
                    : "Start Game"}
                </button>
              ) : (
                <div className="doodle-pill px-4 py-3 text-sm font-semibold uppercase tracking-[0.14em]">
                  Only host can start game
                </div>
              )}
              <p className="text-sm text-zinc-700">
                {room.players.length < 2
                  ? "Waiting for one more player to join."
                  : isHost
                    ? "Enough players are here. Start when everyone is ready."
                    : "Wait for the host to start the game."}
              </p>
            </div>
          </section>

          <aside className="space-y-6">
            <div className="doodle-card p-6">
              <h3 className="text-lg font-black uppercase tracking-[0.12em]">
                Room ID
              </h3>
              <div className="mt-3 flex items-center gap-3">
                <p className="text-4xl font-black tracking-tight">{roomId}</p>
                <button
                  type="button"
                  onClick={copyRoomId}
                  className="doodle-button doodle-button-secondary px-3 py-2 text-xs font-bold uppercase tracking-[0.12em] cursor-pointer"
                >
                  {copyLabel}
                </button>
              </div>
              <p className="mt-3 text-sm leading-6 text-zinc-700">
                Share this code so other players can join the waiting room
              </p>
            </div>

            <div className="doodle-card p-6">
              <h3 className="mb-4 text-lg font-black">Players</h3>
              <div className="space-y-3">
                {room.players.map((roomPlayer, index) => (
                  <div
                    key={roomPlayer.id}
                    className="flex items-center gap-3 rounded-2xl border-2 border-zinc-950 bg-white px-4 py-3"
                  >
                    <span className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-zinc-950 bg-zinc-950 text-sm font-black text-white">
                      {index + 1}
                    </span>
                    <div>
                      <p className="font-semibold text-zinc-950">
                        {roomPlayer.name}
                      </p>
                      <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">
                        {roomPlayer.id === room.hostId
                          ? "Host"
                          : roomPlayer.status || "Connected"}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
