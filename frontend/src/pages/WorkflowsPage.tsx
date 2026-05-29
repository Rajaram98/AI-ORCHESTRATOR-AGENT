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

function buildLinearDefinition(
  steps: { id: string; label: string; agentId?: string }[]
): Workflow["definition"] {
  const nodes: Record<string, unknown>[] = steps.map((s, i) => ({
    id: s.id,
    type: "agent",
    label: s.label,
    agent_id: s.agentId || undefined,
    position: { x: 100 + i * 280, y: 120 },
    is_entry: i === 0,
  }));
  nodes.push({
    id: "end",
    type: "end",
    label: "End",
    position: { x: 100 + steps.length * 280, y: 120 },
  });
  const edges: Record<string, unknown>[] = [];
  for (let i = 0; i < steps.length; i++) {
    edges.push({
      source: steps[i].id,
      target: i === steps.length - 1 ? "end" : steps[i + 1].id,
    });
  }
  return { nodes, edges };
}

function defaultNewDefinition(agentCount = 2): Workflow["definition"] {
  const steps = Array.from({ length: agentCount }, (_, i) => ({
    id: `step_${i + 1}`,
    label: `Step ${i + 1}`,
  }));
  return buildLinearDefinition(steps);
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
  const [showFromAgents, setShowFromAgents] = useState(false);
  const [pickedAgentIds, setPickedAgentIds] = useState<string[]>([]);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  const load = async () => {
    const [w, t, a] = await Promise.all([
      api.workflows.list(),
      api.workflows.templates(),
      api.agents.list(),
    ]);
    setWorkflows(w);
    setTemplates(t);
    setAgents(a);
    return { workflows: w, agents: a };
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

  const startNewWorkflow = (
    definition: Workflow["definition"],
    workflowName: string,
    initialMap: Record<string, string> = {}
  ) => {
    setSelected(null);
    setName(workflowName);
    setAgentMap(initialMap);
    const { nodes: n, edges: e } = defToFlow(definition, agents, initialMap);
    setNodes(n);
    setEdges(e);
    setFocusedNodeId(null);
  };

  const newBlankWorkflow = () => {
    startNewWorkflow(defaultNewDefinition(2), "New workflow");
  };

  const newWorkflowFromAgents = () => {
    if (pickedAgentIds.length === 0) return;
    const steps = pickedAgentIds.map((id, i) => {
      const agent = agents.find((a) => a.id === id)!;
      return {
        id: `step_${i + 1}`,
        label: agent.name,
        agentId: id,
      };
    });
    const definition = buildLinearDefinition(steps);
    const map: Record<string, string> = {};
    steps.forEach((s) => {
      if (s.agentId) map[s.id] = s.agentId;
    });
    const wfName = steps.map((s) => s.label).join(" → ");
    startNewWorkflow(definition, wfName.slice(0, 80) || "New workflow", map);
    setShowFromAgents(false);
    setPickedAgentIds([]);
  };

  const addAgentStep = () => {
    const steps = nodes.filter((n) => n.type === "workflowStep");
    const endNode = nodes.find((n) => n.type === "workflowEnd");
    if (!endNode) return;
    const newId = `step_${Date.now()}`;
    const lastStep = steps[steps.length - 1];
    const newX = (lastStep?.position.x ?? 100) + (lastStep ? 280 : 0);
    const newNode: Node = {
      id: newId,
      type: "workflowStep",
      position: { x: newX, y: 120 },
      data: {
        label: `Step ${steps.length + 1}`,
        unassigned: true,
        isEntry: steps.length === 0,
      },
    };
    const shiftedEnd: Node = {
      ...endNode,
      position: { x: newX + 280, y: 120 },
    };
    setNodes((nds) =>
      nds.filter((n) => n.id !== endNode.id).concat(newNode, shiftedEnd)
    );
    setEdges((eds) => {
      const filtered = lastStep
        ? eds.filter((e) => !(e.source === lastStep.id && e.target === endNode.id))
        : eds.filter((e) => e.target !== endNode.id);
      const next = [...filtered];
      if (lastStep) {
        next.push({ id: `e-${lastStep.id}-${newId}`, source: lastStep.id, target: newId });
      }
      next.push({ id: `e-${newId}-end`, source: newId, target: endNode.id });
      return next;
    });
  };

  const removeAgentStep = (nodeId: string) => {
    const steps = nodes.filter((n) => n.type === "workflowStep");
    if (steps.length <= 1) return;
    const endNode = nodes.find((n) => n.type === "workflowEnd");
    if (!endNode) return;
    const idx = steps.findIndex((n) => n.id === nodeId);
    if (idx === -1) return;
    const prev = idx > 0 ? steps[idx - 1] : null;
    const next = idx < steps.length - 1 ? steps[idx + 1] : null;
    setNodes((nds) => {
      const filtered = nds.filter((n) => n.id !== nodeId);
      if (idx === 0) {
        const nextStep = filtered.find((n) => n.type === "workflowStep");
        if (nextStep) {
          return filtered.map((n) =>
            n.id === nextStep.id
              ? { ...n, data: { ...(n.data as object), isEntry: true } }
              : n
          );
        }
      }
      return filtered;
    });
    setAgentMap((prevMap) => {
      const nextMap = { ...prevMap };
      delete nextMap[nodeId];
      return nextMap;
    });
    setEdges((eds) => {
      let next = eds.filter((e) => e.source !== nodeId && e.target !== nodeId);
      if (prev && next) {
        next = [...next, { id: `e-${prev.id}-${next.id}`, source: prev.id, target: next.id }];
      } else if (prev) {
        next = [...next, { id: `e-${prev.id}-end`, source: prev.id, target: endNode.id }];
      } else if (next) {
        next = [...next, { id: `e-${next.id}-end`, source: next.id, target: endNode.id }];
      }
      return next;
    });
    if (focusedNodeId === nodeId) setFocusedNodeId(null);
  };

  const togglePickedAgent = (agentId: string) => {
    setPickedAgentIds((prev) =>
      prev.includes(agentId) ? prev.filter((id) => id !== agentId) : [...prev, agentId]
    );
  };

  const save = async () => {
    if (!name.trim()) return;
    const definition = flowToDef(nodes, edges, agentMap);
    if (selected) {
      await api.workflows.update(selected.id, { name, definition });
      load();
    } else {
      const wf = await api.workflows.create({ name, definition });
      await load();
      const freshAgents = await api.agents.list();
      setAgents(freshAgents);
      selectWorkflow(wf, freshAgents);
    }
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
          <div className="card workflow-actions">
            <h3 style={{ marginTop: 0 }}>Your workflows</h3>
            <div className="workflow-actions-buttons">
              <button type="button" className="btn" onClick={newBlankWorkflow}>
                New workflow
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowFromAgents((v) => !v)}
                disabled={agents.length === 0}
              >
                New from agents
              </button>
            </div>
            {agents.length === 0 && (
              <p className="workflow-actions-hint">
                Create agents on the Agents page first, then build a workflow here.
              </p>
            )}
          </div>

          {showFromAgents && (
            <div className="card workflow-from-agents">
              <h3 style={{ marginTop: 0 }}>Pick agents (in order)</h3>
              <p className="workflow-actions-hint">
                Selected agents run one after another, left to right.
              </p>
              <ul className="workflow-agent-pick-list">
                {agents.map((a) => (
                  <li key={a.id}>
                    <label className="workflow-agent-pick">
                      <input
                        type="checkbox"
                        checked={pickedAgentIds.includes(a.id)}
                        onChange={() => togglePickedAgent(a.id)}
                      />
                      <span>
                        <strong>{a.name}</strong>
                        {a.role && <span className="workflow-agent-pick-role"> · {a.role}</span>}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
              <div className="workflow-actions-buttons">
                <button
                  type="button"
                  className="btn"
                  onClick={newWorkflowFromAgents}
                  disabled={pickedAgentIds.length === 0}
                >
                  Create workflow
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setShowFromAgents(false);
                    setPickedAgentIds([]);
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {workflows.length === 0 && !selected && nodes.length === 0 && (
            <p className="card messages-empty">
              No workflows yet. Click <strong>New workflow</strong> or use a template.
            </p>
          )}

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
          <div className="workflow-editor-header">
            <div>
              <label>Workflow name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="My workflow" />
            </div>
            {!selected && nodes.length > 0 && (
              <span className="badge workflow-editor-badge">Unsaved draft</span>
            )}
          </div>

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

              <div className="workflow-actions-buttons" style={{ marginBottom: "0.75rem" }}>
                <button type="button" className="btn btn-secondary" onClick={addAgentStep}>
                  Add step
                </button>
              </div>

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
                      {agentSteps.length > 1 && (
                        <button
                          type="button"
                          className="btn btn-danger workflow-assign-remove"
                          onClick={() => removeAgentStep(n.id)}
                          aria-label={`Remove ${data.label}`}
                        >
                          Remove
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </>
          ) : (
            <p className="workflow-assign-empty">
              Click <strong>New workflow</strong>, <strong>New from agents</strong>, or use a template
              to start. Then assign your agents to each step and save.
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
          <button
            className="btn"
            onClick={save}
            style={{ marginTop: "1rem" }}
            disabled={!name.trim() || agentSteps.length === 0 || !allAssigned}
          >
            {selected ? "Save workflow" : "Create workflow"}
          </button>
          {!allAssigned && agentSteps.length > 0 && (
            <p className="workflow-actions-hint" style={{ marginTop: "0.5rem" }}>
              Assign an agent to every step before saving.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
