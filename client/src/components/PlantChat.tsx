import { useEffect, useRef, useState } from "react";
import "./PlantChat.css";

interface Message {
  role: "user" | "assistant";
  text: string;
}

interface Props {
  context: string;
  plantName?: string;
}

const SUGGESTIONS = [
  "How do I care for this plant?",
  "What's the best fertilizer to use?",
  "How often should I water it?",
  "Is it safe for pets and children?",
  "How do I propagate it?",
];

export default function PlantChat({ context, plantName }: Props) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      inputRef.current?.focus();
    }
  }, [messages, open]);

  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const next: Message[] = [...messages, { role: "user", text: trimmed }];
    setMessages(next);
    setInput("");
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next, context }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        setMessages(next);
      } else {
        setMessages([...next, { role: "assistant", text: data.reply }]);
      }
    } catch {
      setError("Could not reach the server. Please try again.");
      setMessages(next);
    } finally {
      setLoading(false);
    }
  };

  const label = plantName ? `Ask about ${plantName}` : "Ask about your plants";

  return (
    <div className="plant-chat">
      <button className="chat-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="chat-toggle-icon">💬</span>
        <span className="chat-toggle-label">{label}</span>
        <span className="chat-toggle-arrow">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="chat-panel">
          <div className="chat-messages">
            {messages.length === 0 && (
              <div className="chat-empty">
                <p className="chat-hint">Try a question:</p>
                <div className="suggestion-chips">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} className="suggestion-chip" onClick={() => sendMessage(s)} disabled={loading}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <div key={i} className={`chat-bubble-row ${m.role}`}>
                {m.role === "assistant" && <span className="chat-avatar">🌿</span>}
                <div className="chat-bubble">{m.text}</div>
              </div>
            ))}

            {loading && (
              <div className="chat-bubble-row assistant">
                <span className="chat-avatar">🌿</span>
                <div className="chat-bubble chat-typing">
                  <span className="dot" /><span className="dot" /><span className="dot" />
                </div>
              </div>
            )}

            {error && <p className="chat-error">{error}</p>}
            <div ref={bottomRef} />
          </div>

          <div className="chat-input-row">
            <input
              ref={inputRef}
              className="chat-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); } }}
              placeholder="Ask a question…"
              disabled={loading}
              aria-label="Chat input"
            />
            <button
              className="chat-send"
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || loading}
              aria-label="Send"
            >
              ➤
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
