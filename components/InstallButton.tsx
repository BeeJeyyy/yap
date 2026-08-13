"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { Button } from '@/components/ui/button'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const STORAGE_KEY = "yap-app-installed";

function isIOSSafari(): boolean {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) ||
    (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
  return isIOS;
}

export default function InstallButton() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    setIsIOS(isIOSSafari());

    if (isIOSSafari()) return;

    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "true") setIsInstalled(true);

    if (window.matchMedia("(display-mode: standalone)").matches) {
      setIsInstalled(true);
      localStorage.setItem(STORAGE_KEY, "true");
    }

    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setIsInstalled(false);
      localStorage.removeItem(STORAGE_KEY);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      localStorage.setItem(STORAGE_KEY, "true");
      setDeferredPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstall);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (isIOS) {
      setShowModal(true);
      return;
    }

    if (isInstalled) {
      setShowModal(true);
      return;
    }

    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") {
        setIsInstalled(true);
        localStorage.setItem(STORAGE_KEY, "true");
      }
      setDeferredPrompt(null);
      return;
    }

    setShowModal(true);
  };

  return (
    <>
      <button
        onClick={handleInstallClick}
        className="flex items-center gap-1.5 text-xs sm:text-sm font-mono tracking-wide text-ink-dim hover:text-brand transition-colors border border-ink-dim/30 hover:border-brand rounded-full px-3 py-1.5 cursor-pointer"
      >
        <Download className="h-3.5 w-3.5" />
        <span>Install</span>
      </button>

      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
          onClick={() => setShowModal(false)}
        >
          <div
            className="w-full max-w-sm rounded-xl border border-ink-dim/20 bg-background p-6 text-center shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {isIOS ? (
              <>
                <p className="text-sm font-medium mb-1">Add to Home Screen</p>
                <p className="text-xs text-ink-dim mb-4">
                  Tap the Share icon (□↑) on Safari toolbar, scroll below,
                  and choose "Add to Home Screen".
                </p>
              </>
            ) : isInstalled ? (
              <>
                <p className="text-sm font-medium mb-1">
                  You've already installed the app
                </p>
                <p className="text-xs text-ink-dim mb-4">
                  Check your home screen o app list. If you want to install
                  it again, uninstall your existing app.
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-medium mb-1">Add to Home Screen</p>
                <p className="text-xs text-ink-dim mb-4">
                  Chrome/Edge Menu (⋮) → "Install app" o "Add to Home screen"
                </p>
              </>
            )}
            <Button
              onClick={() => setShowModal(false)}
              className="text-xs font-mono text-ring bg-card w-full hover:bg-muted"
            >
              OK
            </Button>
          </div>
        </div>
      )}
    </>
  );
}