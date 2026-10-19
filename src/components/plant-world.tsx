import { useEffect, useRef, useState } from "react";
import { Gamepad2 } from "lucide-react";
import { devices } from "@/game/devices";
import type { GameApi, HudState } from "@/game/create-game";

const EMPTY: HudState = {
  ready: false,
  journal: true,
  entered: false,
  split: false,
  nearPlant: false,
  padLabels: [null, null],
  error: null,
};

export function PlantWorld() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const apiRef = useRef<GameApi | null>(null);
  const splitRef = useRef(false);
  const drag = useRef<{ id: number; x: number; y: number; player: 0 | 1 } | null>(null);
  const [hud, setHud] = useState<HudState>(EMPTY);
  const [coarse, setCoarse] = useState(false);
  splitRef.current = hud.split;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let dispose = () => {};
    let dead = false;
    void import("@/game/create-game")
      .then(({ createGame }) => {
        if (dead || !canvasRef.current) return;
        dispose = createGame(canvasRef.current, {
          onHud: setHud,
          onReady: (api) => {
            apiRef.current = api;
          },
        });
      })
      .catch((error: unknown) => {
        setHud((prev) => ({
          ...prev,
          error: error instanceof Error ? error.message : "Die Welt konnte nicht starten.",
        }));
      });
    return () => {
      dead = true;
      dispose();
      apiRef.current = null;
    };
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse)");
    const sync = () => setCoarse(mq.matches || window.innerWidth < 820);
    sync();
    mq.addEventListener("change", sync);
    window.addEventListener("resize", sync);
    return () => {
      mq.removeEventListener("change", sync);
      window.removeEventListener("resize", sync);
    };
  }, []);

  function playerFor(clientX: number) {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || !splitRef.current) return 0 as const;
    return clientX > rect.left + rect.width / 2 ? (1 as const) : (0 as const);
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement;
    if (target.closest("[data-ui], [data-stick], button")) return;
    const player = playerFor(e.clientX);
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, player };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const current = drag.current;
    if (!current || current.id !== e.pointerId) return;
    const dx = e.clientX - current.x;
    const dy = e.clientY - current.y;
    current.x = e.clientX;
    current.y = e.clientY;
    devices.dragYaw[current.player] -= dx * 0.0033;
    devices.dragPitch[current.player] += dy * 0.0028;
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (drag.current?.id === e.pointerId) drag.current = null;
  }

  const padLine = hud.padLabels.filter(Boolean).join(" · ");

  return (
    <div
      className="relative h-dvh w-full touch-none overflow-hidden select-none"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      <div className="pointer-events-none absolute inset-0">
        <div className="flex items-start justify-between gap-3 p-4 sm:p-6">
          <div className="rounded-full bg-ink/75 px-4 py-2 text-cream">
            <p className="font-display text-lg leading-none">Pflanzen</p>
            <p className="mt-1 text-sm leading-none text-cream">Erde · ⌀ 10 km</p>
          </div>
          <div className="pointer-events-auto flex flex-wrap items-center justify-end gap-2">
            <p className="rounded-full bg-ink/75 px-3 py-2 text-sm text-cream">
              <Gamepad2 className="mr-1 inline size-4 align-text-bottom" aria-hidden="true" />
              {padLine || "Kein Controller"}
            </p>
            {hud.ready && !hud.split ? (
              <button
                type="button"
                className="h-11 rounded-full bg-cream px-4 text-sm font-semibold text-ink"
                onClick={() => apiRef.current?.joinSecond()}
              >
                Mitwanderer
              </button>
            ) : null}
            {hud.split ? (
              <button
                type="button"
                className="h-11 rounded-full bg-cream px-4 text-sm font-semibold text-ink"
                onClick={() => apiRef.current?.dismissSecond()}
              >
                Allein gehen
              </button>
            ) : null}
          </div>
        </div>

        {hud.split ? (
          <div className="absolute inset-x-0 top-24 flex justify-between px-4 text-sm text-cream sm:top-28">
            <span className="rounded-full bg-ink/70 px-3 py-1">Du</span>
            <span className="rounded-full bg-ink/70 px-3 py-1">Mitwanderer</span>
          </div>
        ) : null}

        {hud.journal ? (
          <div className="absolute inset-x-0 bottom-0 p-4 sm:p-6">
            <section
              data-ui
              className="pointer-events-auto w-full max-w-sm rounded-2xl border border-line bg-cream p-5 text-ink"
              onPointerDown={(e) => e.stopPropagation()}
            >
              <p className="text-sm font-semibold tracking-wide text-clay">Feldtagebuch · Schritt 2</p>
              <h1 className="mt-1 font-display text-4xl leading-none text-ink">Pflanzen</h1>
              <p className="mt-3 text-base leading-relaxed text-ink">
                Die ersten Pflanzen stehen auf der Kugel — noch ohne Namen. Geh hin und sieh sie dir an.
                Manche sind hoch, manche niedrig, hell oder dunkel.
              </p>
              <p className="mt-2 text-base leading-relaxed text-clay">
                Als Nächstes bestimmst du sie: Name, essbar oder giftig.
              </p>
              <button
                type="button"
                className="mt-4 h-11 w-full rounded-full bg-ink px-5 font-semibold text-cream disabled:opacity-60"
                disabled={!hud.ready}
                onClick={() => apiRef.current?.enter()}
              >
                {hud.ready ? (hud.entered ? "Weitergehen" : "Die Kugel betreten") : "Erde wird gelegt…"}
              </button>
              <ul className="mt-4 space-y-1 text-sm leading-relaxed text-ink">
                <li>WASD oder linker Stick — laufen</li>
                <li>Ziehen, Q und E, oder rechter Stick — schauen</li>
                <li>Umschalt oder Trigger — rennen</li>
                <li>Pfeile, O und P, oder zweiter Controller — Mitwanderer</li>
              </ul>
              <p className="mt-3 text-sm leading-relaxed text-clay">
                Bluetooth-Controller am Gerät koppeln, dann hier eine Taste drücken.
              </p>
              {hud.error ? <p className="mt-3 text-sm text-clay">{hud.error}</p> : null}
            </section>
          </div>
        ) : (
          <p className="absolute inset-x-0 bottom-4 text-center text-sm text-cream">
            <span className="rounded-full bg-ink/70 px-3 py-2">
              {hud.nearPlant
                ? "Ganz nah an einer Pflanze. Der Name kommt als Nächstes."
                : coarse
                  ? "Linker Stick läuft, rechter schaut"
                  : hud.split
                    ? "WASD · Pfeile · QE und OP schauen"
                    : "WASD läuft · QE schaut · Umschalt rennt"}
            </span>
          </p>
        )}

        {coarse && !hud.journal && hud.ready ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-16 flex items-end justify-between px-4 pb-2">
            <Stick
              label="Laufen"
              onChange={(x, y) => {
                devices.touchMoveX = x;
                devices.touchMoveY = y;
              }}
            />
            <Stick
              label="Schauen"
              onChange={(x, y) => {
                devices.touchLookX = x;
                devices.touchLookY = y;
              }}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Stick({ label, onChange }: { label: string; onChange: (x: number, y: number) => void }) {
  const base = useRef<HTMLDivElement>(null);
  const pointer = useRef<number | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });

  function reset() {
    pointer.current = null;
    setKnob({ x: 0, y: 0 });
    onChange(0, 0);
  }

  function place(e: React.PointerEvent<HTMLDivElement>) {
    const rect = base.current?.getBoundingClientRect();
    if (!rect) return;
    const max = rect.width * 0.34;
    let dx = e.clientX - (rect.left + rect.width / 2);
    let dy = e.clientY - (rect.top + rect.height / 2);
    const m = Math.hypot(dx, dy);
    if (m > max && m > 0) {
      dx = (dx / m) * max;
      dy = (dy / m) * max;
    }
    setKnob({ x: dx, y: dy });
    onChange(max > 0 ? dx / max : 0, max > 0 ? -dy / max : 0);
  }

  return (
    <div
      data-stick
      ref={base}
      className="pointer-events-auto relative h-28 w-28 touch-none rounded-full border border-cream bg-ink/55"
      onPointerDown={(e) => {
        pointer.current = e.pointerId;
        e.currentTarget.setPointerCapture(e.pointerId);
        e.stopPropagation();
        place(e);
      }}
      onPointerMove={(e) => {
        if (pointer.current !== e.pointerId) return;
        place(e);
      }}
      onPointerUp={(e) => {
        if (pointer.current === e.pointerId) reset();
      }}
      onPointerCancel={(e) => {
        if (pointer.current === e.pointerId) reset();
      }}
      role="slider"
      aria-label={label}
      aria-valuemin={-1}
      aria-valuemax={1}
      aria-valuenow={0}
    >
      <span
        className="absolute top-1/2 left-1/2 h-11 w-11 rounded-full bg-cream"
        style={{ transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))` }}
      />
    </div>
  );
}
