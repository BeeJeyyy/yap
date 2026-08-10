'use client'

import { useEffect, useState, useRef } from 'react'
import Image from "next/image";
import Link from "next/link";
import Logo from "@/public/yap-mascot.svg";
import MascotLoading from '@/public/mascot-loading.svg'
import MascotSad from '@/public/mascot-sad.svg'
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { 
    SwipeCard,
    Footer
} from "@/components/Decks/index";

const TOTAL_QUESTIONS = 30;
const SWIPE_THRESHOLD = 60;

export default function ComfortContent() {
  const [questions, setQuestions] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const touchStartX = useRef<number | null>(null);

  useEffect(() => {
    async function loadQuestions() {
      try {
        setIsLoading(true);
        const res = await fetch("/api/generate-questions", {
          method: "POST",
          headers: { "Content-Type" : "application/json" },
          body: JSON.stringify({ topic: "comfort" }),
        });

        if(!res.ok) throw new Error("Failed to fetch questions");

        const data = await res.json();
        setQuestions(data.questions);
      } catch(err) {
        setError("Couldn't load questions. Try again.");
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    }

    loadQuestions();
  }, []);

  const isMaxReached = !isLoading && !error && questions.length > 0 && currentIndex >= questions.length - 1;
  const atStart = currentIndex === 0;

  function handleNext() {
    setCurrentIndex((prev) => Math.min(prev + 1, questions.length - 1));
  }

  function handleBack() {
    setCurrentIndex((prev) => Math.max(prev - 1, 0));
  }

  return (
    <>
      <div className="px-4 sm:px-8 md:px-16 lg:px-52">
        <div className="flex items-center gap-2 py-6 lg:py-8">
          <Image src={Logo} alt="Logo Mascot" className="h-6 w-6" />
          <h1 className="tracking-wide">yap</h1>
        </div>

        <div className="relative flex items-center py-12">
          <Link href="/" className="flex gap-2 text-ink-dim hover:text-ink">
            <ArrowLeft size={14} />
            <span className="uppercase text-xs font-mono tracking-wider">
              decks
            </span>
          </Link>

          <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2">
            <Badge className="bg-deck-comfort p-0 w-2 h-2" />
            <p className="font-bold tracking-wide">Comfort</p>
          </div>
        </div>

        {!isLoading && !error && questions.length > 0 && (
          <p className='text-xs font-mono text-ink-dim mt-1'>
            {Math.min(currentIndex + 1, questions.length)}/{questions.length}
          </p>
        )}

        <div>
          {isLoading && (
            <div className='flex flex-col items-center gap-4 py-12'>
              <Image src={MascotLoading} alt='Loading' className='h-16 w-16' />
              <p className='text-center text-ink-dim'>Loading questions...</p>
            </div>
          )}

          {error && (
            <div className='flex flex-col items-center gap-4 py-12'>
              <Image src={MascotSad} alt="Error" className='h-16 w-16' />
              <p className='text-center text-red-500'>{error}</p>
            </div>
          )}

          {!isLoading && !error && isMaxReached && (
            <div className='flex flex-col items-center gap-4 py-12'>
              <Image src={MascotSad} alt="No more questions" className='h-16 w-16' />
              <p className='text-center text-ink-dim'>
                You've reached today's questions. Try again tomorrow!
              </p>
            </div>
          )}

          {!isLoading && !error && !isMaxReached && questions.length > 0 && (
            <SwipeCard deck="comfort" question={questions[currentIndex]} />
          )}
        </div>

        <div className="flex justify-center items-center gap-4 py-18">
          <Button 
            variant='outline' 
            className='uppercase text-xs p-6 rounded-full bg-surface gap-2 font-bold' 
            onClick={handleBack} 
            disabled={atStart || isLoading || !!error}>
            <ArrowLeft />
            back
          </Button>
          <Button 
            className='uppercase text-xs p-6 rounded-full gap-2 font-bold' 
            onClick={handleNext} 
            disabled={isMaxReached || isLoading || !!error}>
            next
            <ArrowRight />
          </Button>
        </div>

        <div>
            <Footer />
        </div>

      </div>
    </>
  );
}
