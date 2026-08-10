import { faker } from "@faker-js/faker";
import { 
  Snowflake
 } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";


  export default function IceBreakers() {
    return(
      <>
  <Card className="w-full h-full  lg:w-68 overflow-hidden cursor-pointer transition-all duration-300 hover:-translate-y-1 hover:border-deck-career hover:shadow-[0_0_20px_var(--deck-career)]">
    <CardHeader>
      <CardTitle>
        <div className="flex justify-between items-center">
        <div className="border border-hi rounded-lg p-2 w-8">
          <Snowflake size={18} className="text-deck-career" />
        </div>

        <span className="font-mono text-xs text-ink-faint">
          02
        </span>
        </div>
      </CardTitle>
      <CardDescription>
        <div>
          <h1 className="text-xl font-bold text-deck-career font-mono">
            IceBreaker
          </h1>
        </div>
      </CardDescription>
      <CardDescription>
        <div>
          <p className="font-mono text-ink-dim">
            easy openers
          </p>
        </div>
      </CardDescription>
    </CardHeader>
    <CardContent className="p-0">
    </CardContent>
  </Card>

      </>
    )
  }

