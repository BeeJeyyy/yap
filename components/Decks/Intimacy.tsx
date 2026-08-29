import { faker } from "@faker-js/faker";
import { Flame } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function Intimacy() {
    return(
        <>
        <Card className="w-full h-full  lg:w-68 overflow-hidden cursor-pointer transition-all duration-300 hover:-translate-y-1 hover:border-deck-career hover:shadow-[0_0_20px_var(--deck-intimacy)]">
        <CardHeader>
          <CardTitle>
            <div className="flex justify-between items-center">
              <div className="border border-hi rounded-lg p-2 w-9">
                <Flame size={18} className="text-deck-intimacy" />
              </div>

              <span className="font-mono text-xs text-ink-faint">11</span>
            </div>
          </CardTitle>
          <CardDescription>
            <div>
              <h1 className="text-xl font-bold text-deck-intimacy font-mono">
                Intimacy
              </h1>
            </div>
          </CardDescription>
          <CardDescription>
            <div>
              <p className="font-mono text-ink-dim">closer than close</p>
            </div>
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0"></CardContent>
      </Card>
        </>
    )
}