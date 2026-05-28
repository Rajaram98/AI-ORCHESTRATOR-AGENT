const API = import.meta.env.VITE_API_URL || "";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export interface Agent {
  id: string;
  name: string;
  role: string;
  system_prompt: string;
  model: string;
  tools: string[];
  channels: { type: string; chat_id?: string }[];
  config: Record<string, unknown>;
}

export interface Workflow {
  id: string;
  name: string;
  description?: string;
  definition: { nodes: unknown[]; edges: unknown[] };
}

export interface WorkflowTemplate {
  id: string;
  slug: string;
  name: string;
  description: string;
  definition: { nodes: unknown[]; edges: unknown[] };
  is_builtin: boolean;
}

export interface Run {
  id: string;
  workflow_id: string;
  status: string;
  input_task: string;
  total_prompt_tokens: number;
  total_completion_tokens: number;
  estimated_cost_usd: number;
  error_message?: string;
  steps: { node_id: string; status: string; output_preview?: string }[];
  events: { event_type: string; payload: Record<string, unknown>; created_at: string }[];
}

export interface Message {
  id: string;
  content: string;
  sender_type: string;
  sender_id?: string;
  channel: string;
  thread_id: string;
  created_at: string;
  metadata?: {
    user_text?: string;
    node_id?: string;
    agent_name?: string;
    workflow_id?: string;
    kind?: string;
    turn?: number;
    sequence?: number;
  };
  run_id?: string;
}

export const api = {
  agents: {
    list: () => request<Agent[]>("/api/agents"),
    get: (id: string) => request<Agent>(`/api/agents/${id}`),
    create: (body: Partial<Agent>) =>
      request<Agent>("/api/agents", { method: "POST", body: JSON.stringify(body) }),
    update: (id: string, body: Partial<Agent>) =>
      request<Agent>(`/api/agents/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    delete: (id: string) => request<void>(`/api/agents/${id}`, { method: "DELETE" }),
    tools: () => request<{ name: string; description: string }[]>("/api/agents/tools/list"),
  },
  workflows: {
    list: () => request<Workflow[]>("/api/workflows"),
    get: (id: string) => request<Workflow>(`/api/workflows/${id}`),
    create: (body: { name: string; definition: Workflow["definition"] }) =>
      request<Workflow>("/api/workflows", { method: "POST", body: JSON.stringify(body) }),
    update: (id: string, body: { name: string; definition: Workflow["definition"] }) =>
      request<Workflow>(`/api/workflows/${id}`, { method: "PUT", body: JSON.stringify(body) }),
    templates: () => request<WorkflowTemplate[]>("/api/workflows/templates"),
    fromTemplate: (slug: string) =>
      request<Workflow>(`/api/workflows/from-template/${slug}`, { method: "POST" }),
    deleteTemplate: (slug: string) =>
      request<void>(`/api/workflows/templates/${slug}`, { method: "DELETE" }),
    delete: (id: string) => request<void>(`/api/workflows/${id}`, { method: "DELETE" }),
  },
  runs: {
    list: () => request<Run[]>("/api/runs"),
    get: (id: string) => request<Run>(`/api/runs/${id}`),
    messages: (id: string) => request<Message[]>(`/api/runs/${id}/messages`),
    create: (workflow_id: string, input_task: string) =>
      request<Run>("/api/runs", {
        method: "POST",
        body: JSON.stringify({ workflow_id, input_task }),
      }),
    execute: (id: string) => request<Run>(`/api/runs/${id}/execute`, { method: "POST" }),
    delete: (id: string) => request<void>(`/api/runs/${id}`, { method: "DELETE" }),
    chat: (id: string, content: string) =>
      request<Message>(`/api/runs/${id}/chat`, {
        method: "POST",
        body: JSON.stringify({ content }),
      }),
  },
  messages: {
    list: (params?: {
      run_id?: string;
      channel?: string;
      thread_id?: string;
      order?: "asc" | "desc";
      limit?: number;
    }) => {
      const q = new URLSearchParams(
        Object.entries(params ?? {})
          .filter(([, v]) => v != null && v !== "")
          .map(([k, v]) => [k, String(v)])
      ).toString();
      return request<Message[]>(`/api/messages${q ? `?${q}` : ""}`);
    },
    delete: (id: string) => request<void>(`/api/messages/${id}`, { method: "DELETE" }),
  },
  telegram: {
    bind: (agent_id: string, chat_id: string) =>
      request<{ ok: boolean }>("/api/telegram/bind", {
        method: "POST",
        body: JSON.stringify({ agent_id, chat_id }),
      }),
    bindings: () =>
      request<{ agent_id: string; agent_name: string; chat_id: string }[]>("/api/telegram/bindings"),
  },
};
