import { useCallback, useEffect, useRef, useState } from "react";
import AuthScreen from "./components/AuthScreen";
import CameraCapture from "./components/CameraCapture";
import DiagnosisResult from "./components/DiagnosisResult";
import GardenAnalysis from "./components/GardenAnalysis";
import GardenPlanPanel from "./components/GardenPlanPanel";
import HistoryPanel from "./components/HistoryPanel";
import Onboarding from "./components/Onboarding";
import PlantSuggestions from "./components/PlantSuggestions";
import type {
  AuthState,
  DiagnosisData,
  GardenAnalysis as GardenAnalysisType,
  SuggestionsResponse,
  UserProfile,
} from "./types";
import "./App.css";

type Screen =
  | "home"
  | "garden-scan"
  | "garden-result"
  | "health-result"
  | "health-check"
  | "suggestions";

const PROFILE_KEY = "flourish-profile";
const TEXT_SIZE_KEY = "flourish-text-size";
const AUTH_KEY = "flourish-auth";

async function readErrorMessage(res: Response, fallback: string): Promise<string> {
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    try { const d = await res.json(); return d.error || fallback; }
    catch { return fallback; }
  }
  return fallback;
}

function loadLocalProfile(): UserProfile | null {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    return raw ? (JSON.parse(raw) as UserProfile) : null;
  } catch { return null; }
}

