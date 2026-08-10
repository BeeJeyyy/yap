import Image from "next/image";
import Link from "next/link";
import Logo from "@/public/yap-mascot.svg";
import { Separator } from "@/components/ui/separator";
import {
  Comfort,
  IceBreakers,
  DeepTalk,
  Couples,
  Family,
  Friends,
  SelfReflection,
  FunnyRandom,
  CareerAmbition,
  Nostalgia,
  Footer,
} from "@/components/Decks/index";

export default function Home() {
  return (
    <>
      <div className="px-4 sm:px-8 md:px-16 lg:px-52">
        <div className="flex items-center gap-2 py-6 lg:py-8">
          <Image src={Logo} alt="Logo Mascot" className="h-6 w-6" />
          <h1 className="tracking-wide">yap</h1>
        </div>

        <div className="py-6 lg:py-8">
          <p className="text-[10px] sm:text-xs tracking-wider text-ink-dim font-mono">
            ━ <span className="text-brand">SAY SOMETHING</span> ━ PIC A TOPIC
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Image src={Logo} alt="Logo" className="h-10 w-10 lg:h-14 lg:w-14" />
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold">Yap</h1>
        </div>

        <div className="py-4">
          <span className="text-sm lg:text-base text-ink-dim">
            One box, every kind of conversation. Pick a deck ━ answer freely.
          </span>
        </div>

        <div className="py-6 lg:py-8">
          <Separator />
        </div>

        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:block lg:space-y-4">
          <div className="contents lg:flex lg:gap-4">
            <Link href="/Comfort" className="min-w-0">
              {" "}
              <Comfort />{" "}
            </Link>
            <Link href="/Icebreakers" className="min-w-0">
              {" "}
              <IceBreakers />{" "}
            </Link>
            <Link href="/Deeptalk" className="min-w-0">
              {" "}
              <DeepTalk />{" "}
            </Link>
          </div>

          <div className="contents lg:flex lg:gap-4">
            <Link href="/Couples" className="min-w-0">
              {" "}
              <Couples />{" "}
            </Link>
            <Link href="/Family" className="min-w-0">
              {" "}
              <Family />{" "}
            </Link>
            <Link href="/Friends" className="min-w-0">
              {" "}
              <Friends />{" "}
            </Link>
          </div>

          <div className="contents lg:flex lg:gap-4">
            <Link href="/SelfReflection" className="min-w-0">
              {" "}
              <SelfReflection />{" "}
            </Link>
            <Link href="/Funny&Random" className="min-w-0">
              {" "}
              <FunnyRandom />{" "}
            </Link>
            <Link href="/Career&Ambition" className="min-w-0 h-full">
              {" "}
              <CareerAmbition />{" "}
            </Link>
          </div>

          <div className="contents lg:flex lg:gap-4">
            <Link href="/Nostalgia" className="min-w-0 h-full">
              {" "}
              <Nostalgia />{" "}
            </Link>
          </div>
        </div>

        <div>
          <Footer />
        </div>

      </div>
    </>
  );
}
