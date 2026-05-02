import { useState } from "react";
import type { UserProfile, GardenType, ExperienceLevel } from "../types";
import "./Onboarding.css";

interface Props {
  onComplete: (profile: UserProfile) => void;
}

const GARDEN_TYPES: Array<{ value: GardenType; label: string; emoji: string }> = [
  { value: "backyard", label: "Backyard", emoji: "🏡" },
  { value: "front-yard", label: "Front Yard", emoji: "🌳" },
  { value: "balcony", label: "Balcony", emoji: "🌺" },
  { value: "indoor", label: "Indoor", emoji: "🪴" },
  { value: "mixed", label: "Mixed", emoji: "🌿" },
];

const EXPERIENCE_LEVELS: Array<{ value: ExperienceLevel; label: string; emoji: string; desc: string; hint?: string }> = [
  { value: "beginner", label: "Beginner", emoji: "🌱", desc: "Just starting out", hint: "Perfect if you're new!" },
  { value: "intermediate", label: "Intermediate", emoji: "🌿", desc: "Some experience" },
  { value: "expert", label: "Expert", emoji: "🌳", desc: "Seasoned gardener" },
];

const PLANT_CATEGORIES = [
  { label: "Flowering Plants", emoji: "🌸" },
  { label: "Vegetables", emoji: "🥦" },
  { label: "Herbs", emoji: "🌿" },
  { label: "Trees & Shrubs", emoji: "🌳" },
  { label: "Succulents", emoji: "🌵" },
  { label: "Tropical Plants", emoji: "🌴" },
  { label: "Native Plants", emoji: "🦋" },
  { label: "Fruit Plants", emoji: "🍓" },
  { label: "Roses", emoji: "🌹" },
  { label: "Indoor Plants", emoji: "🪴" },
  { label: "Ornamental Grasses", emoji: "🌾" },
  { label: "Climbers & Vines", emoji: "🍃" },
];

