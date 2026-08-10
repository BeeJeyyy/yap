import { Separator } from '@/components/ui/separator'

export default function Footer() {
  const year = new Date().getFullYear()

  return (
    <footer className="mb-22 px-4 sm:px-6">
      <div className="py-10 sm:py-18">
        <Separator />
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-ink-faint font-mono text-xs">
          yap · a small tool for better conversations
        </p>

        <p className="text-ink-faint font-mono text-xs">
          {year}
        </p>
      </div>
    </footer>
  )
}