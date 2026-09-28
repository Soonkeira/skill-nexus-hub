FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# WEB_CONCURRENCY scales uvicorn workers across CPU cores (default 4).
# Each worker has its own in-memory rate-limit window, so the effective
# per-IP limit is roughly limit × workers; acceptable for an intranet tool.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers ${WEB_CONCURRENCY:-4} --backlog 2048 --timeout-keep-alive 30"]