export default function Onboarding({ onComplete }: Props) {
  const [step, setStep] = useState(1);
  const [location, setLocation] = useState("");
  const [latitude, setLatitude] = useState<number | undefined>(undefined);
  const [longitude, setLongitude] = useState<number | undefined>(undefined);
  const [gardenType, setGardenType] = useState<GardenType | null>(null);
  const [experience, setExperience] = useState<ExperienceLevel | null>(null);
  const [plantPreferences, setPlantPreferences] = useState<string[]>([]);
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  const handleGeolocation = () => {
    if (!navigator.geolocation) {
      setGeoError("Geolocation is not supported by your browser.");
      return;
    }
    setGeoLoading(true);
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lon } = pos.coords;
        setLatitude(lat);
        setLongitude(lon);
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`,
            { headers: { "Accept-Language": "en" } }
          );
          const data = await res.json();
          const city =
            data.address?.city ||
            data.address?.town ||
            data.address?.village ||
            data.address?.county ||
            "";
          const country = data.address?.country || "";
          const locationStr = city && country ? `${city}, ${country}` : `${lat.toFixed(2)}, ${lon.toFixed(2)}`;
          setLocation(locationStr);
        } catch {
          setLocation(`${lat.toFixed(2)}, ${lon.toFixed(2)}`);
        }
        setGeoLoading(false);
      },
      () => {
        setGeoError("Could not get your location. Please enter it manually.");
        setGeoLoading(false);
      }
    );
  };

  const togglePreference = (label: string) => {
    setPlantPreferences((prev) =>
      prev.includes(label) ? prev.filter((p) => p !== label) : [...prev, label]
    );
  };

  const handleFinish = () => {
    if (!gardenType || !experience) return;
    const profile: UserProfile = {
      location: location.trim() || "Unknown location",
      latitude,
      longitude,
      gardenType,
      experience,
      plantPreferences,
    };
    onComplete(profile);
  };

  const canProceedStep1 = location.trim().length > 0;
  const canProceedStep2 = gardenType !== null && experience !== null;

  return (
    <div className="onboarding-overlay">
      <div className="onboarding-card">
        {/* Progress indicator */}
        <div className="onboarding-progress" role="progressbar" aria-valuenow={step} aria-valuemin={1} aria-valuemax={3} aria-label={`Step ${step} of 3`}>
          {[1, 2, 3].map((s) => (
            <div key={s} className={`progress-dot ${step === s ? "active" : step > s ? "done" : ""}`} />
          ))}
          <span className="step-counter">Step {step} of 3</span>
        </div>

        {step === 1 && (
          <div className="onboarding-step">
            <div className="onboarding-logo">
              <span className="onboarding-logo-icon">🌿</span>
              <span className="onboarding-logo-text">Flourish</span>
            </div>
            <h1 className="onboarding-title">Welcome to Flourish</h1>
            <p className="onboarding-sub">Your AI garden advisor — just answer 3 quick questions and we'll personalize everything for you.</p>

            <div className="onboarding-field">
              <label className="field-label" htmlFor="location-input">Where is your garden?</label>
              <p className="field-hint">We use this to give you climate-aware, seasonal advice</p>
              <input
                id="location-input"
                className="field-input"
                type="text"
                placeholder="e.g. London, UK or New York, USA"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                autoComplete="off"
              />
              <button
                className="btn-geo"
                onClick={handleGeolocation}
                disabled={geoLoading}
              >
                {geoLoading ? (
                  <>
                    <span className="geo-spinner" />
                    Locating…
                  </>
                ) : (
                  <>📍 Use my location</>
                )}
              </button>
              {geoError && <p className="geo-error">{geoError}</p>}
            </div>

            <button
              className="btn-next"
              onClick={() => setStep(2)}
              disabled={!canProceedStep1}
            >
              Continue →
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="onboarding-step">
            <h2 className="onboarding-title">Tell us about your garden</h2>
            <p className="onboarding-sub">Don't worry — you can always update this later.</p>

            <div className="onboarding-section">
              <label className="field-label">Garden type</label>
              <div className="garden-type-pills">
                {GARDEN_TYPES.map((gt) => (
                  <button
                    key={gt.value}
                    className={`garden-pill ${gardenType === gt.value ? "selected" : ""}`}
                    onClick={() => setGardenType(gt.value)}
                  >
                    <span className="pill-emoji">{gt.emoji}</span>
                    <span>{gt.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="onboarding-section">
              <label className="field-label">Experience level</label>
              <div className="experience-cards">
                {EXPERIENCE_LEVELS.map((el) => (
                  <button
                    key={el.value}
                    className={`experience-card ${experience === el.value ? "selected" : ""}`}
                    onClick={() => setExperience(el.value)}
                    aria-pressed={experience === el.value}
                  >
                    <span className="exp-emoji" aria-hidden="true">{el.emoji}</span>
                    <span className="exp-label">{el.label}</span>
                    <span className="exp-desc">{el.desc}</span>
                    {el.hint && <span className="exp-hint">{el.hint}</span>}
                  </button>
                ))}
              </div>
            </div>

            <div className="btn-row">
              <button className="btn-back-ob" onClick={() => setStep(1)}>← Back</button>
              <button
                className="btn-next"
                onClick={() => setStep(3)}
                disabled={!canProceedStep2}
              >
                Continue →
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="onboarding-step">
            <h2 className="onboarding-title">What do you love growing?</h2>
            <p className="onboarding-sub">Select anything that interests you — no experience needed! Skip if you're not sure yet.</p>

            <div className="plant-pref-grid">
              {PLANT_CATEGORIES.map((cat) => (
                <button
                  key={cat.label}
                  className={`pref-chip-ob ${plantPreferences.includes(cat.label) ? "selected" : ""}`}
                  onClick={() => togglePreference(cat.label)}
                >
                  <span>{cat.emoji}</span>
                  <span>{cat.label}</span>
                </button>
              ))}
            </div>

            <div className="btn-row">
              <button className="btn-back-ob" onClick={() => setStep(2)}>← Back</button>
              <button className="btn-skip" onClick={handleFinish}>
                Skip
              </button>
              <button className="btn-next" onClick={handleFinish}>
                Get Started 🌿
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
