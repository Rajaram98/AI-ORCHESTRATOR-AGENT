# End-to-end demo script

Record this flow for the hiring challenge submission.

## Prerequisites

- `cp .env.example .env` and set `OPENAI_API_KEY`
- Optional: `TELEGRAM_BOT_TOKEN` from [@BotFather](https://t.me/BotFather)
- `make up`

## Steps (≈5 minutes)

1. **Open UI** at http://localhost:5173 — confirm seeded agents (Researcher, Writer, Planner, Executor, Reviewer).

2. **Workflows** → click **Research → Writer** template → assign agents on canvas if needed → **Save workflow**.

3. **Runs** → select workflow → task: `Summarize three benefits of async multi-agent systems` → **Queue run**.

4. **Runs panel** → open run → show steps, events, token counts updating.

5. **Messages** → filter `internal` → show inter-agent transcript.

6. **Telegram** (if configured):
   - Message bot `/start` → copy `chat_id`
   - **Agents** → edit Researcher → **Channels** → bind chat_id
   - Send a question in Telegram → show reply in UI message history

7. **API docs** — http://localhost:8000/docs for live walkthrough backup.

## Recording tips

- Use OBS or macOS Screen Recording
- Keep terminal visible for `docker compose logs -f worker`
- Mention LangGraph choice and async Redis queue in voiceover