function saveLocalProfile(profile: UserProfile) {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

function loadAuthState(): AuthState | null {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    return raw ? (JSON.parse(raw) as AuthState) : null;
  } catch { return null; }
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export default function App() {
  // Auth state — null means "checking", false means "not logged in"
  const [auth, setAuth] = useState<AuthState | null | false>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [screen, setScreen] = useState<Screen>("home");
  const [showHistory, setShowHistory] = useState(false);
  const [showPlan, setShowPlan] = useState(false);

  // Capture state
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Result state
  const [diagnosis, setDiagnosis] = useState<DiagnosisData | null>(null);
  const [gardenAnalysis, setGardenAnalysis] = useState<GardenAnalysisType | null>(null);
  const [suggestions, setSuggestions] = useState<SuggestionsResponse | null>(null);

  // Loading / error
  const [loading, setLoading] = useState(false);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Accessibility: text size
  const [textLarge, setTextLarge] = useState(() => localStorage.getItem(TEXT_SIZE_KEY) === "large");

  useEffect(() => {
    document.documentElement.style.fontSize = textLarge ? "20px" : "";
  }, [textLarge]);

  // ── Bootstrap: verify saved token on load ──
  useEffect(() => {
    const saved = loadAuthState();
    if (!saved) { setAuth(false); setProfile(loadLocalProfile()); return; }

    fetch("/api/auth/me", { headers: { Authorization: `Bearer ${saved.token}` } })
      .then(async (res) => {
        if (!res.ok) throw new Error("expired");
        const d = await res.json();
        setAuth(saved);
        setProfile(d.profile as UserProfile | null ?? loadLocalProfile());
      })
      .catch(() => {
        localStorage.removeItem(AUTH_KEY);
        setAuth(false);
        setProfile(loadLocalProfile());
      });
  }, []);

  const authHeaders = () => {
    const a = auth as AuthState | null;
    return a ? { Authorization: `Bearer ${a.token}` } : {};
  };

  // ── Save profile to server (if logged in) and localStorage ──
  const persistProfile = useCallback((p: UserProfile) => {
    saveLocalProfile(p);
    const a = auth as AuthState | null;
    if (a) {
      fetch("/api/user/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${a.token}` },
        body: JSON.stringify(p),
      }).catch(() => {});
    }
  }, [auth]);

  // ── Save result to history (if logged in) ──
  const saveHistory = useCallback((type: string, title: string, result: object) => {
    const a = auth as AuthState | null;
    if (!a) return;
    fetch("/api/user/history", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${a.token}` },
      body: JSON.stringify({ type, title, result }),
    }).catch(() => {});
  }, [auth]);

  const toggleTextSize = () => {
    const next = !textLarge;
    setTextLarge(next);
    localStorage.setItem(TEXT_SIZE_KEY, next ? "large" : "normal");
  };

  // ── Auth handlers ──
  const handleAuth = (token: string, email: string, serverProfile: object | null) => {
    const state: AuthState = { token, user: { id: 0, email } };
    // get the real id from /me — but we can use the token directly
    fetch("/api/auth/me", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => {
        const fullState: AuthState = { token, user: d.user };
        localStorage.setItem(AUTH_KEY, JSON.stringify(fullState));
        setAuth(fullState);
        const p = (serverProfile ?? loadLocalProfile()) as UserProfile | null;
        if (p) { persistProfile(p); }
        setProfile(p);
      })
      .catch(() => {
        localStorage.setItem(AUTH_KEY, JSON.stringify(state));
        setAuth(state);
        setProfile((serverProfile ?? loadLocalProfile()) as UserProfile | null);
      });
  };

  const handleGuest = () => {
    setAuth(false);
    setProfile(loadLocalProfile());
  };

  const handleLogout = () => {
    if (!window.confirm("Sign out of Flourish?")) return;
    localStorage.removeItem(AUTH_KEY);
    setAuth(false);
  };

  // ── Onboarding ──
  const handleOnboardingComplete = (newProfile: UserProfile) => {
    persistProfile(newProfile);
    setProfile(newProfile);
    setScreen("home");
  };

  // ── File handling ──
  const handleFile = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("Please upload an image file (JPEG, PNG, WebP, etc.)");
      return;
    }
    setImageFile(file);
    setDiagnosis(null);
    setGardenAnalysis(null);
    setError(null);
    const reader = new FileReader();
    reader.onload = (e) => setImagePreview(e.target?.result as string);
    reader.readAsDataURL(file);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const resetCapture = () => {
    setImageFile(null);
    setImagePreview(null);
    setDiagnosis(null);
    setGardenAnalysis(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ── API calls ──
  const handleGardenAnalyze = async () => {
    if (!imageFile || !profile) return;
    setLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append("image", imageFile);
    formData.append("location", profile.location);
    formData.append("gardenType", profile.gardenType);
    formData.append("experience", profile.experience);
    formData.append("plantPreferences", JSON.stringify(profile.plantPreferences));
    formData.append("currentDate", new Date().toISOString());

    try {
      const res = await fetch("/api/analyze-garden", { method: "POST", body: formData });
      if (!res.ok) throw new Error(await readErrorMessage(res, "Garden analysis failed"));
      const data: GardenAnalysisType = await res.json();
      setGardenAnalysis(data);
      setScreen("garden-result");
      saveHistory("garden", `Garden — ${profile.location}`, data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const handleHealthDiagnose = async () => {
    if (!imageFile) return;
    setLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append("image", imageFile);

    try {
      const res = await fetch("/api/diagnose", { method: "POST", body: formData });
      if (!res.ok) throw new Error(await readErrorMessage(res, "Diagnosis failed"));
      const data: DiagnosisData = await res.json();
      setDiagnosis(data);
      setScreen("health-result");
      saveHistory("health", `Health Check — ${data.plantName}`, data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const handleGetSuggestions = async () => {
    if (!profile) return;
    setSuggestionsLoading(true);
    setSuggestions(null);
    setScreen("suggestions");

    try {
      const res = await fetch("/api/plant-suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          location: profile.location,
          gardenType: profile.gardenType,
          experience: profile.experience,
          plantPreferences: profile.plantPreferences,
          currentDate: new Date().toISOString(),
        }),
      });
      if (!res.ok) throw new Error(await readErrorMessage(res, "Failed to get suggestions"));
      const data: SuggestionsResponse = await res.json();
      setSuggestions(data);
      saveHistory("suggestions", `Plant Ideas — ${profile.location}`, data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setScreen("home");
    } finally {
      setSuggestionsLoading(false);
    }
  };

  const handleAddPreference = (pref: string) => {
    if (!profile) return;
    if (profile.plantPreferences.includes(pref)) return;
    const updated: UserProfile = { ...profile, plantPreferences: [...profile.plantPreferences, pref] };
    persistProfile(updated);
    setProfile(updated);
  };

  const handleSettings = () => {
    if (window.confirm("Reset your profile and start over?")) {
      localStorage.removeItem(PROFILE_KEY);
      window.location.reload();
    }
  };

  // ── Loading splash while verifying token ──
  if (auth === null) {
    return (
      <div style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)" }}>
        <span className="spinner" style={{ width: 32, height: 32 }} />
      </div>
    );
  }

  // ── Auth screen ──
  if (auth === false && !profile) {
    return <AuthScreen onAuth={handleAuth} onGuest={handleGuest} />;
  }

  // ── If no profile, show onboarding ──
  if (!profile) {
    return <Onboarding onComplete={handleOnboardingComplete} />;
  }

  const isCapture = screen === "garden-scan" || screen === "health-check";
  const captureMode = screen === "garden-scan" ? "garden" : "health";
  const isLoggedIn = auth !== false;

  return (
    <div className="app">
      <header className="header">
        <div className="header-inner">
          <div className="logo">
            <span className="logo-icon">🌿</span>
            <span className="logo-text">Flourish</span>
          </div>
          <p className="tagline">Your AI garden advisor</p>
          <div className="header-right">
            <span className="header-location">📍 {profile.location}</span>
            {isLoggedIn && (
              <button
                className="btn-history"
                onClick={() => setShowHistory(true)}
                aria-label="View saved searches"
                title="Saved searches"
              >
                🕑
              </button>
            )}
            <button
              className={`btn-text-toggle ${textLarge ? "active" : ""}`}
              onClick={toggleTextSize}
              aria-label={textLarge ? "Switch to normal text size" : "Switch to larger text size"}
              title={textLarge ? "Normal text" : "Larger text"}
            >
              Aa
            </button>
            <button
              className="btn-settings"
              onClick={isLoggedIn ? handleLogout : handleSettings}
              aria-label={isLoggedIn ? "Sign out" : "Settings — reset your garden profile"}
              title={isLoggedIn ? `Signed in as ${(auth as AuthState).user.email}` : "Settings"}
            >
              {isLoggedIn ? "👤" : "⚙️"}
            </button>
          </div>
        </div>
      </header>

      <main className="main">
        <div className="container">

          {/* ── Home Screen ── */}
          {screen === "home" && (
            <div className="home">
              <div className="home-greeting">
                <h1 className="home-title">
                  {getGreeting()}, <em>gardener</em> 🌿
                </h1>
                <p className="hero-sub">What would you like to do today?</p>
              </div>

              {error && (
                <div className="error-banner">
                  <span className="error-icon" aria-hidden="true">⚠️</span>
                  <span>{error}</span>
                  <button className="error-close" onClick={() => setError(null)} aria-label="Dismiss error">✕</button>
                </div>
              )}

              {profile.experience === "beginner" && (
                <div className="beginner-tip" role="note">
                  <span className="beginner-tip-icon" aria-hidden="true">🌱</span>
                  <div>
                    <strong>New to gardening?</strong> Start with <em>Get Plant Ideas</em> to discover what grows well near you, or take a photo of your garden to get a full report — no expertise needed!
                  </div>
                </div>
              )}

              <div className="mode-cards" role="list">
                <button
                  className="mode-card mode-card-garden"
                  onClick={() => { resetCapture(); setScreen("garden-scan"); }}
                  aria-label="Analyze my garden — take or upload a garden photo for full AI analysis"
                  role="listitem"
                >
                  <span className="mode-icon" aria-hidden="true">🌿</span>
                  <div className="mode-card-body">
                    <h3>Analyze My Garden</h3>
                    <p>Take a photo — get plant names, layout tips, and a care plan</p>
                  </div>
                </button>

                <button
                  className="mode-card mode-card-health"
                  onClick={() => { resetCapture(); setScreen("health-check"); }}
                  aria-label="Check plant health — diagnose diseases, pests and get treatment advice"
                  role="listitem"
                >
                  <span className="mode-icon" aria-hidden="true">🔬</span>
                  <div className="mode-card-body">
                    <h3>Check Plant Health</h3>
                    <p>Is something wrong? Get a diagnosis and step-by-step treatment plan</p>
                  </div>
                </button>

                <button
                  className="mode-card mode-card-ideas"
                  onClick={handleGetSuggestions}
                  disabled={suggestionsLoading}
                  aria-label="Get plant ideas — personalized plant recommendations for your location"
                  role="listitem"
                >
                  <span className="mode-icon" aria-hidden="true">💡</span>
                  <div className="mode-card-body">
                    <h3>Get Plant Ideas</h3>
                    <p>Not sure what to grow? Get picks suited to your {profile.gardenType.replace("-", " ")} and climate</p>
                  </div>
                  {suggestionsLoading && <span className="mode-card-loading" aria-label="Loading suggestions"><span className="spinner" /></span>}
                </button>
              </div>

              {profile.plantPreferences.length > 0 && (
                <div className="prefs-section">
                  <p className="prefs-label">Your interests</p>
                  <div className="pref-chips">
                    {profile.plantPreferences.map((p) => (
                      <span key={p} className="pref-chip">{p}</span>
                    ))}
                  </div>
                </div>
              )}

              {isLoggedIn && (
                <button className="btn-my-plan" onClick={() => setShowPlan(true)}>
                  🌿 My Garden Plan
                  <span className="btn-my-plan-sub">View plants you want to buy &amp; grow</span>
                </button>
              )}

              {!isLoggedIn && (
                <button className="btn-sign-in-prompt" onClick={() => setAuth(false)}>
                  Sign in to save your searches across devices
                </button>
              )}
            </div>
          )}

          {/* ── Capture Screen ── */}
          {isCapture && (
            <div className="capture-section">
              <div className="capture-header">
                <button className="ga-back" onClick={() => { resetCapture(); setScreen("home"); }}>
                  ← Back
                </button>
                <div>
                  <h2 className="capture-title">
                    {captureMode === "garden" ? "Analyze My Garden" : "Check Plant Health"}
                  </h2>
                  <p className="capture-subtitle">
                    {captureMode === "garden"
                      ? "Take or upload a photo of your garden"
                      : "Take or upload a close-up of the plant"}
                  </p>
                </div>
              </div>

              <div
                className={`drop-zone ${dragOver ? "drag-over" : ""} ${imagePreview ? "has-image" : ""}`}
                onDrop={handleDrop}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onClick={() => !imagePreview && fileInputRef.current?.click()}
              >
                {imagePreview ? (
                  <div className="preview-container">
                    <img src={imagePreview} alt="Preview" className="preview-image" />
                    <button
                      className="change-photo"
                      onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                    >
                      Change photo
                    </button>
                  </div>
                ) : (
                  <div className="drop-content">
                    <div className="drop-icon">📸</div>
                    <p className="drop-title">Drop your photo here</p>
                    <p className="drop-sub">or click to browse files</p>
                    <button
                      className="btn-camera"
                      onClick={(e) => { e.stopPropagation(); setCameraOpen(true); }}
                      aria-label="Open camera to take a photo"
                    >
                      📷 Take a Photo
                    </button>
                    <p className="drop-hint">Supports JPEG, PNG, WebP · Max 20MB</p>
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileInput}
                  className="file-input"
                />
              </div>

              {error && (
                <div className="error-banner">
                  <span className="error-icon">⚠️</span>
                  {error}
                </div>
              )}

              {imagePreview && (
                <div className="action-row">
                  <button
                    className="btn-diagnose"
                    onClick={captureMode === "garden" ? handleGardenAnalyze : handleHealthDiagnose}
                    disabled={loading}
                  >
                    {loading ? (
                      <>
                        <span className="spinner" />
                        {captureMode === "garden" ? "Analyzing garden…" : "Diagnosing plant…"}
                      </>
                    ) : (
                      <>
                        <span>{captureMode === "garden" ? "🌿" : "🔬"}</span>
                        {captureMode === "garden" ? "Analyze Garden" : "Diagnose Plant"}
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── Results ── */}
          {screen === "garden-result" && gardenAnalysis && (
            <GardenAnalysis
              analysis={gardenAnalysis}
              imagePreview={imagePreview ?? ""}
              profile={profile}
              onBack={() => setScreen("home")}
              onHealthCheck={() => { resetCapture(); setScreen("health-check"); }}
            />
          )}

          {screen === "health-result" && diagnosis && (
            <DiagnosisResult
              diagnosis={diagnosis}
              imagePreview={imagePreview ?? ""}
              onReset={() => setScreen("home")}
            />
          )}

          {screen === "suggestions" && (
            suggestionsLoading ? (
              <div className="suggestions-loading">
                <div className="suggestions-loading-inner">
                  <span className="suggestions-loading-icon">💡</span>
                  <span className="spinner suggestions-spinner" />
                  <p>Finding plants for your garden…</p>
                </div>
              </div>
            ) : suggestions ? (
              <PlantSuggestions
                suggestions={suggestions.plants}
                shops={suggestions.shops}
                profile={profile}
                token={isLoggedIn ? (auth as AuthState).token : null}
                onBack={() => setScreen("home")}
                onAddPreference={handleAddPreference}
                onOpenPlan={() => setShowPlan(true)}
              />
            ) : null
          )}

        </div>
      </main>

      <footer className="footer">
        <p>Flourish uses Claude AI · For informational purposes only · Always consult a local expert for serious issues</p>
      </footer>

      {cameraOpen && (
        <CameraCapture
          onCapture={(file) => { handleFile(file); }}
          onClose={() => setCameraOpen(false)}
        />
      )}

      {showPlan && isLoggedIn && (
        <GardenPlanPanel
          token={(auth as AuthState).token}
          location={profile.location}
          onClose={() => setShowPlan(false)}
        />
      )}

      {showHistory && isLoggedIn && (
        <HistoryPanel
          token={(auth as AuthState).token}
          onClose={() => setShowHistory(false)}
          onRestoreGarden={(analysis) => {
            setGardenAnalysis(analysis);
            setImagePreview(null);
            setScreen("garden-result");
          }}
          onRestoreHealth={(diag) => {
            setDiagnosis(diag);
            setImagePreview(null);
            setScreen("health-result");
          }}
          onRestoreSuggestions={(data) => {
            setSuggestions(data);
            setScreen("suggestions");
          }}
        />
      )}
    </div>
  );
}
