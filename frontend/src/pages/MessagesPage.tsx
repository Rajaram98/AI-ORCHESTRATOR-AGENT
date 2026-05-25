import { useEffect, useState } from "react";
import { api, Message } from "../api";

export default function MessagesPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [channel, setChannel] = useState("");

  const load = () => {
    api.messages.list(channel ? { channel } : undefined).then(setMessages);
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [channel]);

  const deleteMessage = async (m: Message) => {
    if (!confirm("Delete this message?")) return;
    await api.messages.delete(m.id);
    load();
  };

  return (
    <div>
      <h2>Message history</h2>
      <div className="card">
        <label>Filter by channel</label>
        <select value={channel} onChange={(e) => setChannel(e.target.value)}>
          <option value="">All</option>
          <option value="internal">internal</option>
          <option value="telegram">telegram</option>
        </select>
      </div>
      {messages.map((m) => (
        <div key={m.id} className="card">
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem" }}>
            <span>
              <strong>{m.sender_type}</strong> {m.sender_id && `(${m.sender_id})`}
            </span>
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
              <span className="badge">{m.channel}</span>
              <button className="btn btn-danger" onClick={() => deleteMessage(m)}>
                Delete
              </button>
            </div>
          </div>
          <p style={{ marginTop: "0.5rem" }}>{m.content}</p>
          <p style={{ color: "var(--muted)", fontSize: "0.75rem" }}>
            thread: {m.thread_id} · {new Date(m.created_at).toLocaleString()}
          </p>
        </div>
      ))}
    </div>
  );
}
