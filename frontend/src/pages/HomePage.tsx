export default function HomePage() {
  return (
    <div>
      <h2>AI Agent Orchestration Platform</h2>
      <p style={{ color: "var(--muted)", maxWidth: 640 }}>
        Create agents, build multi-agent workflows with LangGraph, monitor runs in real time, and
        chat via Telegram.
      </p>
      <div className="card">
        <h3>Quick start</h3>
        <ol>
          <li>
            Set <code>OPENAI_API_KEY</code> in <code>.env</code>
          </li>
          <li>
            Run <code>make up</code>
          </li>
          <li>Open Agents — seed data creates 5 demo agents</li>
          <li>Workflows — instantiate a template and assign agents on the canvas</li>
          <li>Runs — execute a workflow with a task description</li>
          <li>Telegram — bind chat_id from /start command in Channels tab</li>
        </ol>
      </div>
    </div>
  );
}
