import { useState } from "react";
import "./AuthScreen.css";

interface Props {
  onAuth: (token: string, email: string, profile: object | null) => void;
  onGuest: () => void;
}

export default function AuthScreen({ onAuth, onGuest }: Props) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Something went wrong"); return; }
      onAuth(data.token, data.user.email, data.profile ?? null);
    } catch {
      setError("Could not connect to server");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <span className="auth-logo-icon">🌿</span>
          <span className="auth-logo-text">Flourish</span>
        </div>
        <p className="auth-tagline">Your AI garden advisor</p>

        <div className="auth-tabs">
          <button
            className={`auth-tab ${mode === "login" ? "active" : ""}`}
            onClick={() => { setMode("login"); setError(null); }}
          >
            Sign in
          </button>
          <button
            className={`auth-tab ${mode === "register" ? "active" : ""}`}
            onClick={() => { setMode("register"); setError(null); }}
          >
            Create account
          </button>
        </div>

        <form className="auth-form" onSubmit={submit}>
          <label className="auth-label">
            Email
            <input
              className="auth-input"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />
          </label>

          <label className="auth-label">
            Password
            <input
              className="auth-input"
              type="password"
              placeholder={mode === "register" ? "At least 6 characters" : "Your password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>

          {error && <p className="auth-error">{error}</p>}

          <button className="auth-submit" type="submit" disabled={loading}>
            {loading
              ? <><span className="spinner" /> {mode === "login" ? "Signing in…" : "Creating account…"}</>
              : mode === "login" ? "Sign in" : "Create account"
            }
          </button>
        </form>

        <div className="auth-divider"><span>or</span></div>

        <button className="auth-guest" onClick={onGuest}>
          Continue as guest
          <span className="auth-guest-note">Your data stays on this device only</span>
        </button>
      </div>
    </div>
  );
}
