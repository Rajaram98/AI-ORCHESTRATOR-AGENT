import { NavLink, Route, Routes } from "react-router-dom";
import AgentsPage from "./pages/AgentsPage";
import WorkflowsPage from "./pages/WorkflowsPage";
import RunsPage from "./pages/RunsPage";
import MessagesPage from "./pages/MessagesPage";
import HomePage from "./pages/HomePage";

export default function App() {
  return (
    <div className="layout">
      <aside className="sidebar">
        <h1>AI Orchestrator</h1>
        <nav>
          <NavLink to="/" end className={({ isActive }) => (isActive ? "active" : "")}>
            Home
          </NavLink>
          <NavLink to="/agents" className={({ isActive }) => (isActive ? "active" : "")}>
            Agents
          </NavLink>
          <NavLink to="/workflows" className={({ isActive }) => (isActive ? "active" : "")}>
            Workflows
          </NavLink>
          <NavLink to="/runs" className={({ isActive }) => (isActive ? "active" : "")}>
            Runs
          </NavLink>
          <NavLink to="/messages" className={({ isActive }) => (isActive ? "active" : "")}>
            Messages
          </NavLink>
        </nav>
      </aside>
      <main className="main">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/agents" element={<AgentsPage />} />
          <Route path="/workflows" element={<WorkflowsPage />} />
          <Route path="/runs" element={<RunsPage />} />
          <Route path="/messages" element={<MessagesPage />} />
        </Routes>
      </main>
    </div>
  );
}
