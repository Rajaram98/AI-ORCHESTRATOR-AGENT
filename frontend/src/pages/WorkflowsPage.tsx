import { useCallback, useEffect, useMemo, useState } from "react";
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
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { api, Agent, Workflow, WorkflowTemplate } from "../api";
import { WorkflowEndNode, WorkflowStepNode } from "../components/WorkflowStepNode";

const nodeTypes: NodeTypes = {
  workflowStep: WorkflowStepNode,
  workflowEnd: WorkflowEndNode,
};

type DefNode = {
  id: string;
  label?: string;
  agent_id?: string;
  is_entry?: boolean;
  position?: { x: number; y: number };
};

function formatNodeId(id: string): string {
  return id.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function nodeLabel(n: DefNode): string {
  return n.label || formatNodeId(n.id);
}

function agentById(agents: Agent[], id?: string): Agent | undefined {
  if (!id) return undefined;
  return agents.find((a) => a.id === id);
}

function stepData(
  n: DefNode,
  agents: Agent[],
  agentMap: Record<string, string>
): { label: string; agentName?: string; unassigned: boolean; isEntry?: boolean } {
  const agentId = agentMap[n.id] ?? n.agent_id;
  const agent = agentById(agents, agentId);
  return {
    label: nodeLabel(n),
    agentName: agent?.name,
    unassigned: !agentId,
    isEntry: n.is_entry,
  };
}

function defToFlow(
  definition: Workflow["definition"],
  agents: Agent[],
  agentMap: Record<string, string>
) {
  const nodes: Node[] = (definition.nodes || []).map((raw) => {
    const n = raw as DefNode;
    const isEnd = n.id === "end" || (raw as { type?: string }).type === "end";
    if (isEnd) {
      return {
        id: n.id,
        type: "workflowEnd",
        position: n.position || { x: 0, y: 0 },
        data: { label: n.label || "End" },
      };
    }
    return {
      id: n.id,
      type: "workflowStep",
      position: n.position || { x: 0, y: 0 },
      data: stepData(n, agents, agentMap),
    };
  });
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
    nodes: nodes.map((n, i) => {
      const data = n.data as { label?: string; isEntry?: boolean };
      const isEnd = n.type === "workflowEnd" || n.id === "end";
      return {
        id: n.id,
        type: isEnd ? "end" : "agent",
        label: data?.label || formatNodeId(n.id),
        position: n.position,
        is_entry: isEnd ? undefined : data?.isEntry ?? i === 0,
        agent_id: isEnd ? undefined : agentMap[n.id] || undefined,
      };
    }),
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
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
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

  const agentSteps = useMemo(
    () => nodes.filter((n) => n.type === "workflowStep"),
    [nodes]
  );

  const assignedCount = useMemo(
    () => agentSteps.filter((n) => Boolean(agentMap[n.id])).length,
    [agentSteps, agentMap]
  );

  const allAssigned = agentSteps.length > 0 && assignedCount === agentSteps.length;

  const selectWorkflow = useCallback(
    (wf: Workflow, currentAgents: Agent[]) => {
      setSelected(wf);
      setName(wf.name);
      const map: Record<string, string> = {};
      for (const node of wf.definition.nodes || []) {
        const nd = node as DefNode;
        if (nd.agent_id) map[nd.id] = nd.agent_id;
      }
      setAgentMap(map);
      const { nodes: n, edges: e } = defToFlow(wf.definition, currentAgents, map);
      setNodes(n);
      setEdges(e);
      setFocusedNodeId(null);
    },
    [setNodes, setEdges]
  );

  useEffect(() => {
    setNodes((nds) =>
      nds.map((n) => {
        if (n.type !== "workflowStep") return n;
        const data = n.data as { label: string; isEntry?: boolean };
        const agentId = agentMap[n.id];
        const agent = agentById(agents, agentId);
        return {
          ...n,
          data: {
            ...data,
            agentName: agent?.name,
            unassigned: !agentId,
          },
        };
      })
    );
  }, [agentMap, agents, setNodes]);

  const setAgentForNode = (nodeId: string, agentId: string) => {
    setAgentMap((prev) => {
      const next = { ...prev };
      if (agentId) next[nodeId] = agentId;
      else delete next[nodeId];
      return next;
    });
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
    selectWorkflow(wf, agents);
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
      setFocusedNodeId(null);
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
                <strong style={{ cursor: "pointer" }} onClick={() => selectWorkflow(wf, agents)}>
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

          {agentSteps.length > 0 ? (
            <>
              <div className="workflow-assign-header">
                <div>
                  <h3 className="workflow-assign-title">Agent assignments</h3>
                  <p className="workflow-assign-hint">
                    Each step runs one agent. Pick who handles research, writing, review, and so on.
                    The diagram updates as you assign.
                  </p>
                </div>
                <span
                  className={`badge ${allAssigned ? "workflow-assign-badge--ok" : "workflow-assign-badge--warn"}`}
                >
                  {assignedCount} / {agentSteps.length} assigned
                </span>
              </div>

              {!allAssigned && (
                <p className="workflow-assign-warning">
                  Unassigned steps will not run correctly when you execute this workflow.
                </p>
              )}

              <ul className="workflow-assign-list">
                {agentSteps.map((n) => {
                  const data = n.data as { label: string; isEntry?: boolean };
                  const agentId = agentMap[n.id] || "";
                  const assigned = Boolean(agentId);
                  const isFocused = focusedNodeId === n.id;

                  return (
                    <li
                      key={n.id}
                      id={`assign-${n.id}`}
                      className={`workflow-assign-row ${assigned ? "workflow-assign-row--ok" : "workflow-assign-row--missing"} ${isFocused ? "workflow-assign-row--focused" : ""}`}
                    >
                      <div className="workflow-assign-row-main">
                        <div className="workflow-assign-step">
                          <span className="workflow-assign-step-name">{data.label}</span>
                          {data.isEntry && <span className="workflow-step-entry">Start</span>}
                        </div>
                        <span className="workflow-assign-step-id">{n.id}</span>
                      </div>
                      <select
                        className="workflow-assign-select"
                        value={agentId}
                        onChange={(e) => setAgentForNode(n.id, e.target.value)}
                        aria-label={`Agent for ${data.label}`}
                      >
                        <option value="">Choose an agent…</option>
                        {agents.length === 0 ? (
                          <option disabled value="">
                            No agents yet — create one on the Agents page
                          </option>
                        ) : (
                          agents.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.name}
                              {a.role ? ` · ${a.role}` : ""}
                            </option>
                          ))
                        )}
                      </select>
                      <span
                        className={`workflow-assign-status ${assigned ? "workflow-assign-status--ok" : "workflow-assign-status--missing"}`}
                        aria-hidden
                      >
                        {assigned ? "Assigned" : "Required"}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : (
            <p className="workflow-assign-empty">
              Select a workflow or use a template to configure agent assignments.
            </p>
          )}

          <div className="flow-container">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodeClick={(_, node) => {
                if (node.type === "workflowStep") {
                  setFocusedNodeId(node.id);
                  document.getElementById(`assign-${node.id}`)?.scrollIntoView({
                    behavior: "smooth",
                    block: "nearest",
                  });
                }
              }}
              fitView
            >
              <Background />
              <Controls />
              <MiniMap />
            </ReactFlow>
          </div>
          <button className="btn" onClick={save} style={{ marginTop: "1rem" }} disabled={!name.trim()}>
            Save workflow
          </button>
        </div>
      </div>
    </div>
  );
}
