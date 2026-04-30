/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-require-imports */
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DoodleLoadingScreen } from "./components/doodle-loading-screen";
import { DoodleErrorPopup } from "./components/doodle-error-popup";

const TRANSITION_LOADING_MS = 1500;
const PLAYER_KEY_STORAGE_KEY = "skriblix-player-key";

function generateRoomId() {
  return String(Math.floor(100000 + Math.random() * 900000));
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

export default function HomeClient({
  initialRoomId,
}: {
  initialRoomId: string;
}) {
  const router = useRouter();
  const [createPlayerName, setCreatePlayerName] = useState(() => {
    if (typeof window === "undefined") return "";
    const saved = localStorage.getItem("skriblix-create-name");
    return saved || "";
  });
  const [joinPlayerName, setJoinPlayerName] = useState(() => {
    if (typeof window === "undefined") return "";
    const saved = localStorage.getItem("skriblix-join-name");
    return saved || "";
  });
  const [joinRoomId, setJoinRoomId] = useState("");
  const [draftRoomId, setDraftRoomId] = useState(initialRoomId);
  const [copyLabel, setCopyLabel] = useState("Copy room ID");
  const [pendingAction, setPendingAction] = useState<"create" | "join" | null>(
    null,
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const createPlayerNameRef = useRef("");
  const copyResetRef = useRef<NodeJS.Timeout | null>(null);
  const pendingNavigationTimerRef = useRef<NodeJS.Timeout | null>(null);
  const pendingActionStartedAtRef = useRef<number>(0);
  const socketRef = useRef<any>(null);

  useEffect(() => {
    createPlayerNameRef.current = createPlayerName;
  }, [createPlayerName]);

  useEffect(() => {
    const socketIo = require("socket.io-client");
    const s = socketIo();
    socketRef.current = s;

     s.on("room_created", (data: any) => {
      const elapsed = Date.now() - pendingActionStartedAtRef.current;
      const remainingDelay = Math.max(0, TRANSITION_LOADING_MS - elapsed);
      pendingNavigationTimerRef.current = setTimeout(() => {
        router.push(`/room/${data.room.id}`);
      }, remainingDelay);
    });

    s.on("error", (data: any) => {
      if (pendingNavigationTimerRef.current) {
        clearTimeout(pendingNavigationTimerRef.current);
        pendingNavigationTimerRef.current = null;
      }
      setPendingAction(null);
      setErrorMessage(data.message || "Something went wrong");
    });

    return () => {
      if (pendingNavigationTimerRef.current) {
        clearTimeout(pendingNavigationTimerRef.current);
        pendingNavigationTimerRef.current = null;
      }
      s.off("room_joined");
      s.off("room_created");
      s.off("error");
      s.disconnect();
      socketRef.current = null;
    };
  }, [router, pendingActionStartedAtRef]);

  const createRoom = () => {
    const name = createPlayerName.trim();
    if (!name) {
      setErrorMessage("Please enter your name");
      return;
    }
    if (!draftRoomId.trim()) {
      setErrorMessage("Please choose a room ID");
      return;
    }
    pendingActionStartedAtRef.current = Date.now();
    setPendingAction("create");
    socketRef.current?.emit("create_room", {
      playerName: name,
      playerKey: getPlayerKey(),
      theme: "doodle",
      roomId: draftRoomId.trim(),
    });
  };

  const joinRoom = () => {
    const name = joinPlayerName.trim();
    if (!name) {
      setErrorMessage("Please enter your name");
      return;
    }
    const normalizedRoomId = joinRoomId.replace(/\D/g, "").slice(0, 6);
    if (normalizedRoomId.length !== 6) {
      setErrorMessage("Please enter a 6-digit room ID");
      return;
    }
    pendingActionStartedAtRef.current = Date.now();
    setPendingAction("join");
    pendingNavigationTimerRef.current = setTimeout(() => {
      router.push(`/room/${normalizedRoomId}`);
    }, TRANSITION_LOADING_MS);
  };

  const rerollRoomId = () => {
    setDraftRoomId(generateRoomId());
    setCopyLabel("Copy room ID");
  };

  const copyRoomId = async () => {
    try {
      await navigator.clipboard.writeText(draftRoomId);
      setCopyLabel("Copied");
      if (copyResetRef.current) {
        clearTimeout(copyResetRef.current);
      }
      copyResetRef.current = setTimeout(() => {
        setCopyLabel("Copy room ID");
      }, 1500);
    } catch {
      setCopyLabel("Copy failed");
    }
  };

  if (pendingAction) {
    return (
      <DoodleLoadingScreen
        badge={pendingAction === "create" ? "Creating Room" : "Joining Room"}
        title={
          pendingAction === "create"
            ? "Sketchbook opening"
            : "Finding your table"
        }
        subtitle={
          pendingAction === "create"
            ? "Setting up a fresh room and pinning the room code to the corkboard."
            : "Checking the room code and pulling your seat into the waiting room."
        }
        roomId={pendingAction === "create" ? draftRoomId : joinRoomId}
      />
    );
  }

  return (
    <div className="doodle-shell text-zinc-950">
      {errorMessage && (
        <DoodleErrorPopup
          message={errorMessage}
          onClose={() => setErrorMessage(null)}
        />
      )}
      <div className="mx-auto max-w-5xl px-6 py-10 md:px-8 md:py-14">
        <div className="mb-14 text-center">
          <p className="doodle-pill mb-4 inline-flex items-center px-4 py-2 text-sm font-semibold uppercase tracking-[0.18em]">
            Lobby
          </p>
          <h1 className="mb-4 mt-5 text-5xl font-black tracking-tight md:text-7xl">
            Skriblix
          </h1>
        </div>

        <div className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr]">
          <section className="doodle-card p-8 md:p-10">
            <div className="mb-6 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-3xl font-black tracking-tight">
                  Create a new room
                </h2>
                <p className="mt-2 text-sm leading-6 text-zinc-700">
                  Pick a name, choose a room ID, and share it with others to
                  play
                </p>
              </div>
              <div className="hidden aspect-square h-16 shrink-0 items-center justify-center rounded-full bg-zinc-950 text-3xl text-white md:flex">
                ✎
              </div>
            </div>

            <input
              type="text"
              value={createPlayerName}
              onChange={(e) => {
                setCreatePlayerName(e.target.value);
                localStorage.setItem("skriblix-create-name", e.target.value);
              }}
              placeholder="Your name..."
              className="doodle-input min-w-48 w-full px-4 py-3 text-md"
              maxLength={20}
            />

            <div className="mt-5 rounded-2xl border-2 border-dashed border-zinc-950 bg-zinc-50 p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.16em] text-zinc-600">
                    Room ID
                  </p>
                  <p className="mt-1 text-2xl font-black tracking-tight">
                    {draftRoomId}
                  </p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={rerollRoomId}
                    className="doodle-button doodle-button-secondary px-4 py-3 text-sm font-bold uppercase tracking-[0.12em] cursor-pointer"
                  >
                    Reroll
                  </button>
                  <button
                    type="button"
                    onClick={copyRoomId}
                    className="doodle-button doodle-button-secondary px-4 py-3 text-sm font-bold uppercase tracking-[0.12em] cursor-pointer"
                  >
                    {copyLabel}
                  </button>
                </div>
              </div>
            </div>

            <button
              onClick={createRoom}
              className="doodle-button mt-5 w-full py-4 text-lg font-bold cursor-pointer"
            >
              Create New Room
            </button>
          </section>

          <aside className="doodle-card p-8">
            <h2 className="text-3xl font-black tracking-tight">Join a room</h2>
            <p className="mt-2 text-sm leading-6 text-zinc-700">
              Enter a 6-digit room ID to join an existing room
            </p>
            <input
              type="text"
              value={joinPlayerName}
              onChange={(e) => {
                setJoinPlayerName(e.target.value);
                localStorage.setItem("skriblix-join-name", e.target.value);
              }}
              placeholder="Your name..."
              className="doodle-input mt-5 w-full px-4 py-3 text-md"
              maxLength={20}
            />
            <input
              type="text"
              inputMode="numeric"
              value={joinRoomId}
              onChange={(e) =>
                setJoinRoomId(e.target.value.replace(/\D/g, "").slice(0, 6))
              }
              placeholder="Room ID"
              className="doodle-input mt-5 w-full px-4 py-3 text-md"
            />
            <button
              onClick={joinRoom}
              className="doodle-button doodle-button-secondary mt-5 w-full py-4 text-lg font-bold cursor-pointer"
            >
              Join Room
            </button>
          </aside>
        </div>
      </div>
    </div>
  );
}
