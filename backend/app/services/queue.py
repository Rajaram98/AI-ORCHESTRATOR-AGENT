from __future__ import annotations

import json
import uuid

import redis

from app.config import settings

_redis: redis.Redis | None = None

RUN_QUEUE = "orchestrator:runs"
EVENT_CHANNEL_PREFIX = "orchestrator:events:"


def get_redis() -> redis.Redis:
    global _redis
    if _redis is None:
        _redis = redis.from_url(settings.redis_url, decode_responses=True)
    return _redis


def enqueue_run(run_id: uuid.UUID) -> None:
    try:
        get_redis().lpush(RUN_QUEUE, str(run_id))
    except redis.RedisError:
        pass


def dequeue_run(timeout: int = 5) -> str | None:
    result = get_redis().brpop(RUN_QUEUE, timeout=timeout)
    if result:
        return result[1]
    return None


def publish_run_event(run_id: uuid.UUID, event_type: str, payload: dict) -> None:
    try:
        channel = f"{EVENT_CHANNEL_PREFIX}{run_id}"
        get_redis().publish(channel, json.dumps({"event_type": event_type, "payload": payload}))
    except redis.RedisError:
        pass


def subscribe_run_events(run_id: uuid.UUID):
    pubsub = get_redis().pubsub()
    pubsub.subscribe(f"{EVENT_CHANNEL_PREFIX}{run_id}")
    return pubsub
