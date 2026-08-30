import { createClient } from '@/lib/supabase/server'
import YapHome from './YapHome'
import MaintenancePage from './MaintenancePage'
import { redirect } from 'next/navigation'

export default async function Home() {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getClaims()
  const user = data?.claims

  if (error || !user) {
    redirect('/login')
  }

  return <YapHome />
}