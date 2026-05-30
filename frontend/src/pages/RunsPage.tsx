import { useEffect, useState } from "react";
import RunChat from "../components/RunChat";
import { api, Run, Workflow } from "../api";

export default function RunsPage() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [workflowId, setWorkflowId] = useState("");
  const [task, setTask] = useState("Summarize the benefits of multi-agent AI systems.");
  const [selected, setSelected] = useState<Run | null>(null);
  const [chatSeed, setChatSeed] = useState<string | null>(null);

  const load = () => api.runs.list().then(setRuns);

  useEffect(() => {
    load();
    api.workflows.list().then((w) => {
      setWorkflows(w);
      if (w[0]) setWorkflowId(w[0].id);
    });
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, []);

  const startRun = async () => {
    if (!workflowId) return;
    const run = await api.runs.create(workflowId, task);
    setChatSeed(task.trim());
    setSelected(run);
    load();
  };

  const executeSync = async (id: string) => {
    const run = await api.runs.execute(id);
    setSelected(run);
    load();
  };

  const deleteRun = async (r: Run) => {
    if (!confirm(`Delete run ${r.id.slice(0, 8)}?`)) return;
    await api.runs.delete(r.id);
    if (selected?.id === r.id) setSelected(null);
    load();
  };

  return (
    <div>
      <h2>Runs &amp; monitoring</h2>

      <div className="card">
        <label>Workflow</label>
        <select value={workflowId} onChange={(e) => setWorkflowId(e.target.value)}>
          {workflows.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
        <label>Task</label>
        <textarea rows={3} value={task} onChange={(e) => setTask(e.target.value)} />
        <button className="btn" onClick={startRun}>
          Queue run
        </button>
        {selected && selected.status === "pending" && (
          <button
            className="btn btn-secondary"
            style={{ marginLeft: "0.5rem" }}
            onClick={() => executeSync(selected.id)}
          >
            Execute now (sync)
          </button>
        )}
      </div>

      {selected && (
        <div className="card run-chat-card">
          <RunChat
            run={selected}
            seedUserText={chatSeed ?? undefined}
            onRunUpdate={(r) => {
              setSelected(r);
              if (r.status === "completed" && chatSeed) setChatSeed(null);
            }}
          />
        </div>
      )}

      <div className="grid-2">
        <div>
          {runs.map((r) => (
            <div key={r.id} className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div
                  style={{ cursor: "pointer", flex: 1 }}
                  onClick={() => api.runs.get(r.id).then(setSelected)}
                >
                  <span className={`badge ${r.status}`}>{r.status}</span>
                  <p style={{ fontSize: "0.85rem", margin: "0.5rem 0" }}>
                    {r.input_task?.slice(0, 80)}
                    {(r.input_task?.length ?? 0) > 80 ? "…" : ""}
                  </p>
                  <p style={{ color: "var(--muted)", fontSize: "0.75rem" }}>
                    tokens: {r.total_prompt_tokens + r.total_completion_tokens} · $
                    {Number(r.estimated_cost_usd).toFixed(4)}
                  </p>
                </div>
                <button
                  className="btn btn-danger"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteRun(r);
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>

        {selected && (
          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3>Run {selected.id.slice(0, 8)}</h3>
              <button className="btn btn-danger" onClick={() => deleteRun(selected)}>
                Delete
              </button>
            </div>
            <p>
              Status: <span className={`badge ${selected.status}`}>{selected.status}</span>
            </p>
            {selected.error_message && (
              <p style={{ color: "var(--danger)" }}>{selected.error_message}</p>
            )}
            <h4>Steps</h4>
            {selected.steps?.map((s) => (
              <div key={s.node_id} className="log-line">
                {s.node_id}: {s.status} — {s.output_preview?.slice(0, 100)}
              </div>
            ))}
            <h4>Events</h4>
            {selected.events?.map((e, i) => (
              <div key={i} className="log-line">
                [{e.event_type}] {JSON.stringify(e.payload).slice(0, 120)}
              </div>
            ))}
            <p style={{ marginTop: "1rem", color: "var(--muted)" }}>
              Prompt: {selected.total_prompt_tokens} · Completion:{" "}
              {selected.total_completion_tokens}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
