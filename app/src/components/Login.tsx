import { useState } from "react";
import type { TrackStackAuthResponse } from "trackstack-ui";

export interface LoginProps {
  onLogin: (email: string, password: string) => Promise<TrackStackAuthResponse>;
  onRegister: (email: string, password: string, name?: string) => Promise<TrackStackAuthResponse>;
  onGoogleLogin: (returnTo?: string) => Promise<void>;
}

export function Login({ onLogin, onRegister, onGoogleLogin }: LoginProps) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "login") await onLogin(email, password);
      else await onRegister(email, password, name || undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm bg-card border border-border rounded-lg p-8">
        <h1 className="text-xl mb-1">TrackStack</h1>
        <p className="text-sm text-muted-foreground mb-6">
          {mode === "login" ? "Sign in to your account" : "Create an account"}
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {mode === "register" && (
            <div className="flex flex-col gap-1">
              <label htmlFor="name" className="text-xs text-muted-foreground">Name (optional)</label>
              <input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="bg-secondary border border-border rounded-md px-3 py-2 text-sm"
              />
            </div>
          )}
          <div className="flex flex-col gap-1">
            <label htmlFor="email" className="text-xs text-muted-foreground">Email</label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="bg-secondary border border-border rounded-md px-3 py-2 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="password" className="text-xs text-muted-foreground">Password</label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="bg-secondary border border-border rounded-md px-3 py-2 text-sm"
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <button
            type="submit"
            disabled={busy}
            className="bg-primary text-primary-foreground rounded-md py-2 text-sm font-medium mt-1 disabled:opacity-60"
          >
            {busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
          </button>
        </form>

        <button
          type="button"
          onClick={() => onGoogleLogin()}
          className="w-full mt-3 border border-border rounded-md py-2 text-sm font-medium hover:bg-secondary"
        >
          Continue with Google
        </button>

        <button
          type="button"
          onClick={() => setMode(mode === "login" ? "register" : "login")}
          className="w-full mt-4 text-xs text-muted-foreground hover:text-foreground"
        >
          {mode === "login" ? "Need an account? Register" : "Already have an account? Sign in"}
        </button>
      </div>
    </div>
  );
}
