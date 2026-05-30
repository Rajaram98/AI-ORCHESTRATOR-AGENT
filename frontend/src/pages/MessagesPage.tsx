import { useEffect, useMemo, useState } from "react";
import { api, Message, Run } from "../api";
import { groupMessagesIntoTurns } from "../utils/chatTurns";

function isWorkflowRunKey(key: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key);
}

function expandTelegramTurns(messages: Message[]) {
  const withVirtualHumans: Message[] = [];
  for (const m of messages) {
    if (m.sender_type === "agent" && m.metadata?.user_text) {
      const hasHuman = messages.some(
        (h) =>
          h.sender_type === "human" &&
          h.content === m.metadata!.user_text &&
          h.thread_id === m.thread_id
      );
      if (!hasHuman) {
        withVirtualHumans.push({
          id: `tg-user-${m.id}`,
          content: m.metadata.user_text,
          sender_type: "human",
          channel: m.channel,
          thread_id: m.thread_id,
          created_at: new Date(new Date(m.created_at).getTime() - 1).toISOString(),
          metadata: { source: "telegram" },
        });
      }
    }
    withVirtualHumans.push(m);
  }
  return withVirtualHumans.sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
}

export default function MessagesPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [channel, setChannel] = useState("");
  const [runFilter, setRunFilter] = useState("");

  const load = () => {
    api.messages
      .list({
        channel: channel || undefined,
        run_id: runFilter || undefined,
        order: "asc",
        limit: 500,
      })
      .then(setMessages);
    api.runs.list().then(setRuns);
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [channel, runFilter]);

  const deleteMessage = async (m: Message) => {
    if (m.id.startsWith("tg-user-")) return;
    if (!confirm("Delete this message?")) return;
    await api.messages.delete(m.id);
    load();
  };

  const { workflowGroups, telegramGroups, otherMessages } = useMemo(() => {
    const workflow = new Map<string, Message[]>();
    const telegram = new Map<string, Message[]>();
    const other: Message[] = [];

    for (const m of messages) {
      if (m.metadata?.kind === "workflow_final") continue;

      if (m.channel === "telegram" || m.thread_id.startsWith("telegram:")) {
        const key = m.thread_id;
        if (!telegram.has(key)) telegram.set(key, []);
        telegram.get(key)!.push(m);
        continue;
      }

      if (m.sender_type === "human" || m.sender_type === "agent") {
        const key = m.run_id || m.thread_id;
        if (!key || !isWorkflowRunKey(key)) {
          other.push(m);
          continue;
        }
        if (!workflow.has(key)) workflow.set(key, []);
        workflow.get(key)!.push(m);
        continue;
      }

      other.push(m);
    }

    return { workflowGroups: workflow, telegramGroups: telegram, otherMessages: other };
  }, [messages]);

  const renderAgentOutput = (m: Message) => (
    <div key={m.id} className="messages-agent-output">
      <div className="messages-agent-output-header">
        <strong>{m.sender_id || m.metadata?.agent_name || "Agent"}</strong>
        {m.metadata?.node_id && <span className="messages-agent-node">{m.metadata.node_id}</span>}
        <button className="btn btn-danger" type="button" onClick={() => deleteMessage(m)}>
          Delete
        </button>
      </div>
      <p className="messages-agent-content">{m.content}</p>
      <p className="messages-agent-meta">{new Date(m.created_at).toLocaleString()}</p>
    </div>
  );

  const renderTelegramCard = (m: Message) => (
    <div key={m.id} className="card">
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem" }}>
        <span>
          <strong>{m.sender_type === "human" ? "You" : m.sender_id || "Agent"}</strong>
        </span>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <span className="badge">telegram</span>
          {!m.id.startsWith("tg-user-") && (
            <button className="btn btn-danger" onClick={() => deleteMessage(m)}>
              Delete
            </button>
          )}
        </div>
      </div>
      <p style={{ marginTop: "0.5rem", whiteSpace: "pre-wrap" }}>{m.content}</p>
      <p style={{ color: "var(--muted)", fontSize: "0.75rem" }}>
        {m.thread_id} · {new Date(m.created_at).toLocaleString()}
      </p>
    </div>
  );

  return (
    <div>
      <h2>Message history</h2>
      <div className="card">
        <label>Filter by channel</label>
        <select value={channel} onChange={(e) => setChannel(e.target.value)}>
          <option value="">All channels</option>
          <option value="run">Workflow runs</option>
          <option value="internal">internal</option>
          <option value="telegram">telegram</option>
        </select>
        <label>Filter by workflow run</label>
        <select value={runFilter} onChange={(e) => setRunFilter(e.target.value)}>
          <option value="">All runs</option>
          {runs.map((r) => (
            <option key={r.id} value={r.id}>
              {r.id.slice(0, 8)} — {r.input_task?.slice(0, 40) || "(no task)"}
            </option>
          ))}
        </select>
      </div>

      <h3>Workflow agent outputs</h3>
      <p className="messages-section-hint">
        Each agent step in a workflow run is stored as its own message.
      </p>

      {workflowGroups.size === 0 && channel !== "telegram" && (
        <p className="card messages-empty">No workflow messages yet. Queue a run on the Runs page.</p>
      )}

      {Array.from(workflowGroups.entries()).map(([key, runMessages]) => {
        const runMeta = runs.find((r) => r.id === key);
        const turns = groupMessagesIntoTurns(runMessages);

        return (
          <div key={key} className="card messages-run-group">
            <h4>
              Run {key.slice(0, 8)}
              {runMeta?.input_task && (
                <span className="messages-run-task"> — {runMeta.input_task.slice(0, 60)}</span>
              )}
            </h4>
            {turns.map((turn) => (
              <div key={`${key}-turn-${turn.turn}`} className="messages-turn">
                {turn.user && (
                  <p className="messages-turn-question">
                    <strong>Question:</strong> {turn.user.content}
                  </p>
                )}
                <div className="messages-turn-agents">
                  {turn.agents.length === 0 ? (
                    <p className="messages-empty">No agent responses for this turn yet.</p>
                  ) : (
                    turn.agents.map(renderAgentOutput)
                  )}
                </div>
              </div>
            ))}
          </div>
        );
      })}

      <h3 style={{ marginTop: "2rem" }}>Telegram</h3>
      <p className="messages-section-hint">
        Messages you send to bound agents via Telegram appear here with the agent reply.
      </p>

      {telegramGroups.size === 0 && (
        <p className="card messages-empty">
          No Telegram messages yet. Bind an agent and message your bot.
        </p>
      )}

      {Array.from(telegramGroups.entries()).map(([threadId, threadMessages]) => {
        const expanded = expandTelegramTurns(threadMessages);
        const turns = groupMessagesIntoTurns(expanded);
        const chatId = threadId.replace(/^telegram:/, "");

        return (
          <div key={threadId} className="card messages-run-group">
            <h4>
              Telegram chat <span className="messages-run-task">{chatId}</span>
            </h4>
            {turns.map((turn) => (
              <div key={`${threadId}-turn-${turn.turn}`} className="messages-turn">
                {turn.user && (
                  <p className="messages-turn-question">
                    <strong>You:</strong> {turn.user.content}
                  </p>
                )}
                {turn.agents.map((m) => (
                  <div key={m.id} className="messages-agent-output">
                    <div className="messages-agent-output-header">
                      <strong>{m.sender_id || "Agent"}</strong>
                      <button className="btn btn-danger" type="button" onClick={() => deleteMessage(m)}>
                        Delete
                      </button>
                    </div>
                    <p className="messages-agent-content">{m.content}</p>
                    <p className="messages-agent-meta">{new Date(m.created_at).toLocaleString()}</p>
                  </div>
                ))}
              </div>
            ))}
            {turns.length === 0 &&
              threadMessages.map((m) => (
                <div key={m.id}>
                  {m.metadata?.user_text && (
                    <p className="messages-turn-question">
                      <strong>You:</strong> {m.metadata.user_text}
                    </p>
                  )}
                  {renderTelegramCard(m)}
                </div>
              ))}
          </div>
        );
      })}

      {otherMessages.length > 0 && (
        <>
          <h3 style={{ marginTop: "2rem" }}>Other messages</h3>
          {otherMessages.map(renderTelegramCard)}
        </>
      )}
    </div>
  );
}
