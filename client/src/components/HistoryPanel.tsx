import { useEffect, useState } from "react";
import type { DiagnosisData, GardenAnalysis, SuggestionsResponse } from "../types";
import "./HistoryPanel.css";

interface HistoryItem {
  id: number;
  type: "garden" | "health" | "suggestions";
  title: string;
  created_at: string;
}

interface HistoryDetail extends HistoryItem {
  result: GardenAnalysis | DiagnosisData | SuggestionsResponse;
}

interface Props {
  token: string;
  onClose: () => void;
  onRestoreGarden: (analysis: GardenAnalysis) => void;
  onRestoreHealth: (diagnosis: DiagnosisData) => void;
  onRestoreSuggestions: (data: SuggestionsResponse) => void;
}

const TYPE_LABEL: Record<string, string> = {
  garden: "🌿 Garden Analysis",
  health: "🔬 Health Check",
  suggestions: "💡 Plant Ideas",
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function HistoryPanel({ token, onClose, onRestoreGarden, onRestoreHealth, onRestoreSuggestions }: Props) {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<HistoryDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const headers = { Authorization: `Bearer ${token}` };

  useEffect(() => {
    fetch("/api/user/history", { headers })
      .then((r) => r.json())
      .then((d) => setItems(d.history ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const loadDetail = async (id: number) => {
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/user/history/${id}`, { headers });
      const d = await res.json();
      setDetail(d as HistoryDetail);
    } catch {}
    setDetailLoading(false);
  };

  const deleteItem = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    await fetch(`/api/user/history/${id}`, { method: "DELETE", headers });
    setItems((prev) => prev.filter((i) => i.id !== id));
    if (detail?.id === id) setDetail(null);
  };

  const restore = () => {
    if (!detail) return;
    if (detail.type === "garden") onRestoreGarden(detail.result as GardenAnalysis);
    else if (detail.type === "health") onRestoreHealth(detail.result as DiagnosisData);
    else if (detail.type === "suggestions") onRestoreSuggestions(detail.result as SuggestionsResponse);
    onClose();
  };

  return (
    <div className="history-overlay" onClick={onClose}>
      <div className="history-panel" onClick={(e) => e.stopPropagation()}>
        <div className="history-header">
          <h2 className="history-title">Saved Searches</h2>
          <button className="history-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {loading ? (
          <div className="history-loading"><span className="spinner" /></div>
        ) : items.length === 0 ? (
          <div className="history-empty">
            <p>No saved searches yet.</p>
            <p>Your garden analyses, health checks, and plant ideas will appear here.</p>
          </div>
        ) : (
          <div className="history-body">
            <div className="history-list">
              {items.map((item) => (
                <button
                  key={item.id}
                  className={`history-item ${detail?.id === item.id ? "selected" : ""}`}
                  onClick={() => loadDetail(item.id)}
                >
                  <div className="history-item-type">{TYPE_LABEL[item.type] ?? item.type}</div>
                  <div className="history-item-title">{item.title}</div>
                  <div className="history-item-footer">
                    <span className="history-item-date">{formatDate(item.created_at)}</span>
                    <button
                      className="history-item-delete"
                      onClick={(e) => deleteItem(item.id, e)}
                      aria-label="Delete"
                      title="Delete"
                    >
                      🗑
                    </button>
                  </div>
                </button>
              ))}
            </div>

            <div className="history-detail">
              {detailLoading ? (
                <div className="history-loading"><span className="spinner" /></div>
              ) : detail ? (
                <>
                  <div className="history-detail-header">
                    <div>
                      <div className="history-detail-type">{TYPE_LABEL[detail.type]}</div>
                      <div className="history-detail-title">{detail.title}</div>
                      <div className="history-detail-date">{formatDate(detail.created_at)}</div>
                    </div>
                    <button className="history-restore-btn" onClick={restore}>
                      Open →
                    </button>
                  </div>

                  {detail.type === "garden" && (
                    <GardenSummary data={detail.result as GardenAnalysis} />
                  )}
                  {detail.type === "health" && (
                    <HealthSummary data={detail.result as DiagnosisData} />
                  )}
                  {detail.type === "suggestions" && (
                    <SuggestionsSummary data={detail.result as SuggestionsResponse} />
                  )}
                </>
              ) : (
                <div className="history-detail-placeholder">
                  Select a search on the left to preview it
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function GardenSummary({ data }: { data: GardenAnalysis }) {
  return (
    <div className="history-summary">
      <p className="history-summary-text">{data.gardenSummary}</p>
      <div className="history-tags">
        {data.identifiedPlants.slice(0, 6).map((p) => (
          <span key={p.name} className={`history-tag health-${p.healthStatus}`}>
            {p.commonName}
          </span>
        ))}
      </div>
    </div>
  );
}

function HealthSummary({ data }: { data: DiagnosisData }) {
  return (
    <div className="history-summary">
      <p className="history-summary-text">
        <strong>{data.plantName}</strong> — {data.healthStatus}
      </p>
      <p className="history-summary-text">{data.overallAdvice}</p>
      {data.issues.length > 0 && (
        <div className="history-tags">
          {data.issues.map((i) => (
            <span key={i.name} className={`history-tag severity-${i.severity}`}>{i.name}</span>
          ))}
        </div>
      )}
    </div>
  );
}

function SuggestionsSummary({ data }: { data: SuggestionsResponse }) {
  return (
    <div className="history-summary">
      <div className="history-tags">
        {data.plants.slice(0, 8).map((p) => (
          <span key={p.name} className="history-tag">
            {p.emoji} {p.name}
          </span>
        ))}
      </div>
    </div>
  );
}
