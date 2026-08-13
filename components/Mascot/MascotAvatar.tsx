"use client";

import { useEffect, useRef } from "react";

export default function MascotAvatar({
  className = "h-10 w-10 lg:h-14 lg:w-14",
}: {
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const cache = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    let cancelled = false;

    async function load(name: string) {
      if (cache.current.has(name)) return cache.current.get(name)!;
      const res = await fetch(`/${name}.svg`);
      if (!res.ok) throw new Error(`missing ${name}.svg`);
      const markup = await res.text();
      cache.current.set(name, markup);
      return markup;
    }

    async function show(name: string, talking = false) {
      const markup = await load(name);
      if (cancelled || !ref.current) return;
      ref.current.innerHTML = markup;
      ref.current.querySelector("svg")?.classList.add("h-full", "w-full");
      ref.current.classList.toggle("is-talking", talking);
    }

    (async () => {
      try {
        await show("mascot-loading");
        await new Promise((r) => setTimeout(r, 900));
        await show("yap-mascot", true);
        await new Promise((r) => setTimeout(r, 650));
        if (!cancelled) await show("yap-mascot", false);
      } catch {
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div
      ref={ref}
      className={`mascot-avatar ${className}`}
      aria-label="Yap mascot"
      role="img"
    />
  );
}