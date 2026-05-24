# AI Agent Orchestration Platform

Yuno AI Engineer hiring challenge — a local-first platform to create AI agents, configure behavior, build multi-agent workflows with **LangGraph**, and interact via **Telegram**.

## Features

- Agent CRUD with tools, memory, schedules, guardrails, and channel bindings
- Visual workflow builder (React Flow) with conditions and feedback loops
- Two built-in templates: Research → Writer, Planner → Executor → Reviewer
- Async run queue (Redis) + background worker
- Live run monitoring (steps, events, token/cost estimates)
- Message history (internal + Telegram)
- Single-command local setup via Docker Compose

## Quick start

```bash
cp .env.example .env
# Edit .env — set OPENAI_API_KEY (required for LLM runs)
make up
```

| Service  | URL |
|----------|-----|
| Web UI   | http://localhost:5173 |
| API      | http://localhost:8000 |
| API docs | http://localhost:8000/docs |

```bash
make down    # stop
make test    # run pytest in API container
make seed    # re-seed templates/agents if DB empty
```

## Why LangGraph

LangGraph provides explicit graph-based orchestration that maps cleanly to our workflow JSON (nodes/edges, conditional revise loops). We use `create_react_agent` for tool-using agents and a shared `WorkflowState` for async handoff between agents. See [docs/architecture.md](docs/architecture.md).

## Telegram setup

1. Create a bot via [@BotFather](https://t.me/BotFather)
2. Set `TELEGRAM_BOT_TOKEN` in `.env`
3. Start stack — worker runs long polling
4. Send `/start` to your bot → copy `chat_id`
5. In UI: **Agents** → edit agent → **Channels** → bind chat_id

## Demo

Follow [docs/DEMO.md](docs/DEMO.md) and record a video showing UI workflow execution + Telegram conversation.

## Project structure

```
backend/          FastAPI, LangGraph runtime, worker, Telegram
frontend/         React + Vite + React Flow
docs/             Architecture & demo guide
docker-compose.yml
```

## Tests

```bash
cd backend && pip install -r requirements.txt && pytest -v
```

Critical paths covered: agent CRUD, workflow/run creation, message persistence, Telegram bind.

## License

MIT — challenge submission.
