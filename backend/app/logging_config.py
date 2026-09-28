"""Structured (JSON line) logging configuration.

Emits one JSON object per log line so logs can be ingested by tools like
Loki/ELK without parsing free-text. Falls back to plaintext in dev (ENV != prod)
for readability. Uses only the stdlib to avoid a new dependency.
"""
from __future__ import annotations

import json
import logging
import os
import sys
from datetime import datetime, timezone


class JsonFormatter(logging.Formatter):
    """Render LogRecords as single-line JSON."""

    # Attributes that carry meaning but aren't standard LogRecord fields.
    _RESERVED = {"message", "asctime", "name", "msg", "args", "levelname",
                 "levelno", "pathname", "filename", "module", "exc_info",
                 "exc_text", "stack_info", "lineno", "funcName", "created",
                 "msecs", "relativeCreated", "thread", "threadName",
                 "processName", "process", "taskName"}

    def format(self, record: logging.LogRecord) -> str:
        ts = datetime.fromtimestamp(record.created, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")
        payload: dict[str, object] = {
            "ts": f"{ts}.{int(record.msecs):03d}Z",
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
        }
        # Attach caller location for non-framework logs.
        if record.name != "uvicorn.access":
            payload["where"] = f"{record.module}:{record.lineno}"
        # Merge extra fields.
        for key, value in record.__dict__.items():
            if key not in self._RESERVED and not key.startswith("_"):
                payload[key] = value
        if record.exc_info:
            payload["exc"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False, default=str)


def configure_logging() -> None:
    """Configure root + uvicorn loggers."""
    level_name = os.getenv("LOG_LEVEL", "INFO").upper()
    level = getattr(logging, level_name, logging.INFO)
    use_json = os.getenv("ENV", "dev") == "prod" or os.getenv("LOG_JSON", "") in ("1", "true")

    handler = logging.StreamHandler(sys.stdout)
    if use_json:
        handler.setFormatter(JsonFormatter())
    else:
        handler.setFormatter(logging.Formatter(
            "%(asctime)s %(levelname)s [%(name)s] %(message)s"
        ))

    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(level)

    # Make uvicorn's own loggers honor the same formatting/level.
    for noisy in ("uvicorn", "uvicorn.access", "uvicorn.error"):
        lg = logging.getLogger(noisy)
        lg.handlers = []
        lg.propagate = True
        lg.setLevel(level)
