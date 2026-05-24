"""Tool registry — maps tool names to LangChain tools."""

import ast
import operator
import re
from typing import Callable

from langchain_core.tools import tool

SAFE_OPS = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.Pow: operator.pow,
    ast.USub: operator.neg,
}


def _safe_eval(expr: str) -> float:
    node = ast.parse(expr.strip(), mode="eval").body
    return _eval_node(node)


def _eval_node(node):
    if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
        return node.value
    if isinstance(node, ast.BinOp) and type(node.op) in SAFE_OPS:
        return SAFE_OPS[type(node.op)](_eval_node(node.left), _eval_node(node.right))
    if isinstance(node, ast.UnaryOp) and type(node.op) in SAFE_OPS:
        return SAFE_OPS[type(node.op)](_eval_node(node.operand))
    raise ValueError("Unsupported expression")


@tool
def calculator(expression: str) -> str:
    """Evaluate a simple math expression, e.g. '(2 + 3) * 4'."""
    try:
        return str(_safe_eval(expression))
    except Exception as e:
        return f"Error: {e}"


@tool
def write_note(title: str, body: str) -> str:
    """Save a short note for later reference in the workflow."""
    return f"Note saved: [{title}] {body[:500]}"


@tool
def fetch_url_summary(url: str) -> str:
    """Fetch a URL and return a short text preview (first ~1500 chars)."""
    import httpx

    try:
        resp = httpx.get(url, timeout=15.0, follow_redirects=True)
        resp.raise_for_status()
        text = re.sub(r"<[^>]+>", " ", resp.text)
        text = re.sub(r"\s+", " ", text).strip()
        return text[:1500] if text else "(empty page)"
    except Exception as e:
        return f"Could not fetch URL: {e}"


TOOL_REGISTRY: dict[str, Callable] = {
    "calculator": calculator,
    "write_note": write_note,
    "fetch_url_summary": fetch_url_summary,
}


def get_tools_for_agent(tool_names: list[str]) -> list:
    tools = []
    for name in tool_names:
        if name in TOOL_REGISTRY:
            tools.append(TOOL_REGISTRY[name])
    return tools


def list_available_tools() -> list[dict]:
    return [
        {"name": "calculator", "description": "Evaluate math expressions"},
        {"name": "write_note", "description": "Save a note for the workflow"},
        {"name": "fetch_url_summary", "description": "Fetch and summarize a URL"},
    ]
