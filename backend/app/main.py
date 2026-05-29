from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import agents, messages, runs, schedules, telegram, workflows
from app.seed import seed


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        seed()
    except Exception:
        pass
    yield


app = FastAPI(
    title="AI Agent Orchestration Platform",
    description="Yuno AI hiring challenge — LangGraph multi-agent orchestration",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(agents.router, prefix="/api")
app.include_router(workflows.router, prefix="/api")
app.include_router(runs.router, prefix="/api")
app.include_router(messages.router, prefix="/api")
app.include_router(schedules.router, prefix="/api")
app.include_router(telegram.router, prefix="/api")


@app.get("/health")
def health():
    return {"status": "ok"}
