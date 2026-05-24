import { useEffect, useState } from "react";
import { api, Agent } from "../api";

const empty: Partial<Agent> = {
  name: "",
  role: "assistant",
  system_prompt: "You are a helpful AI assistant.",
  model: "gpt-4o-mini",
  tools: [],
  channels: [],
  config: {
    schedules: [],
    memory: { enabled: true, max_turns: 20 },
    skills: [],
    interaction_rules: [],
    guardrails: { max_iterations: 10, max_output_chars: 8000 },
  },
};

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [tools, setTools] = useState<{ name: string; description: string }[]>([]);
  const [editing, setEditing] = useState<Partial<Agent> | null>(null);
  const [tab, setTab] = useState("identity");
  const [telegramChat, setTelegramChat] = useState("");

  const load = () => {
    api.agents.list().then(setAgents);
    api.agents.tools().then(setTools);
  };

  useEffect(() => {
    load();
  }, []);

  const save = async () => {
    if (!editing?.name) return;
    if (editing.id) {
      await api.agents.update(editing.id, editing);
    } else {
      await api.agents.create(editing);
    }
    setEditing(null);
    load();
  };

  const bindTelegram = async () => {
    if (!editing?.id || !telegramChat) return;
    await api.telegram.bind(editing.id, telegramChat);
    const updated = await api.agents.get(editing.id);
    setEditing(updated);
    load();
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2>Agents</h2>
        <button className="btn" onClick={() => setEditing({ ...empty })}>
          + New Agent
        </button>
      </div>

      {editing && (
        <div className="card">
          <div className="tabs">
            {["identity", "tools", "memory", "guardrails", "channels"].map((t) => (
              <button
                key={t}
                className={tab === t ? "active" : ""}
                onClick={() => setTab(t)}
              >
                {t}
              </button>
            ))}
          </div>

          {tab === "identity" && (
            <>
              <label>Name</label>
              <input
                value={editing.name || ""}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              />
              <label>Role</label>
              <input
                value={editing.role || ""}
                onChange={(e) => setEditing({ ...editing, role: e.target.value })}
              />
              <label>Model</label>
              <input
                value={editing.model || ""}
                onChange={(e) => setEditing({ ...editing, model: e.target.value })}
              />
              <label>System prompt</label>
              <textarea
                rows={5}
                value={editing.system_prompt || ""}
                onChange={(e) => setEditing({ ...editing, system_prompt: e.target.value })}
              />
            </>
          )}

          {tab === "tools" && (
            <div>
              {tools.map((t) => (
                <label key={t.name} style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                  <input
                    type="checkbox"
                    checked={(editing.tools || []).includes(t.name)}
                    onChange={(e) => {
                      const cur = editing.tools || [];
                      setEditing({
                        ...editing,
                        tools: e.target.checked
                          ? [...cur, t.name]
                          : cur.filter((x) => x !== t.name),
                      });
                    }}
                  />
                  {t.name} — {t.description}
                </label>
              ))}
            </div>
          )}

          {tab === "memory" && (
            <>
              <label>Max conversation turns</label>
              <input
                type="number"
                value={(editing.config as { memory?: { max_turns?: number } })?.memory?.max_turns ?? 20}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    config: {
                      ...editing.config,
                      memory: {
                        ...((editing.config as { memory?: object })?.memory || {}),
                        enabled: true,
                        max_turns: Number(e.target.value),
                      },
                    },
                  })
                }
              />
            </>
          )}

          {tab === "guardrails" && (
            <>
              <label>Max iterations</label>
              <input
                type="number"
                value={
                  (editing.config as { guardrails?: { max_iterations?: number } })?.guardrails
                    ?.max_iterations ?? 10
                }
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    config: {
                      ...editing.config,
                      guardrails: {
                        ...((editing.config as { guardrails?: object })?.guardrails || {}),
                        max_iterations: Number(e.target.value),
                      },
                    },
                  })
                }
              />
            </>
          )}

          {tab === "channels" && editing.id && (
            <>
              <p style={{ color: "var(--muted)" }}>
                Message your Telegram bot with /start to get your chat_id, then bind below.
              </p>
              <label>Telegram chat_id</label>
              <input value={telegramChat} onChange={(e) => setTelegramChat(e.target.value)} />
              <button className="btn" onClick={bindTelegram}>
                Bind Telegram
              </button>
              <pre style={{ fontSize: "0.8rem" }}>
                {JSON.stringify(editing.channels, null, 2)}
              </pre>
            </>
          )}

          <div style={{ marginTop: "1rem", display: "flex", gap: "0.5rem" }}>
            <button className="btn" onClick={save}>
              Save
            </button>
            <button className="btn btn-secondary" onClick={() => setEditing(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="grid-2">
        {agents.map((a) => (
          <div key={a.id} className="card">
            <h3>{a.name}</h3>
            <p style={{ color: "var(--muted)" }}>{a.role}</p>
            <p style={{ fontSize: "0.85rem" }}>Tools: {(a.tools || []).join(", ") || "none"}</p>
            <div style={{ marginTop: "0.75rem", display: "flex", gap: "0.5rem" }}>
              <button className="btn btn-secondary" onClick={() => setEditing(a)}>
                Edit
              </button>
              <button
                className="btn btn-danger"
                onClick={async () => {
                  await api.agents.delete(a.id);
                  load();
                }}
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
