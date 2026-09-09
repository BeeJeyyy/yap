import { createClient } from '@/lib/supabase/server'
import YapHome from './YapHome'
import MaintenancePage from './MaintenancePage'
import { redirect } from 'next/navigation'

export default async function Home() {
  const supabase = await createClient()
  
  const { data: authData, error: authError } =
    await supabase.auth.getClaims()

  const userId = authData?.claims?.sub

  if (authError || !userId) {
    redirect('/login')
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', userId)
    .maybeSingle()

  if (profileError || !profile) {
    redirect('login')
  }

  return <YapHome />
}