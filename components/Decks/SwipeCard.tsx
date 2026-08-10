"use client";

import { motion, useMotionValue, useTransform, PanInfo } from "motion/react";

type Deck =
  | "comfort"
  | "icebreakers"
  | "deeptalk"
  | "couples"
  | "family"
  | "friends"
  | "self"
  | "funny"
  | "career"
  | "nostalgia";

const deckColors: Record<Deck, string> = {
  comfort: "bg-deck-comfort",
  icebreakers: "bg-deck-icebreakers",
  deeptalk: "bg-deck-deep",
  couples: "bg-deck-couples",
  family: "bg-deck-family",
  friends: "bg-deck-friends",
  self: "bg-deck-self",
  funny: "bg-deck-funny",
  career: "bg-deck-career",
  nostalgia: "bg-deck-nostalgia",
};

interface SwipeCardProps {
  deck: Deck;
  question: string;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
}

const SWIPE_CONFIRM_THRESHOLD = 100;

export default function SwipeCard({ deck, question, onSwipeLeft, onSwipeRight }: SwipeCardProps) {
  console.log('SwipeCard rendering with questions:', question);
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], [-8, 8]);
  const opacity = useTransform(
    x,
    [-300, -150, 0, 150, 300],
    [0, 1, 1, 1, 0]
  );

  function handleDragEnd(_: any, info: PanInfo) {
    if(info.offset.x < -SWIPE_CONFIRM_THRESHOLD) {
      onSwipeLeft?.();
    } else if(info.offset.x > SWIPE_CONFIRM_THRESHOLD) {
      onSwipeRight?.();
    }
    x.set(0);
  }

  return (
    <div className="flex w-full justify-center">
      <motion.div
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.8}
        onDragEnd={handleDragEnd}
        style={{
          x,
          rotate,
          opacity,
          touchAction: "pan-y",
        }}
        className="
          relative
          flex
          h-64
          w-full
          max-w-xl
          cursor-grab
          items-center
          justify-center
          rounded-2xl
          border
          border-white/20
          bg-[#1c1c1f]
          shadow-lg
          active:cursor-grabbing
        "
      >
        {/* Top accent */}
        <div
          className={`
            absolute
            left-1/2
            top-0
            h-0.5
            w-2/3
            -translate-x-1/2
            ${deckColors[deck]}
          `}
        />

        {/* Question text */}
        <p className="px-8 text-center text-lg font-medium text-white">
          {question}
        </p>

      </motion.div>
    </div>
  );
}