import { createBrowserClient } from '@supabase/ssr'

const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
)

// Google Authentication
export async function loginWithGoogle() {
    const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
            redirectTo: `${window.location.origin}/auth/callback`,
        },
    })

    if (error) {
        throw new Error(error.message)
    }
}

// Email + Password
export async function signInWithEmail(email:string, password:string) {
    const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
    })

    return { data, error };
}

// Creating new user
export async function signUpNewUser(name:string, email:string, password:string) {
    const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`,
            data: { full_name: name },
        },
    });

    return { data, error };
} 

// Logout
export async function handleConfirmLogout() {
    const { error } = await supabase.auth.signOut() 

    if (error) {
        throw new Error(error.message)
    }
}