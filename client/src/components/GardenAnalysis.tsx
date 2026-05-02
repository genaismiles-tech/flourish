import { useState } from "react";
import type { GardenAnalysis as GardenAnalysisType, UserProfile } from "../types";
import PlantImage from "./PlantImage";
import PlantChat from "./PlantChat";
import "./GardenAnalysis.css";

interface Props {
  analysis: GardenAnalysisType;
  imagePreview: string;
  profile: UserProfile;
  onBack: () => void;
  onHealthCheck: () => void;
}

type Tab = "garden" | "improve" | "care" | "find" | "chat";

const TABS: Array<{ id: Tab; label: string; emoji: string }> = [
  { id: "garden", label: "Garden", emoji: "🌿" },
  { id: "improve", label: "Improve", emoji: "✨" },
  { id: "care", label: "Care", emoji: "✂️" },
  { id: "find", label: "Find", emoji: "🛒" },
  { id: "chat", label: "Chat", emoji: "💬" },
];

export default function GardenAnalysis({ analysis, imagePreview, profile, onBack, onHealthCheck }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("garden");

  return (
    <div className="ga-page">
      {/* Header */}
      <div className="ga-header">
        <button className="ga-back" onClick={onBack}>← Back</button>
        <h2 className="ga-heading">Garden Analysis</h2>
        <img src={imagePreview} alt="Your garden" className="ga-thumb" />
      </div>

      {/* Tabs */}
      <div className="ga-tabs">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={`ga-tab ${activeTab === tab.id ? "active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span>{tab.emoji}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      <div className="ga-content">
        {activeTab === "garden" && (
          <GardenTab analysis={analysis} imagePreview={imagePreview} onHealthCheck={onHealthCheck} />
        )}
        {activeTab === "improve" && (
          <ImproveTab analysis={analysis} />
        )}
        {activeTab === "care" && (
          <CareTab analysis={analysis} />
        )}
        {activeTab === "find" && (
          <FindTab analysis={analysis} profile={profile} />
        )}
        {activeTab === "chat" && (
          <ChatTab analysis={analysis} profile={profile} />
        )}
      </div>
    </div>
  );
}

// Maps position text → approximate [top%, left%] on the image
function positionToCoords(position: string | undefined, index: number, total: number): { top: number; left: number } {
  if (position) {
    const p = position.toLowerCase();
    const top =
      p.includes("top") || p.includes("back") || p.includes("rear") || p.includes("upper") ? 12
      : p.includes("bottom") || p.includes("front") || p.includes("foreground") ? 72
      : p.includes("mid") || p.includes("center") || p.includes("centre") ? 42
      : null;
    const left =
      p.includes("left") ? 8
      : p.includes("right") ? 68
      : p.includes("center") || p.includes("centre") || p.includes("middle") ? 38
      : null;
    if (top !== null || left !== null) {
      return {
        top: top ?? 20 + (index * 55) / Math.max(total - 1, 1),
        left: left ?? 10 + (index * 60) / Math.max(total - 1, 1),
      };
    }
  }
  // Spread labels in a loose grid so they don't stack
  const cols = total <= 2 ? total : total <= 4 ? 2 : 3;
  const col = index % cols;
  const row = Math.floor(index / cols);
  const rows = Math.ceil(total / cols);
  return {
    top: 10 + (row * 70) / Math.max(rows, 1),
    left: 6 + (col * 78) / Math.max(cols - 1, 1),
  };
}

function AnnotatedGardenImage({
  imagePreview,
  plants,
}: {
  imagePreview: string;
  plants: GardenAnalysisType["identifiedPlants"];
}) {
  const [active, setActive] = useState<number | null>(null);

  return (
    <div className="annotated-wrap">
      <img src={imagePreview} alt="Your garden" className="annotated-img" />
      {plants.map((plant, i) => {
        const { top, left } = positionToCoords(plant.position, i, plants.length);
        const dotColor =
          plant.healthStatus === "healthy" ? "#16a34a"
          : plant.healthStatus === "needs-attention" ? "#f59e0b"
          : "#ef4444";
        return (
          <button
            key={i}
            className={`plant-pin ${active === i ? "plant-pin-active" : ""}`}
            style={{ top: `${top}%`, left: `${left}%` }}
            onClick={() => setActive(active === i ? null : i)}
          >
            <span className="pin-dot" style={{ background: dotColor }} />
            <span className="pin-name">{plant.commonName}</span>
            {active === i && (
              <div className="pin-tooltip">
                <div className="tooltip-scientific">{plant.name}</div>
                <div className="tooltip-notes">{plant.healthNotes}</div>
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}

function GardenTab({ analysis, imagePreview, onHealthCheck }: {
  analysis: GardenAnalysisType;
  imagePreview: string;
  onHealthCheck: () => void;
}) {
  const score = analysis.overallScore;

  const scoreColor = score
    ? score.score >= 8 ? "#16a34a" : score.score >= 5 ? "#d97706" : "#dc2626"
    : "#16a34a";

  return (
    <div className="tab-body">
      {score && (
        <div className="score-banner" style={{ borderColor: scoreColor }}>
          <div className="score-circle" style={{ background: scoreColor }}>
            <span className="score-num">{score.score}</span>
            <span className="score-denom">/10</span>
          </div>
          <div className="score-text">
            <div className="score-label">{score.label}</div>
            <div className="score-message">{score.message}</div>
          </div>
        </div>
      )}

      {/* Annotated image */}
      {analysis.identifiedPlants.length > 0 && (
        <AnnotatedGardenImage imagePreview={imagePreview} plants={analysis.identifiedPlants} />
      )}

      <div className="summary-box">
        <p className="summary-text">{analysis.gardenSummary}</p>
      </div>

      <div className="section-header">
        <h3 className="section-title">Identified Plants</h3>
        <button className="btn-health-check" onClick={onHealthCheck}>
          🔬 Health Check
        </button>
      </div>

      {analysis.identifiedPlants.length > 0 ? (
        <div className="plants-scroll">
          {analysis.identifiedPlants.map((plant, i) => {
            const statusIcon =
              plant.healthStatus === "healthy" ? "✅"
              : plant.healthStatus === "needs-attention" ? "⚠️" : "🔴";
            const statusClass =
              plant.healthStatus === "healthy" ? "hs-healthy"
              : plant.healthStatus === "needs-attention" ? "hs-attention" : "hs-struggling";
            return (
              <div key={i} className="plant-card">
                <div className="plant-card-image-row">
                  <PlantImage scientificName={plant.name} commonName={plant.commonName} className="plant-card-img" />
                  <div className="plant-card-info">
                    <div className="plant-card-top">
                      <div className="plant-names">
                        <div className="plant-common">{plant.commonName}</div>
                        <div className="plant-scientific">{plant.name}</div>
                      </div>
                      <span className={`health-badge ${statusClass}`}>{statusIcon} {plant.healthStatus.replace("-", " ")}</span>
                    </div>
                    {plant.position && <div className="plant-position">📍 {plant.position}</div>}
                    <p className="plant-notes">{plant.healthNotes}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="empty-state">No specific plants identified in this image.</div>
      )}
    </div>
  );
}

function ImproveTab({ analysis }: { analysis: GardenAnalysisType }) {
  return (
    <div className="tab-body">
      <h3 className="section-title">Layout Suggestions</h3>
      <div className="cards-list">
        {analysis.layoutSuggestions.map((s, i) => {
          const priorityClass =
            s.priority === "quick-win"
              ? "priority-quick"
              : s.priority === "seasonal"
              ? "priority-seasonal"
              : "priority-long";
          const priorityLabel =
            s.priority === "quick-win"
              ? "⚡ Quick Win"
              : s.priority === "seasonal"
              ? "🍂 Seasonal"
              : "🌱 Long-term";
          return (
            <div key={i} className="improve-card">
              <div className="improve-card-header">
                <h4 className="improve-title">{s.title}</h4>
                <span className={`priority-badge ${priorityClass}`}>{priorityLabel}</span>
              </div>
              <p className="improve-desc">{s.description}</p>
              {s.estimatedImpact && (
                <div className="improve-impact">
                  <span className="impact-label">Impact:</span> {s.estimatedImpact}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <h3 className="section-title" style={{ marginTop: "1.5rem" }}>Beauty Suggestions</h3>
      <div className="cards-list">
        {analysis.beautySuggestions.map((s, i) => (
          <div key={i} className="beauty-card">
            <h4 className="improve-title">{s.title}</h4>
            <p className="improve-desc">{s.description}</p>
            {s.suggestedPlants && s.suggestedPlants.length > 0 && (
              <div className="suggested-plants">
                {s.suggestedPlants.map((p, j) => (
                  <span key={j} className="plant-chip">🌱 {p}</span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {analysis.recommendedNewPlants.length > 0 && (
        <>
          <h3 className="section-title" style={{ marginTop: "1.5rem" }}>Recommended New Plants</h3>
          <div className="cards-list">
            {analysis.recommendedNewPlants.map((p, i) => {
              const careClass =
                p.careLevel === "easy"
                  ? "care-easy"
                  : p.careLevel === "moderate"
                  ? "care-moderate"
                  : "care-advanced";
              return (
                <div key={i} className="new-plant-card">
                  <div className="new-plant-header">
                    <span className="new-plant-name">{p.name}</span>
                    <span className={`care-badge ${careClass}`}>{p.careLevel}</span>
                  </div>
                  <p className="improve-desc">{p.reason}</p>
                  {p.whenToPlant && (
                    <div className="when-to-plant">
                      <span>🗓️</span> {p.whenToPlant}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function CareTab({ analysis }: { analysis: GardenAnalysisType }) {
  return (
    <div className="tab-body">
      <h3 className="section-title">Maintenance Schedule</h3>
      <div className="cards-list">
        {analysis.maintenanceSchedule.map((m, i) => (
          <div key={i} className="maint-card">
            <div className="maint-header">
              <span className="maint-task">{m.task}</span>
              <span className="maint-freq">{m.frequency}</span>
            </div>
            <div className="maint-time">
              <span>⏰</span> {m.bestTime}
            </div>
            {m.tips && (
              <div className="maint-tips">
                <span className="tips-label">💡 Tip:</span> {m.tips}
              </div>
            )}
          </div>
        ))}
      </div>

      <h3 className="section-title" style={{ marginTop: "1.5rem" }}>Trimming & Waste</h3>
      <div className="trimming-card">
        <p className="trimming-advice">{analysis.trimmingAndWaste.advice}</p>
        {analysis.trimmingAndWaste.compostingTips && (
          <div className="trimming-section">
            <div className="trimming-section-title">♻️ Composting</div>
            <p>{analysis.trimmingAndWaste.compostingTips}</p>
          </div>
        )}
        {analysis.trimmingAndWaste.disposalAdvice && (
          <div className="trimming-section">
            <div className="trimming-section-title">🗑️ Disposal</div>
            <p>{analysis.trimmingAndWaste.disposalAdvice}</p>
          </div>
        )}
      </div>

      {analysis.potAndContainerAdvice && (
        <>
          <h3 className="section-title" style={{ marginTop: "1.5rem" }}>Pot & Container Advice</h3>
          <div className="pot-card">
            <p>{analysis.potAndContainerAdvice}</p>
          </div>
        </>
      )}
    </div>
  );
}

function ChatTab({ analysis, profile }: { analysis: GardenAnalysisType; profile: UserProfile }) {
  const plantNames = analysis.identifiedPlants.map((p) => p.commonName).join(", ") || "unknown plants";
  const context = `Garden in ${profile.location}. Plants identified: ${plantNames}. Summary: ${analysis.gardenSummary} Seasonal advice: ${analysis.seasonalAdvice}`;
  return (
    <div className="tab-body">
      <p className="chat-tab-intro">
        Ask anything about your garden or the plants identified — care tips, watering schedules, pest control, and more.
      </p>
      <PlantChat context={context} plantName="your garden" />
    </div>
  );
}

function FindTab({ analysis, profile }: { analysis: GardenAnalysisType; profile: UserProfile }) {
  return (
    <div className="tab-body">
      <h3 className="section-title">Local Resources</h3>
      <div className="cards-list">
        {analysis.localResources.map((r, i) => {
          const hasRealData = !!(r.name || r.address || r.distance);
          const linkUrl = r.url
            ? r.url
            : `https://www.google.com/search?q=${encodeURIComponent((r.name ?? r.searchSuggestion) + " " + profile.location)}`;
          const linkLabel = r.url?.startsWith("https://www.openstreetmap") ? "View on map →" : r.url ? "Visit website →" : "Search →";
          return (
            <div key={i} className="resource-card">
              <div className="resource-header">
                <span className="resource-type">{r.type}</span>
                {r.distance && <span className="resource-distance">{r.distance}</span>}
              </div>
              {hasRealData && r.name && (
                <div className="resource-name">{r.name}</div>
              )}
              <p className="improve-desc">{r.description}</p>
              {r.address && (
                <div className="resource-address">📍 {r.address}</div>
              )}
              <div className="resource-search">
                {!hasRealData && <span className="search-suggestion">{r.searchSuggestion}</span>}
                <a
                  href={linkUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-search"
                >
                  {linkLabel}
                </a>
              </div>
            </div>
          );
        })}
      </div>

      <h3 className="section-title" style={{ marginTop: "1.5rem" }}>Weather & Climate</h3>
      <div className="weather-card">
        <div className="weather-icon">🌤️</div>
        <p>{analysis.weatherConsiderations}</p>
      </div>

      <h3 className="section-title" style={{ marginTop: "1.5rem" }}>Seasonal Advice</h3>
      <div className="seasonal-card">
        <div className="weather-icon">🍃</div>
        <p>{analysis.seasonalAdvice}</p>
      </div>
    </div>
  );
}
