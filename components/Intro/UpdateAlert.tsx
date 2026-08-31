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
            <AlertDialogContent className='flex flex-col items-center gap-4'>
                <div className="w-24 h-24">
                    <Image
                        src={YapImage}
                        alt="yap mascot"
                        width={96}
                        height={96}
                        className="w-full h-full object-contain"
                        priority
                    />
                </div>
                <AlertDialogHeader>
                    <AlertDialogTitle>
                        <h1 className="text-brand text-3xl font-bold ml-18">
                            System Update
                        </h1>    
                    </AlertDialogTitle>
                    <AlertDialogDescription className='text-base leading-relaxed text-center'>
                        We've temporarily adjusted the number of available dekcs while we resolve some technical 
                        issues with question generation. We're working hard to improve yap and make it more user-friendly.
                        Updates coming soon. Thanks for your understanding!
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogAction onClick={handleDismiss} className='w-full h-12 bg-brand hover:bg-brand/90 text-white'>Got it</AlertDialogAction>
            </AlertDialogContent>
        </AlertDialog>
    );
}