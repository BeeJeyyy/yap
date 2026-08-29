"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import GoogleAuthButton from "./GoogleAuthButton";
import { signInWithEmail } from "@/lib/auth";

export default function Login() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({
    email: "",
    password: "",
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const Errors = {
      email: "",
      password: "",
    };

    if (!email.trim()) {
      Errors.email = "Email is required.";
    } else if (!email.includes("@")) {
      Errors.email = "Please enter a valid email.";
    }

    if (!password) {
      Errors.password = "Password is required.";
    } else if (password.length < 6) {
      Errors.password = "Password must be at least 6 characters.";
    }

    setErrors(Errors);

    if (Errors.email || Errors.password) {
      return;
    }

    setLoading(true);
    const { data, error } = await signInWithEmail(email, password);
    setLoading(false);

    if(error) {
      setErrors({
        email: error.message,
        password: "",
      });
    }

    router.push("/");
  }

  return (
    <>
      <div>
        <div className="mb-4 p-2 py-4">
          <h1 className="text-4xl font-bold">Welcome back</h1>
          <p className="text-muted-foreground text-sm">
            Login to your saved account.
          </p>
        </div>

      <form onSubmit={handleSubmit}>
        <div className="flex flex-col gap-2 p-2">
          <Label>Email</Label>
          <Input 
            type="email" 
            placeholder="you@example.com" 
            className="p-4"
            value={email}
              onChange={(e) => setEmail(e.target.value)} />
        </div>

        {errors.email && (
            <p className="text-sm text-destructive">{errors.email}</p>
          )}

        <div className="flex flex-col gap-2 p-2">
          <Label>Password</Label>
          <Input 
            type="password" 
            placeholder="••••••••" 
            className="p-4"
            value={password}
              onChange={(e) => setPassword(e.target.value)} />
          <div className="flex justify-between">
            <span className="text-xs text-muted-foreground">
              Atlease 6 characters
            </span>
            <Link
              href="/"
              className="text-xs text-muted-foreground hover:underline"
            >
              Forgot password?
            </Link>
          </div>
        </div>

        {errors.password && (
            <p className="text-sm text-destructive">{errors.password}</p>
          )}

        <div className="p-2">
            <Button
              type="submit"
              disabled={loading}
              className="w-full h-12 bg-ring hover:bg-ring/80 text-foreground"
            >
              {loading ? "Logging in..." : "Log in"}
            </Button>
          </div>
        </form>

        <div className="flex items-center gap-3 p-2 py-4">
          <span className="w-full flex-1 border border-muted-foreground/10"></span>
          <span className="text-muted-foreground uppercase font-mono text-xs">
            or continue with
          </span>
          <span className="w-full flex-1 border border-muted-foreground/10"></span>
        </div>

        <div>
          <GoogleAuthButton />
        </div>
      </div>
    </>
  );
}
