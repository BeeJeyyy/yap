import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Mail } from "lucide-react";

export default function VerifyEmail() {
  return (
    <>
      <div className="min-h-screen flex items-center justify-center bg-black px-4">
        <Card className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-2xl">
          <CardHeader className="flex flex-col items-center text-center pt-10 pb-2">
            <div className="w-14 h-14 rounded-full bg-indigo-500/10 flex items-center justify-center mb-5">
              <Mail className="w-6 h-6 text-indigo-400" strokeWidth={1.75} />
            </div>
            <h1 className="text-2xl font-bold text-white">Email sent</h1>
            <p className="mt-1 text-sm text-neutral-400">
              We&apos;ve sent a verification link to your inbox.
            </p>
          </CardHeader>

          <CardContent className="pb-10">
            <p className="text-center text-sm text-neutral-400 leading-relaxed">
              Please check your inbox and click the link to verify your account.
            </p>

            <button
              type="button"
              className="mt-6 w-full rounded-lg bg-indigo-500 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/50"
            >
              Resend email
            </button>

            <p className="mt-4 text-center text-xs text-neutral-500">
              Didn&apos;t get it? Check your spam folder.
            </p>

            <a
              href="/login"
              className="mt-6 block text-center text-sm text-neutral-400 transition hover:text-white"
            >
              Back to login
            </a>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
