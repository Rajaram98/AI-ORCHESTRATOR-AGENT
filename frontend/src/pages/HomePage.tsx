import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";

const features = [
  {
    iconClass: "home-feature-icon--agents",
    title: "Define agents",
    description: "Configure roles, prompts, tools, and Telegram channels for each agent.",
    link: "/agents",
  },
  {
    iconClass: "home-feature-icon--workflows",
    title: "Build workflows",
    description: "Compose multi-step LangGraph pipelines and assign agents on a visual canvas.",
    link: "/workflows",
  },
  {
    iconClass: "home-feature-icon--runs",
    title: "Execute & monitor",
    description: "Run tasks, stream agent output in real time, and track token usage and cost.",
    link: "/runs",
  },
  {
    iconClass: "home-feature-icon--telegram",
    title: "Chat anywhere",
    description: "Bind Telegram chats and converse with your orchestrated agents from mobile.",
    link: "/messages",
  },
];

export default function HomePage() {
  const [stats, setStats] = useState({ agents: 0, workflows: 0, runs: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.agents.list(), api.workflows.list(), api.runs.list()])
      .then(([agents, workflows, runs]) => {
        setStats({
          agents: agents.length,
          workflows: workflows.length,
          runs: runs.length,
        });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="home-page">
      <section className="home-hero">
        <div className="home-hero-content">
          <span className="home-hero-badge">LangGraph · OpenAI · Telegram</span>
          <h2>Orchestrate intelligent agents at scale</h2>
          <p>
            Design multi-agent workflows, assign specialists to each step, and monitor every run
            from a single control plane.
          </p>
          <div className="home-hero-actions">
            <Link to="/workflows" className="btn">
              Open workflows
            </Link>
            <Link to="/agents" className="btn btn-secondary">
              Manage agents
            </Link>
          </div>
        </div>
      </section>

      <div className="home-stats">
        <div className="home-stat">
          <span className="home-stat-value">{loading ? "—" : stats.agents}</span>
          <span className="home-stat-label">Agents configured</span>
        </div>
        <div className="home-stat">
          <span className="home-stat-value">{loading ? "—" : stats.workflows}</span>
          <span className="home-stat-label">Workflows created</span>
        </div>
        <div className="home-stat">
          <span className="home-stat-value">{loading ? "—" : stats.runs}</span>
          <span className="home-stat-label">Runs executed</span>
        </div>
      </div>

      <div className="home-features">
        {features.map(({ iconClass, title, description, link }) => (
          <Link key={link} to={link} className="home-feature" style={{ textDecoration: "none", color: "inherit" }}>
            <div className={`home-feature-icon ${iconClass}`}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </div>
            <h3>{title}</h3>
            <p>{description}</p>
          </Link>
        ))}
      </div>

      <div className="card home-quickstart">
        <h3>Quick start</h3>
        <ol>
          <li>
            Set <code>OPENAI_API_KEY</code> in <code>.env</code>
          </li>
          <li>
            Run <code>make up</code> to start the stack
          </li>
          <li>
            Open <Link to="/agents">Agents</Link> — seed data creates 5 demo agents
          </li>
          <li>
            Go to <Link to="/workflows">Workflows</Link> — instantiate a template and assign agents
          </li>
          <li>
            Use <Link to="/runs">Runs</Link> to execute a workflow with a task description
          </li>
          <li>Bind Telegram chat_id from the /start command in the Channels tab</li>
        </ol>
      </div>
    </div>
  );
}
