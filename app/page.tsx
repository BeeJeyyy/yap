import { createClient } from '@/lib/supabase/server'
import YapHome from './YapHome'
import MaintenancePage from './MaintenancePage'
import { redirect } from 'next/navigation'

export default async function Home() {
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()

  if (!user?.id) {
    redirect('/login')
  }

  return <YapHome />
}