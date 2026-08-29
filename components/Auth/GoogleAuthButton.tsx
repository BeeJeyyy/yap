'use client'

import Image from 'next/image';
import { Button } from '@/components/ui/button';
import GoogleLogo from '@/public/GoogleLogo.png';
import { loginWithGoogle } from '@/lib/auth'


export default function GoogleAuthButton() {

    async function handleGoogleLogin(){
        try {
            await loginWithGoogle()
        } catch(error) {
            console.error('Google login failed:', error)
        }
    }

    return(
        <>
        <div>
            <Button
                type='button'
                onClick={handleGoogleLogin} 
                className='w-full h-12'>
                <Image src={GoogleLogo} alt='Google Logo' className='h-8 w-10' />
                <span className='font-bold'>
                    Continue with Google
                </span>
            </Button>
        </div>
        </>
    )
}