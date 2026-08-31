"use client";

import { useEffect, useRef, useState } from "react";

const BEATS = ["thinking", "talking", "done"] as const;
const TALK_LINE = "shuffling the decks...";
const DONE_LINE = "ready to yap!";

let hasPlayedThisLoad = false;

const FETCH_TIMEOUT_MS = 2500;
const FAILSAFE_MS = 4000;

interface BootIntroProps {
  onComplete?: () => void;
}

export default function BootIntro({ onComplete }: BootIntroProps) {
  const [visible, setVisible] = useState(() => !hasPlayedThisLoad);
  const [leaving, setLeaving] = useState(false);
  const [beatIndex, setBeatIndex] = useState(0);
  const mascotRef = useRef<HTMLDivElement>(null);
  const cache = useRef<Map<string, string>>(new Map());
  const finished = useRef(false);

  function finish() {
    if (finished.current) return;
    finished.current = true;
    hasPlayedThisLoad = true;
    setLeaving(true);
    window.setTimeout(() => {
      setVisible(false);
      onComplete?.();
    }, 420);
  }

  useEffect(() => {
    if (hasPlayedThisLoad) {
      finished.current = true;
      onComplete?.();
      return;
    }

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    async function loadSvg(name: string) {
      if (cache.current.has(name)) return cache.current.get(name)!;
      const controller = new AbortController();
      const timeout = window.setTimeout(
        () => controller.abort(),
        FETCH_TIMEOUT_MS
      );
      try {
        const res = await fetch(`/${name}.svg`, { signal: controller.signal });
        const markup = await res.text();
        cache.current.set(name, markup);
        return markup;
      } finally {
        window.clearTimeout(timeout);
      }
    }

    function showMascot(name: string, talking = false) {
      loadSvg(name)
        .then((markup) => {
          const el = mascotRef.current;
          if (!el) return;
          el.innerHTML = markup;
          el.querySelector("svg")?.classList.add("h-full", "w-full");
          el.classList.toggle("is-talking", talking);
        })
        .catch(() => {
        });
    }

    const failsafe = window.setTimeout(finish, FAILSAFE_MS);

    if (reduceMotion) {
      showMascot("yap-mascot", false);
      setBeatIndex(BEATS.length - 1);
      const t = window.setTimeout(finish, 500);
      return () => {
        window.clearTimeout(t);
        window.clearTimeout(failsafe);
      };
    }

    showMascot("mascot-loading");
    const timers = [
      window.setTimeout(() => setBeatIndex(1), 800),
      window.setTimeout(() => showMascot("yap-mascot", true), 900),
      window.setTimeout(() => setBeatIndex(2), 1900),
      window.setTimeout(() => showMascot("yap-mascot", false), 1900),
      window.setTimeout(finish, 2500),
    ];

    return () => {
      timers.forEach(window.clearTimeout);
      window.clearTimeout(failsafe);
    };
  }, [onComplete]);

  useEffect(() => {
    if (!visible) return;
    const { style } = document.body;
    const prevOverflow = style.overflow;
    const prevTouchAction = style.touchAction;
    style.overflow = "hidden";
    style.touchAction = "none";
    return () => {
      style.overflow = prevOverflow;
      style.touchAction = prevTouchAction;
    };
  }, [visible]);

  if (!visible) return null;

  const beat = BEATS[beatIndex];

  return (
    <div
      onClick={finish}
      style={{ backgroundColor: "#0B3D3A", height: "100dvh" }}
      className={`fixed inset-0 z-50 flex w-full cursor-pointer touch-none select-none flex-col items-center justify-center overflow-hidden px-6 transition-opacity duration-[420ms] ${
        leaving ? "pointer-events-none opacity-0" : "opacity-100"
      }`}
    >
      <style>{`
        @keyframes yap-bounce {
          0%, 60%, 100% { transform: translateY(0); opacity: .5; }
          30% { transform: translateY(-6px); opacity: 1; }
        }
        .yap-dot { animation: yap-bounce 1.1s ease-in-out infinite; }
        .yap-dot:nth-child(2) { animation-delay: .15s; }
        .yap-dot:nth-child(3) { animation-delay: .3s; }
        @keyframes yap-pop {
          0% { transform: scale(.94); }
          55% { transform: scale(1.04); }
          100% { transform: scale(1); }
        }
        .yap-pop { animation: yap-pop 420ms cubic-bezier(.34,1.56,.64,1); }
      `}</style>

      <p
        className="absolute left-6 top-6 text-sm font-bold tracking-tight sm:left-8 sm:top-8 sm:text-base"
        style={{ color: "#FFF8ED" }}
      >
        yap
      </p>

      <div className="flex flex-col items-center">
        <div
          key={beat}
          className="yap-pop relative rounded-[26px] px-6 py-4 sm:px-8 sm:py-5"
          style={{ backgroundColor: "#FFF8ED", minWidth: "220px" }}
        >
          {beat === "thinking" && (
            <div className="flex items-center justify-center gap-1.5 py-1">
              <span
                className="yap-dot h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: "#FF6F91" }}
              />
              <span
                className="yap-dot h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: "#FF6F91" }}
              />
              <span
                className="yap-dot h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: "#FF6F91" }}
              />
            </div>
          )}
          {beat === "talking" && (
            <p
              className="text-center text-sm font-medium sm:text-base"
              style={{ color: "#0B3D3A" }}
            >
              {TALK_LINE}
            </p>
          )}
          {beat === "done" && (
            <p
              className="text-center text-sm font-semibold sm:text-base"
              style={{ color: "#0B3D3A" }}
            >
              {DONE_LINE} <span style={{ color: "#FF6F91" }}>✓</span>
            </p>
          )}

          <span
            className="absolute -bottom-2 left-1/2 h-4 w-4 -translate-x-1/2 rotate-45"
            style={{ backgroundColor: "#FFF8ED" }}
          />
        </div>

        <div
          ref={mascotRef}
          className="mascot-avatar mt-8 h-24 w-24 sm:h-28 sm:w-28"
          aria-hidden="true"
        />

        <div className="mt-6 flex gap-1.5">
          {BEATS.map((b, i) => (
            <span
              key={b}
              className="h-1 w-8 rounded-full transition-colors duration-300"
              style={{
                backgroundColor: i <= beatIndex ? "#C6F135" : "rgba(255,248,237,0.18)",
              }}
            />
          ))}
        </div>
      </div>

      <div className="absolute bottom-6 left-0 right-0 flex items-center justify-between px-6 sm:bottom-8 sm:px-8">
        <p
          className="max-w-[30ch] text-[11px] sm:text-xs"
          style={{ color: "#7FB5AE" }}
        >
          everything here stays on your device — nothing's saved or sent.
        </p>
        <p className="text-[11px] sm:text-xs" style={{ color: "#7FB5AE" }}>
          tap to skip
        </p>
      </div>
    </div>
  );
}