import { useCallback, useEffect, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  Connection,
  Node,
  Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { api, Agent, Workflow, WorkflowTemplate } from "../api";

function defToFlow(definition: Workflow["definition"], agents: Agent[]) {
  const nodes: Node[] = (definition.nodes || []).map((n: Record<string, unknown>) => ({
    id: n.id as string,
    type: "default",
    position: (n.position as { x: number; y: number }) || { x: 0, y: 0 },
    data: {
      label: `${n.label || n.id}${n.agent_id ? ` (${agents.find((a) => a.id === n.agent_id)?.name || "agent"})` : ""}`,
    },
  }));
  const edges: Edge[] = (definition.edges || []).map((e: Record<string, unknown>, i: number) => ({
    id: `e${i}`,
    source: e.source as string,
    target: e.target as string,
    label: e.label as string | undefined,
  }));
  return { nodes, edges };
}

function flowToDef(nodes: Node[], edges: Edge[], agentMap: Record<string, string>) {
  return {
    nodes: nodes.map((n, i) => ({
      id: n.id,
      type: n.id === "end" ? "end" : "agent",
      label: String(n.data?.label || n.id).split(" (")[0],
      position: n.position,
      is_entry: i === 0,
      agent_id: agentMap[n.id] || undefined,
    })),
    edges: edges.map((e) => ({
      source: e.source,
      target: e.target,
      condition: !!e.label,
      label: e.label,
    })),
  };
}

export default function WorkflowsPage() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selected, setSelected] = useState<Workflow | null>(null);
  const [name, setName] = useState("");
  const [agentMap, setAgentMap] = useState<Record<string, string>>({});
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  const load = () => {
    api.workflows.list().then(setWorkflows);
    api.workflows.templates().then(setTemplates);
    api.agents.list().then(setAgents);
  };

  useEffect(() => {
    load();
  }, []);

  const selectWorkflow = (wf: Workflow) => {
    setSelected(wf);
    setName(wf.name);
    const { nodes: n, edges: e } = defToFlow(wf.definition, agents);
    setNodes(n);
    setEdges(e);
    const map: Record<string, string> = {};
    for (const node of wf.definition.nodes || []) {
      const nd = node as { id: string; agent_id?: string };
      if (nd.agent_id) map[nd.id] = nd.agent_id;
    }
    setAgentMap(map);
  };

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  const save = async () => {
    const definition = flowToDef(nodes, edges, agentMap);
    if (selected) {
      await api.workflows.update(selected.id, { name, definition });
    } else {
      await api.workflows.create({ name, definition });
    }
    load();
  };

  const fromTemplate = async (slug: string) => {
    const wf = await api.workflows.fromTemplate(slug);
    load();
    selectWorkflow(wf);
  };

  const deleteTemplate = async (t: WorkflowTemplate) => {
    const msg = t.is_builtin
      ? `Delete built-in template "${t.name}"? Re-run seed to restore defaults.`
      : `Delete template "${t.name}"?`;
    if (!confirm(msg)) return;
    await api.workflows.deleteTemplate(t.slug);
    load();
  };

  const deleteWorkflow = async (wf: Workflow) => {
    if (!confirm(`Delete workflow "${wf.name}"?`)) return;
    await api.workflows.delete(wf.id);
    if (selected?.id === wf.id) {
      setSelected(null);
      setName("");
      setNodes([]);
      setEdges([]);
      setAgentMap({});
    }
    load();
  };

  return (
    <div>
      <h2>Workflows</h2>

      <div className="card">
        <h3>Templates</h3>
        {templates.length === 0 ? (
          <p style={{ color: "var(--muted)" }}>No templates. Run seed to restore defaults.</p>
        ) : (
          templates.map((t) => (
            <div
              key={t.slug}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "0.5rem",
                marginBottom: "0.5rem",
              }}
            >
              <div>
                <strong>{t.name}</strong>
                {t.is_builtin && (
                  <span style={{ color: "var(--muted)", fontSize: "0.75rem", marginLeft: "0.5rem" }}>
                    built-in
                  </span>
                )}
                <p style={{ color: "var(--muted)", fontSize: "0.85rem", margin: "0.25rem 0 0" }}>
                  {t.description}
                </p>
              </div>
              <div style={{ display: "flex", gap: "0.5rem", flexShrink: 0 }}>
                <button className="btn btn-secondary" onClick={() => fromTemplate(t.slug)}>
                  Use
                </button>
                <button className="btn btn-danger" onClick={() => deleteTemplate(t)}>
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="grid-2">
        <div>
          {workflows.map((wf) => (
            <div
              key={wf.id}
              className="card"
              style={{ borderColor: selected?.id === wf.id ? "var(--accent)" : undefined }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <strong style={{ cursor: "pointer" }} onClick={() => selectWorkflow(wf)}>
                  {wf.name}
                </strong>
                <button
                  className="btn btn-danger"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteWorkflow(wf);
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="card">
          <label>Workflow name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} />
          <label>Assign agents to nodes (node id → agent)</label>
          {nodes
            .filter((n) => n.id !== "end")
            .map((n) => (
              <div key={n.id} style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                <span style={{ width: 100 }}>{n.id}</span>
                <select
                  value={agentMap[n.id] || ""}
                  onChange={(e) => setAgentMap({ ...agentMap, [n.id]: e.target.value })}
                >
                  <option value="">— select —</option>
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          <div className="flow-container">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              fitView
            >
              <Background />
              <Controls />
              <MiniMap />
            </ReactFlow>
          </div>
          <button className="btn" onClick={save} style={{ marginTop: "1rem" }}>
            Save workflow
          </button>
        </div>
      </div>
    </div>
  );
}
