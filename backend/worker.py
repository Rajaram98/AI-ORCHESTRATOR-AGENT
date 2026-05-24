"""Background worker: process run queue + optional Telegram polling."""

import logging
import threading
from uuid import UUID

from app.config import settings
from app.database import SessionLocal
from app.runtime.executor import execute_run
from app.services.queue import dequeue_run
from app.channels.telegram import run_telegram_polling

logging.basicConfig(level=settings.log_level)
logger = logging.getLogger(__name__)


def process_runs():
    logger.info("Run worker started")
    tick = 0
    while True:
        tick += 1
        if tick % 12 == 0:
            db = SessionLocal()
            try:
                from app.services.scheduler import process_due_schedules

                process_due_schedules(db)
            except Exception:
                logger.exception("Scheduler tick failed")
            finally:
                db.close()

        run_id_str = dequeue_run(timeout=5)
        if not run_id_str:
            continue
        db = SessionLocal()
        try:
            logger.info("Executing run %s", run_id_str)
            execute_run(db, UUID(run_id_str))
        except Exception:
            logger.exception("Run %s failed", run_id_str)
        finally:
            db.close()


def main():
    if settings.telegram_bot_token and settings.telegram_polling:
        t = threading.Thread(target=run_telegram_polling, daemon=True)
        t.start()
    process_runs()


if __name__ == "__main__":
    main()
