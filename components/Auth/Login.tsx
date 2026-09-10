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
    try {
      const { data, error } = await signInWithEmail(email, password);

      if (error) {
        setErrors({
          email: error.message,
          password: "",
        });
        return;
      }

      router.push("/");
    } catch (err) {
      console.error("Login failed:", err);
      setErrors({
        email: "Something went wrong. Please try again.",
        password: "",
      });
    } finally {
      setLoading(false);
    }
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
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
            />
          </div>

          {errors.email && (
            <p className="text-sm text-destructive">{errors.email}</p>
          )}

          <div className="flex flex-col gap-2 p-2">
            <div className="flex items-center justify-between">
              <Label>Password</Label>
              <Link
                href="/"
                className="text-xs text-muted-foreground hover:text-foreground hover:underline transition-colors"
                aria-label="Forgot password"
              >
                Forgot?
              </Link>
            </div>
            <Input
              type="password"
              placeholder="••••••••"
              className="p-4"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
            />
            <span className="text-xs text-muted-foreground">
              At least 6 characters
            </span>
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

        <p className="text-center text-xs text-muted-foreground mt-6">
          Don&apos;t have an account?{" "}
          <Link
            href="/signup"
            className="text-ring hover:text-ring/80 font-semibold hover:underline transition-colors"
          >
            Sign up
          </Link>
        </p>
      </div>
    </>
  );
}