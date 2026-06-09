"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import io from "socket.io-client";

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
  resultPlayers?: Player[];
  currentRound?: number;
  totalRounds?: number;
  gameState: "finished";
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

export default function ResultPage() {
  const params = useParams<{ roomId: string }>();
  const router = useRouter();
  const roomId = params.roomId || "";
  const socketRef = useRef<ReturnType<typeof io> | null>(null);
  const [room, setRoom] = useState<Room | null>(null);

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

    const socket = io();
    socketRef.current = socket;

    socket.on("connect", () => {
      socket.emit("join_room", {
        roomId,
        playerName,
        playerKey: getPlayerKey(),
      });
    });

    socket.on("room_joined", (data: { room: Room }) => {
      setRoom(data.room);
    });

    socket.on("room_update", (data: { room: Room }) => {
      setRoom(data.room);
    });

    return () => {
      socket.off("error");
      socket.disconnect();
      socketRef.current = null;
    };
  }, [roomId, router]);

  const leaveRoom = () => {
    socketRef.current?.emit("leave_room", { roomId });
    router.push("/");
  };

  const playersToShow = room?.resultPlayers ?? room?.players ?? [];

  return (
    <main className="doodle-shell min-h-screen text-zinc-950">
      <div className="mx-auto flex min-h-screen max-w-3xl items-center justify-center px-6 py-10">
        <section className="doodle-card w-full p-8 text-center md:p-10">
          <p className="doodle-pill inline-flex items-center px-4 py-2 text-sm font-semibold uppercase tracking-[0.18em]">
            Match complete
          </p>
          <h1 className="mt-5 text-4xl font-black tracking-tight md:text-5xl">
            Game Finished!
          </h1>
          <p className="mt-4 text-zinc-700">
            The game has finished. See the winner, admire, then head back home,
            idiot
          </p>

          <div className="mt-8 rounded-3xl border-2 border-zinc-950 bg-white p-5 text-left shadow-[5px_5px_0_#111]">
            <p className="text-sm uppercase tracking-[0.18em] text-zinc-600">
              Room
            </p>
            <p className="mt-2 text-xl font-black">{roomId}</p>
          </div>

          <div className="mt-8 rounded-3xl border-2 border-zinc-950 bg-white p-5 text-left shadow-[5px_5px_0_#111]">
            <h2 className="text-lg font-black">Players</h2>
            <div className="mt-4 space-y-2">
              {playersToShow.map((player) => (
                <div
                  key={player.id}
                  className="flex items-center justify-between rounded-2xl border border-zinc-950/10 bg-zinc-50 px-4 py-3"
                >
                  <span className="font-semibold">{player.name}</span>
                  <span className="text-xs uppercase tracking-[0.18em] text-zinc-600">
                    {player.id === room?.hostId ? "Host" : "Player"}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={leaveRoom}
            className="doodle-button doodle-button-secondary mt-8 w-full cursor-pointer px-4 py-3 font-bold uppercase tracking-[0.18em] md:w-auto"
          >
            Leave Room
          </button>
        </section>
      </div>
    </main>
  );
}
