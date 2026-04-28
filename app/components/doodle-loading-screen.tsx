"use client";

type DoodleLoadingScreenProps = {
  title: string;
  subtitle: string;
  badge?: string;
  roomId?: string;
  fullscreen?: boolean;
};

export function DoodleLoadingScreen({
  title,
  subtitle,
  badge = "Loading",
  roomId,
  fullscreen = true,
}: DoodleLoadingScreenProps) {
  return (
    <div
      className={`doodle-shell text-zinc-950 ${
        fullscreen ? "flex min-h-screen" : "flex min-h-full"
      } items-center justify-center px-6 py-10`}
    >
      <div className="doodle-card doodle-loading-card w-full max-w-xl p-8 text-center md:p-10">
        <p className="doodle-pill inline-flex items-center px-4 py-2 text-sm font-semibold uppercase tracking-[0.18em]">
          {badge}
        </p>
        <h1 className="mt-5 text-4xl font-black tracking-tight md:text-5xl">
          {title}
        </h1>
        <p className="mt-4 text-sm leading-7 text-zinc-700 md:text-base">
          {subtitle}
        </p>
        {roomId ? (
          <p className="mt-5 text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
            Room {roomId}
          </p>
        ) : null}

        <div className="mt-8 flex items-center justify-center gap-3">
          <span className="doodle-loader-dot" />
          <span className="doodle-loader-dot" />
          <span className="doodle-loader-dot" />
        </div>

        <div className="mt-8 rounded-2xl border-2 border-dashed border-zinc-950 bg-zinc-50 px-5 py-4 text-left">
          <div className="flex items-center gap-3">
            <span className="rounded-full border-2 border-zinc-950 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em]">
              Ink
            </span>
            <div className="h-2 flex-1 overflow-hidden rounded-full border-2 border-zinc-950 bg-white">
              <div className="doodle-loader-line h-full w-2/3 bg-zinc-950" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
