import time
import uuid
from collections import defaultdict

from jose import jwt

from app.config import settings

MAX_VERIFIED_ENTRIES = 5000
MAX_FAILURE_ENTRIES = 5000


class CaptchaService:
    def __init__(self):
        self._verified: dict[str, float] = {}
        self._failures: dict[str, list[float]] = defaultdict(list)

    def is_captcha_required(self, client_ip: str) -> bool:
        now = time.time()
        failures = [t for t in self._failures.get(client_ip, []) if now - t < 900]
        self._failures[client_ip] = failures
        self._enforce_limit()
        return len(failures) >= 3

    def record_failure(self, client_ip: str):
        self._failures[client_ip].append(time.time())
        self._enforce_limit()

    def generate_id(self) -> str:
        return str(uuid.uuid4())

    def mark_verified(self, captcha_id: str):
        self._verified[captcha_id] = time.time()
        self._cleanup_verified()

    def is_verified(self, captcha_id: str) -> bool:
        verified_at = self._verified.get(captcha_id)
        if verified_at is None:
            return False
        if time.time() - verified_at > 300:
            del self._verified[captcha_id]
            return False
        return True

    def consume(self, captcha_id: str) -> bool:
        verified_at = self._verified.pop(captcha_id, None)
        if verified_at is None:
            return False
        if time.time() - verified_at > 300:
            return False
        return True

    def _cleanup_verified(self):
        now = time.time()
        stale = [k for k, v in self._verified.items() if now - v > 300]
        for k in stale:
            del self._verified[k]
        # Memory protection
        if len(self._verified) > MAX_VERIFIED_ENTRIES:
            sorted_keys = sorted(self._verified, key=self._verified.get)
            for k in sorted_keys[: len(self._verified) - MAX_VERIFIED_ENTRIES]:
                del self._verified[k]

    def _enforce_limit(self):
        # Clean old failure entries
        now = time.time()
        stale = [ip for ip, ts in self._failures.items() if not ts or now - ts[-1] > 900]
        for ip in stale:
            del self._failures[ip]
        # Memory protection
        if len(self._failures) > MAX_FAILURE_ENTRIES:
            sorted_ips = sorted(self._failures.items(), key=lambda x: x[1][-1] if x[1] else 0)
            for ip, _ in sorted_ips[: len(self._failures) - MAX_FAILURE_ENTRIES]:
                del self._failures[ip]


captcha_service = CaptchaService()
