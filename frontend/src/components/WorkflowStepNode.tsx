import { Handle, Position, type NodeProps } from "@xyflow/react";

export type WorkflowStepData = {
  label: string;
  agentName?: string;
  unassigned?: boolean;
  isEntry?: boolean;
};

export function WorkflowStepNode({ data }: NodeProps) {
  const d = data as WorkflowStepData;
  const assigned = Boolean(d.agentName);

  return (
    <div
      className={`workflow-step-node ${assigned ? "workflow-step-node--assigned" : "workflow-step-node--unassigned"}`}
    >
      <Handle type="target" position={Position.Left} />
      {d.isEntry && <span className="workflow-step-entry">Start</span>}
      <div className="workflow-step-label">{d.label}</div>
      <div className="workflow-step-agent">
        {assigned ? (
          <>
            <span className="workflow-step-agent-label">Agent</span>
            <span className="workflow-step-agent-name">{d.agentName}</span>
          </>
        ) : (
          <span className="workflow-step-missing">No agent assigned</span>
        )}
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

export function WorkflowEndNode({ data }: NodeProps) {
  const d = data as { label?: string };
  return (
    <div className="workflow-end-node">
      <Handle type="target" position={Position.Left} />
      <span>{d.label || "End"}</span>
    </div>
  );
}
