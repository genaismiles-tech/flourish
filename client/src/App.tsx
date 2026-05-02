import { useCallback, useEffect, useRef, useState } from "react";
import CameraCapture from "./components/CameraCapture";
import DiagnosisResult from "./components/DiagnosisResult";
import GardenAnalysis from "./components/GardenAnalysis";
import Onboarding from "./components/Onboarding";
import PlantSuggestions from "./components/PlantSuggestions";
import type {
  DiagnosisData,
  GardenAnalysis as GardenAnalysisType,
  PlantSuggestion,
  UserProfile,
} from "./types";
import "./App.css";

type Screen =
  | "home"
  | "garden-scan"
  | "garden-result"
  | "health-check"
  | "health-result"
  | "suggestions";

const PROFILE_KEY = "flourish-profile";
const TEXT_SIZE_KEY = "flourish-text-size";

async function readErrorMessage(res: Response, fallback: string): Promise<string> {
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    try {
      const data = await res.json();
      return data.error || fallback;
    } catch {
      return fallback;
    }
  }
  return fallback;
}

function loadProfile(): UserProfile | null {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    return raw ? (JSON.parse(raw) as UserProfile) : null;
  } catch {
    return null;
  }
}

function saveProfile(profile: UserProfile) {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default function App() {
  const [profile, setProfile] = useState<UserProfile | null>(loadProfile);
  const [screen, setScreen] = useState<Screen>("home");

  // Capture state
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Result state
  const [diagnosis, setDiagnosis] = useState<DiagnosisData | null>(null);
  const [gardenAnalysis, setGardenAnalysis] = useState<GardenAnalysisType | null>(null);
  const [suggestions, setSuggestions] = useState<PlantSuggestion[] | null>(null);

  // Loading / error
  const [loading, setLoading] = useState(false);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Accessibility: text size
  const [textLarge, setTextLarge] = useState(() => localStorage.getItem(TEXT_SIZE_KEY) === "large");

  useEffect(() => {
    document.documentElement.style.fontSize = textLarge ? "20px" : "";
  }, [textLarge]);

  const toggleTextSize = () => {
    const next = !textLarge;
    setTextLarge(next);
    localStorage.setItem(TEXT_SIZE_KEY, next ? "large" : "normal");
  };

  // ── Onboarding ──
  const handleOnboardingComplete = (newProfile: UserProfile) => {
    saveProfile(newProfile);
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
      const data: PlantSuggestion[] = await res.json();
      setSuggestions(data);
    } catch (err) {
      // Go back home and show error in banner
      setError(err instanceof Error ? err.message : "Something went wrong");
      setScreen("home");
    } finally {
      setSuggestionsLoading(false);
    }
  };

  const handleAddPreference = (pref: string) => {
    if (!profile) return;
    if (profile.plantPreferences.includes(pref)) return;
    const updated: UserProfile = {
      ...profile,
      plantPreferences: [...profile.plantPreferences, pref],
    };
    saveProfile(updated);
    setProfile(updated);
  };

  const handleSettings = () => {
    if (window.confirm("Reset your profile and start over?")) {
      localStorage.removeItem(PROFILE_KEY);
      window.location.reload();
    }
  };

  // ── If no profile, show onboarding ──
  if (!profile) {
    return <Onboarding onComplete={handleOnboardingComplete} />;
  }

  const isCapture = screen === "garden-scan" || screen === "health-check";
  const captureMode = screen === "garden-scan" ? "garden" : "health";

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
              onClick={handleSettings}
              aria-label="Settings — reset your garden profile"
              title="Settings"
            >
              ⚙️
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
            </div>
          )}

          {/* ── Capture Screen (shared for garden-scan and health-check) ── */}
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
          {screen === "garden-result" && gardenAnalysis && imagePreview && (
            <GardenAnalysis
              analysis={gardenAnalysis}
              imagePreview={imagePreview}
              profile={profile}
              onBack={() => setScreen("home")}
              onHealthCheck={() => { resetCapture(); setScreen("health-check"); }}
            />
          )}

          {screen === "health-result" && diagnosis && imagePreview && (
            <DiagnosisResult
              diagnosis={diagnosis}
              imagePreview={imagePreview}
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
                suggestions={suggestions}
                profile={profile}
                onBack={() => setScreen("home")}
                onAddPreference={handleAddPreference}
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
    </div>
  );
}
