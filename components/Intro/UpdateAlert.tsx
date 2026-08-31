"use client";

import { useState } from "react";
import Image from 'next/image';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import YapImage from '@/public/yap-mascot.png';

interface UpdateAlertProps {
    onDismiss: () => void;
}

export default function UpdateAlert({ onDismiss }: UpdateAlertProps) {
    const [open, setOpen] = useState(true);

    const handleDismiss = () => {
        setOpen(false);
        onDismiss();
    };

    return (
        <AlertDialog open={open} onOpenChange={setOpen}>
            <AlertDialogContent className='flex flex-col items-center gap-3 sm:gap-4 w-[90vw] max-w-sm sm:max-w-md md:max-w-lg p-4 sm:p-6'>
                {/* Responsive Image */}
                <div className="w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24">
                    <Image
                        src={YapImage}
                        alt="yap mascot"
                        width={96}
                        height={96}
                        className="w-full h-full object-contain"
                        priority
                    />
                </div>

                {/* Header Section */}
                <AlertDialogHeader className="text-center w-full">
                    <AlertDialogTitle>
                        <h1 className="text-brand text-xl sm:text-2xl md:text-3xl font-bold">
                            System Update
                        </h1>    
                    </AlertDialogTitle>
                    <AlertDialogDescription className='text-sm sm:text-base md:text-base leading-relaxed text-center mt-2'>
                        We've temporarily adjusted the number of available decks while we resolve some technical 
                        issues with question generation. We're working hard to improve yap and make it more user-friendly.
                        Updates coming soon. Thanks for your understanding!
                    </AlertDialogDescription>
                </AlertDialogHeader>

                {/* Responsive Button */}
                <AlertDialogAction 
                    onClick={handleDismiss} 
                    className='w-full h-10 sm:h-11 md:h-12 bg-brand hover:bg-brand/90 text-white text-sm sm:text-base font-medium'
                >
                    Got it
                </AlertDialogAction>
            </AlertDialogContent>
        </AlertDialog>
    );
}