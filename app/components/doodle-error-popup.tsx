"use client";

type DoodleErrorPopupProps = {
  message: string;
  onClose: () => void;
};

export function DoodleErrorPopup({ message, onClose }: DoodleErrorPopupProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="fixed inset-0 bg-black/40" aria-hidden="true" />
      <div
        className="relative z-10 max-w-sm w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="doodle-card p-8 text-center">
          <div className="mb-5 flex items-center justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-zinc-950 bg-white text-4xl shadow-[4px_4px_0_#111111]">
              ✕
            </div>
          </div>
          <p className="text-lg font-bold leading-7 text-zinc-950">{message}</p>
          <button
            onClick={onClose}
            className="doodle-button mt-6 w-full py-3.5 text-sm font-bold uppercase tracking-[0.12em] cursor-pointer"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}

