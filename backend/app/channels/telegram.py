from __future__ import annotations

"""Telegram bot — long polling for local dev."""

import logging

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI
from langgraph.prebuilt import create_react_agent
from sqlalchemy.orm import Session
from telegram import Update
from telegram.ext import Application, CommandHandler, ContextTypes, MessageHandler, filters

from app.config import settings
from app.database import SessionLocal
from app.models.agent import Agent
from app.runtime.tools import get_tools_for_agent
from app.services.messages import persist_message

logger = logging.getLogger(__name__)


def _find_agent_for_chat(db: Session, chat_id: str) -> Agent | None:
    agents = db.query(Agent).all()
    for agent in agents:
        for ch in agent.channels or []:
            if ch.get("type") == "telegram" and str(ch.get("chat_id")) == str(chat_id):
                return agent
    return None


async def _reply_with_agent(agent: Agent, user_text: str, db: Session, chat_id: str) -> str:
    persist_message(
        db,
        content=user_text,
        sender_type="human",
        sender_id=chat_id,
        channel="telegram",
        thread_id=f"telegram:{chat_id}",
    )

    if not settings.openai_api_key:
        reply = f"[{agent.name}] Demo mode: set OPENAI_API_KEY for live responses. You said: {user_text}"
    else:
        llm = ChatOpenAI(model=agent.model or settings.default_model, api_key=settings.openai_api_key)
        tools = get_tools_for_agent(agent.tools or [])
        executor = create_react_agent(llm, tools)
        result = executor.invoke(
            {
                "messages": [
                    SystemMessage(content=agent.system_prompt),
                    HumanMessage(content=user_text),
                ]
            }
        )
        msgs = result.get("messages", [])
        last = msgs[-1] if msgs else None
        reply = last.content if last and hasattr(last, "content") else "No response."

    persist_message(
        db,
        content=reply,
        sender_type="agent",
        sender_id=str(agent.id),
        channel="telegram",
        thread_id=f"telegram:{chat_id}",
    )
    return reply


async def start_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not update.message:
        return
    chat_id = str(update.effective_chat.id)
    text = (
        f"AI Orchestrator bot ready.\n\n"
        f"Your chat_id: {chat_id}\n\n"
        "Bind this chat to an agent in the web UI (Agents → Channels) "
        "or POST /api/telegram/bind"
    )
    await update.message.reply_text(text)


async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not update.message or not update.message.text:
        return
    chat_id = str(update.effective_chat.id)
    db = SessionLocal()
    try:
        agent = _find_agent_for_chat(db, chat_id)
        if not agent:
            await update.message.reply_text(
                f"No agent bound to this chat. Your chat_id is {chat_id}. "
                "Bind an agent in the UI under Agents → Channels."
            )
            return
        reply = await _reply_with_agent(agent, update.message.text, db, chat_id)
        await update.message.reply_text(reply[:4000])
    except Exception as e:
        logger.exception("Telegram handler error")
        await update.message.reply_text(f"Error: {e}")
    finally:
        db.close()


def build_telegram_app() -> Application | None:
    if not settings.telegram_bot_token:
        return None
    app = Application.builder().token(settings.telegram_bot_token).build()
    app.add_handler(CommandHandler("start", start_command))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))
    return app


def run_telegram_polling() -> None:
    app = build_telegram_app()
    if not app:
        logger.info("TELEGRAM_BOT_TOKEN not set — skipping Telegram polling")
        return
    logger.info("Starting Telegram polling...")
    app.run_polling(allowed_updates=Update.ALL_TYPES)
