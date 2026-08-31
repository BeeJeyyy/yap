"use client";

import Image from "next/image";
import Link from "next/link";
import Logo from "@/app/yap-mascot.svg";
import { Separator } from "@/components/ui/separator";
import MascotAvatar from "@/components/Mascot/MascotAvatar";
import BootIntro from "@/components/Intro/BootIntro";
import UpdateAlert from "@/components/Intro/UpdateAlert";
import InstallButton from "@/components/InstallButton";
import Logout from '@/components/Auth/Logout';
import {
  Comfort,
  DeepTalk,
  Couples,
  Intimacy,
  ShowAnswer,
  Footer,
} from "@/components/Decks/index";
import { useState } from "react";

type Stage = "intro" | "alert" | "home";

export default function YapHome() {
  const [stage, setStage] = useState<Stage>("intro");

  return (
    <>
    {stage === "intro" && (
      <BootIntro onComplete={() => setStage("alert")} />
    )}

    {stage === "alert" && (
      <UpdateAlert onDismiss={() => setStage("home")} />
    )}

      {stage === "home" && (
      <div className="mx-auto max-w-screen-xl px-4 sm:px-6 md:px-10 lg:px-16 xl:px-24 2xl:px-32">
        <div className="flex items-center justify-between gap-2 py-5 sm:py-6 lg:py-8">
          <div className="flex items-center gap-2">
            <Image
              src={Logo}
              alt="Logo Mascot"
              width={24}
              height={24}
              className="h-5 w-5 sm:h-6 sm:w-6"
            />
            <h1 className="tracking-wide">yap</h1>
          </div>
          <div className="flex items-center gap-4">
          <InstallButton />
          <Logout />
          </div>
        </div>

        <div className="py-5 sm:py-6 lg:py-8">
          <p className="text-[10px] sm:text-xs md:text-sm tracking-wider text-ink-dim font-mono">
            ━ <span className="text-brand">SAY SOMETHING</span> ━ PIC A TOPIC
          </p>
        </div>

        <div className="flex items-center gap-3">
          <MascotAvatar className="h-9 w-9 sm:h-10 sm:w-10 md:h-12 md:w-12 lg:h-14 lg:w-14" />
          <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold">
            Yap
          </h1>
        </div>

        <div className="py-4">
          <span className="text-sm md:text-base text-ink-dim">
            One box, every kind of conversation. Pick a deck ━ answer freely.
          </span>
        </div>

        <div className="py-6 lg:py-8">
          <Separator />
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 md:gap-5 lg:gap-6">
          <Link href="/Comfort" className="min-w-0">
            <Comfort />
          </Link>
          <Link href="/Deeptalk" className="min-w-0">
            <DeepTalk />
          </Link>
          <Link href="/Couples" className="min-w-0">
            <Couples />
          </Link>

          <Link href="/Intimacy" className="min-w-0 h-full">
            <Intimacy />
          </Link>
          <Link href="/ShotOrAnswer" className="min-w-0 h-full">
            <ShowAnswer />
          </Link>
        </div>

        <div>
          <Footer />
        </div>
      </div>
      )}
    </>
  );
}