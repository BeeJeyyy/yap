import Image from "next/image";
import Logo from "@/app/yap-mascot.svg";

export default function MaintenancePage() {
  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-md text-center">

        {/* Logo */}
        <div className="flex justify-center mb-8">
          <Image
            src={Logo}
            alt="Yap"
            width={64}
            height={64}
            className="h-16 w-16"
          />
        </div>

        {/* Status */}
        <p className="mb-3 text-xs font-mono tracking-[0.2em] text-ink-dim">
          ━ <span className="text-brand">TEMPORARILY OFFLINE</span> ━
        </p>

        {/* Heading */}
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">
          Yap is getting fixed.
        </h1>

        {/* Description */}
        <p className="mt-5 text-sm sm:text-base leading-7 text-ink-dim">
          We’re making a few improvements behind the scenes.
          Yap is temporarily unavailable while we fix some things.
        </p>

        {/* Status Card */}
        <div className="mt-8 rounded-2xl border border-border bg-card p-5 text-left">
          <div className="flex items-center gap-3">
            <div className="h-2.5 w-2.5 rounded-full bg-brand animate-pulse" />

            <div>
              <p className="text-sm font-medium">
                Maintenance in progress
              </p>

              <p className="mt-1 text-xs text-ink-dim">
                We’ll be back soon.
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <p className="mt-8 text-xs text-ink-dim">
          Thanks for your patience ♡
        </p>

      </div>
    </main>
  );
}