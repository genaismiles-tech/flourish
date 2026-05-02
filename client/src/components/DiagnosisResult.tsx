import PlantImage from "./PlantImage";
import PlantChat from "./PlantChat";
import "./DiagnosisResult.css";

interface Issue {
  name: string;
  severity: "low" | "medium" | "high";
  description: string;
  symptoms: string[];
  causes: string[];
  treatment: string[];
  prevention: string[];
}

interface DiagnosisData {
  plantName: string;
  healthStatus: "healthy" | "diseased" | "stressed" | "unknown";
  issues: Issue[];
  overallAdvice: string;
  confidence: "high" | "medium" | "low";
}

interface Props {
  diagnosis: DiagnosisData;
  imagePreview: string;
  onReset: () => void;
}

const statusConfig = {
  healthy: { label: "Healthy", color: "status-healthy", icon: "✅", bg: "bg-healthy" },
  diseased: { label: "Diseased", color: "status-diseased", icon: "🔴", bg: "bg-diseased" },
  stressed: { label: "Stressed", color: "status-stressed", icon: "🟡", bg: "bg-stressed" },
  unknown: { label: "Unknown", color: "status-unknown", icon: "❓", bg: "bg-unknown" },
};

const severityConfig = {
  low: { label: "Low", class: "sev-low", icon: "🟢" },
  medium: { label: "Medium", class: "sev-medium", icon: "🟡" },
  high: { label: "High", class: "sev-high", icon: "🔴" },
};

const confidenceConfig = {
  high: { label: "High confidence", class: "conf-high" },
  medium: { label: "Medium confidence", class: "conf-medium" },
  low: { label: "Low confidence", class: "conf-low" },
};

export default function DiagnosisResult({ diagnosis, imagePreview, onReset }: Props) {
  const status = statusConfig[diagnosis.healthStatus] ?? statusConfig.unknown;
  const confidence = confidenceConfig[diagnosis.confidence] ?? confidenceConfig.medium;

  return (
    <div className="result-page">
      <div className="result-header">
        <button className="btn-back" onClick={onReset}>
          ← New Diagnosis
        </button>
        <h2 className="result-heading">Diagnosis Report</h2>
      </div>

      <div className="result-grid">
        {/* Left: image + summary */}
        <div className="result-left">
          <div className="plant-image-card">
            <img src={imagePreview} alt="Analyzed plant" className="plant-image" />
          </div>

          {diagnosis.plantName !== "Unknown plant" && diagnosis.plantName !== "Not a plant" && (
            <PlantImage
              scientificName={diagnosis.plantName}
              commonName={diagnosis.plantName}
              className="diagnosis-plant-img"
            />
          )}

          <div className={`summary-card ${status.bg}`}>
            <div className="summary-status">
              <span className="status-icon">{status.icon}</span>
              <div>
                <div className="plant-name">{diagnosis.plantName}</div>
                <div className={`status-label ${status.color}`}>{status.label}</div>
              </div>
            </div>
            <span className={`confidence-badge ${confidence.class}`}>
              {confidence.label}
            </span>
          </div>

          <div className="advice-card">
            <h3 className="card-title">💡 Overall Advice</h3>
            <p className="advice-text">{diagnosis.overallAdvice}</p>
          </div>
        </div>

        {/* Right: issues */}
        <div className="result-right">
          {diagnosis.issues.length === 0 ? (
            diagnosis.healthStatus === "unknown" ? (
              <div className="no-issues no-issues-unknown">
                <div className="no-issues-icon">🔍</div>
                <h3>Plant identified — health scan unavailable</h3>
                <p>We identified the plant but couldn't run a full disease analysis right now. Try again in a moment, or use a close-up photo of affected leaves for a better result.</p>
              </div>
            ) : (
              <div className="no-issues">
                <div className="no-issues-icon">🎉</div>
                <h3>Your plant looks healthy!</h3>
                <p>No diseases, pests, or deficiencies detected. Keep up the great care!</p>
              </div>
            )
          ) : (
            <>
              <h3 className="issues-heading">
                {diagnosis.issues.length} Issue{diagnosis.issues.length !== 1 ? "s" : ""} Found
              </h3>
              <div className="issues-list">
                {diagnosis.issues.map((issue, i) => (
                  <IssueCard key={i} issue={issue} />
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="result-chat-section">
        <PlantChat
          context={`Plant: ${diagnosis.plantName}. Health status: ${diagnosis.healthStatus}. ${diagnosis.issues.length > 0 ? `Issues found: ${diagnosis.issues.map((i) => i.name).join(", ")}.` : "No issues detected."} Advice: ${diagnosis.overallAdvice}`}
          plantName={diagnosis.plantName}
        />
      </div>

      <div className="result-footer">
        <button className="btn-new" onClick={onReset}>
          🌿 Diagnose Another Plant
        </button>
      </div>
    </div>
  );
}

function IssueCard({ issue }: { issue: Issue }) {
  const sev = severityConfig[issue.severity] ?? severityConfig.medium;

  return (
    <div className={`issue-card ${sev.class}`}>
      <div className="issue-header">
        <h4 className="issue-name">{issue.name}</h4>
        <span className={`severity-badge ${sev.class}`}>
          {sev.icon} {sev.label} severity
        </span>
      </div>

      <p className="issue-desc">{issue.description}</p>

      <div className="issue-sections">
        {issue.symptoms.length > 0 && (
          <IssueSection title="🔍 Symptoms" items={issue.symptoms} />
        )}
        {issue.causes.length > 0 && (
          <IssueSection title="🧬 Causes" items={issue.causes} />
        )}
        {issue.treatment.length > 0 && (
          <IssueSection title="💊 Treatment" items={issue.treatment} accent />
        )}
        {issue.prevention.length > 0 && (
          <IssueSection title="🛡️ Prevention" items={issue.prevention} />
        )}
      </div>
    </div>
  );
}

function IssueSection({ title, items, accent }: { title: string; items: string[]; accent?: boolean }) {
  return (
    <div className={`issue-section ${accent ? "accent" : ""}`}>
      <h5 className="section-title">{title}</h5>
      <ul className="section-list">
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
