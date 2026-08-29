"use client";

import { useRouter } from "next/navigation";
import { LogOut, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { handleConfirmLogout } from "@/lib/auth";

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function Logout() {
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const ConfirmLogout = async () => {
    setLoading(true);
    const miniDelay = new Promise((resolve) => setTimeout(resolve, 1500));
    try {
      await Promise.all([handleConfirmLogout(), miniDelay]);
      router.push("/login");
    } catch (error) {
      console.error("Logout failed:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div>
        <Button 
            onClick={() => setShowModal(true)}
            className='bg-brand hover:bg-brand/90'>
          <span className="flex items-center gap-2 text-sm text-accent-foreground">
            <LogOut size={18} />
            Sign out
          </span>
        </Button>

        {showModal && (
          <div
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
            onClick={() => setShowModal(false)}
          >
            <Card
              className="flex flex-col justify-center text-center w-full max-w-md overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <CardHeader className="">
                <CardTitle className="flex flex-col items-center gap-4">
                  <TriangleAlert size={54} className="text-deck-intimacy" />
                  <p className="text-deck-intimacy font-bold text-2xl">
                    Confirm Logout
                  </p>
                </CardTitle>
                <CardDescription>
                  <p className="text-lg">Are you sure you want to logout?</p>
                </CardDescription>
              </CardHeader>
              <CardContent className="flex justify-center items-center gap-2 p-0">
                <Button
                  onClick={ConfirmLogout}
                  disabled={loading}
                  className="h-12 w-42 bg-deck-intimacy text-accent-foreground hover:bg-deck-intimacy/90"
                >
                  {loading ? "Logging out..." : "Logout"}
                </Button>
                <Button
                  onClick={() => setShowModal(false)}
                  disabled={loading}
                  variant="outline"
                  className="h-12 w-42"
                >
                  Cancel
                </Button>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </>
  );
}
