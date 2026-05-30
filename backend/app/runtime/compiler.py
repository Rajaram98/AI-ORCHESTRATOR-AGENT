"""Compile workflow JSON definitions into LangGraph StateGraph."""

from collections.abc import Callable
from typing import Annotated, Any, TypedDict
from uuid import UUID

from langgraph.graph import END, StateGraph
from langgraph.graph.message import add_messages
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI
from langgraph.prebuilt import create_react_agent

from app.config import settings
from app.models.agent import Agent
from app.runtime.tools import get_tools_for_agent


class WorkflowState(TypedDict):
    messages: Annotated[list[BaseMessage], add_messages]
    task: str
    shared_context: str
    last_agent_output: str
    iteration_count: int
    current_node: str


AgentOutputCallback = Callable[[str, str, str], None]


def _build_agent_node(
    agent: Agent,
    node_id: str,
    on_agent_output: AgentOutputCallback | None = None,
):
    def node(state: WorkflowState) -> dict:
        llm = ChatOpenAI(
            model=agent.model or settings.default_model,
            api_key=settings.openai_api_key or None,
        )
        tools = get_tools_for_agent(agent.tools or [])
        guardrails = (agent.config or {}).get("guardrails", {})
        max_output = guardrails.get("max_output_chars", 8000)

        system = agent.system_prompt
        if state.get("shared_context"):
            system += f"\n\nContext from previous agents:\n{state['shared_context']}"
        if state.get("task"):
            system += f"\n\nUser task:\n{state['task']}"

        agent_executor = create_react_agent(llm, tools)

        input_messages = [SystemMessage(content=system)]
        for m in state.get("messages", [])[-10:]:
            input_messages.append(m)
        if not any(isinstance(m, HumanMessage) for m in input_messages[1:]):
            input_messages.append(
                HumanMessage(content=state.get("task") or "Complete your part of the workflow.")
            )

        result = agent_executor.invoke({"messages": input_messages})
        out_messages = result.get("messages", [])
        last = out_messages[-1] if out_messages else AIMessage(content="(no output)")
        content = last.content if hasattr(last, "content") else str(last)
        if isinstance(content, list):
            content = " ".join(
                block.get("text", str(block)) if isinstance(block, dict) else str(block)
                for block in content
            )
        else:
            content = str(content)
        if len(content) > max_output:
            content = content[:max_output] + "..."

        if on_agent_output:
            on_agent_output(node_id, agent.name, content)

        new_shared = (state.get("shared_context") or "") + f"\n\n[{agent.name}]: {content}"

        return {
            "messages": [AIMessage(content=content, name=agent.name)],
            "shared_context": new_shared.strip(),
            "last_agent_output": content,
            "current_node": node_id,
            "iteration_count": state.get("iteration_count", 0) + 1,
        }

    return node


def _condition_router(route_labels: set[str]):
    """Return a route *label* (e.g. 'default', 'revise'), not a node id or END."""

    def router(state: WorkflowState) -> str:
        output = (state.get("last_agent_output") or "").lower()
        if "revise" in route_labels and (
            "revise" in output or "retry" in output or "improve" in output
        ):
            return "revise"
        return "default"

    return router


def compile_workflow(
    definition: dict,
    agents_by_id: dict[UUID, Agent],
    max_iterations: int = 15,
    on_agent_output: AgentOutputCallback | None = None,
) -> Any:
    nodes = definition.get("nodes", [])
    edges = definition.get("edges", [])

    graph = StateGraph(WorkflowState)

    entry = None
    for n in nodes:
        nid = n["id"]
        ntype = n.get("type", "agent")
        if ntype == "end":
            graph.add_node(nid, lambda s: s)
        elif ntype == "agent":
            agent_id = n.get("agent_id")
            if agent_id and UUID(str(agent_id)) in agents_by_id:
                agent = agents_by_id[UUID(str(agent_id))]
                graph.add_node(nid, _build_agent_node(agent, nid, on_agent_output))
            else:
                graph.add_node(nid, lambda s: {**s, "last_agent_output": "Missing agent"})
        if n.get("is_entry"):
            entry = nid

    if not entry and nodes:
        entry = nodes[0]["id"]

    conditional_sources: dict[str, list] = {}
    simple_edges: list[tuple[str, str]] = []

    for e in edges:
        src = e["source"]
        tgt = e["target"]
        if e.get("condition"):
            conditional_sources.setdefault(src, []).append(e)
        else:
            simple_edges.append((src, tgt))

    for src, tgt in simple_edges:
        if tgt == "end" or any(n["id"] == tgt and n.get("type") == "end" for n in nodes):
            graph.add_edge(src, END)
        else:
            graph.add_edge(src, tgt)

    for src, cond_edges in conditional_sources.items():
        mapping: dict[str, str] = {}
        for ce in cond_edges:
            label = ce.get("label", "default")
            t = ce["target"]
            mapping[label] = END if t == "end" else t
        graph.add_conditional_edges(src, _condition_router(set(mapping.keys())), mapping)

    graph.set_entry_point(entry)
    return graph.compile()
