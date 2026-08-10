import { 
  Heart 
} from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function Couples() {
  return (
    <>
      <Card className="w-full h-full lg:w-68 overflow-hidden cursor-pointer transition-all duration-300 hover:-translate-y-1 hover:border-deck-couples hover:shadow-[0_0_20px_var(--deck-couples)]">
        <CardHeader className="px-4">
          <CardTitle>
            <div className="flex justify-between items-center">
              <div className="border border-border-hi rounded-lg p-2 w-8">
                <Heart size={18} className="text-deck-couples" />
              </div>

              <span className="font-mono text-xs text-ink-faint">
                04
              </span>
            </div>
          </CardTitle>
          <CardDescription>
            <div>
              <h1 className="text-xl font-bold text-deck-couples font-mono">
                Couples
              </h1>
            </div>
          </CardDescription>

          <CardDescription>
            <div className="">
              <p className="font-mono text-ink-dim">
                for the two of you
              </p>
            </div>
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
        </CardContent>
      </Card>
    </>
  );
}
