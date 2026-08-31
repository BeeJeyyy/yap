import { faker } from "@faker-js/faker";
import { Wine } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function ShotAnswer() {
    return(
        <>
        <Card className="w-full h-full  lg:w-68 overflow-hidden cursor-pointer transition-all duration-300 hover:-translate-y-1 hover:border-deck-career hover:shadow-[0_0_20px_var(--deck-friends)]">
        <CardHeader>
          <CardTitle>
            <div className="flex justify-between items-center">
              <div className="border border-hi rounded-lg p-2 w-9">
                <Wine size={18} className="text-deck-friends" />
              </div>

              <span className="font-mono text-xs text-ink-faint">05</span>
            </div>
          </CardTitle>
          <CardDescription>
            <div>
              <h1 className="text-xl font-bold text-deck-friends font-mono">
                Shot or Answer
              </h1>
            </div>
          </CardDescription>
          <CardDescription>
            <div>
              <p className="font-mono text-ink-dim">dodge if you dare</p>
            </div>
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0"></CardContent>
      </Card>
        </>
    )
}