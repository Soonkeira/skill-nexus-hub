import time
from collections import defaultdict

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from app.config import settings

# Per-path rate limit rules: (prefix_match, methods, max_requests, window_seconds)
# Prefixes are matched with str.startswith against the request path, so each
# prefix must be an actual leading segment of the target routes.
PATH_LIMITS = [
    ("/api/auth/login", {"POST"}, 10, 60),
    ("/api/auth/register", {"POST"}, 5, 60),
    # Skill detail, version upload/download/list and file inspection all live
    # under /api/skills/by-slug/<slug>/... (versions.py / skills.py routers).
    ("/api/skills/by-slug", None, 20, 60),
    ("/api/tokens", {"POST", "DELETE"}, 5, 60),
]

GLOBAL_LIMIT = (100, 60)  # 100 requests per minute for all /api/* paths
MAX_TRACKED_IPS = 10000


class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app):
        super().__init__(app)
        self.requests: dict[str, list[float]] = defaultdict(list)
        self._last_cleanup = time.time()
        self._trusted_proxies = settings.trusted_proxy_list

    def _get_client_ip(self, request: Request) -> str:
        direct_ip = request.client.host if request.client else "unknown"
        if self._trusted_proxies and direct_ip in self._trusted_proxies:
            forwarded = request.headers.get("X-Forwarded-For")
            if forwarded:
                return forwarded.split(",")[0].strip()
        return direct_ip

    def _get_limit(self, path: str, method: str) -> tuple[str, int, int] | None:
        for prefix, methods, max_req, window in PATH_LIMITS:
            if path.startswith(prefix) and (methods is None or method in methods):
                return (prefix, max_req, window)
        return None

    def _cleanup(self, now: float):
        # Periodic full cleanup
        if now - self._last_cleanup < 30:
            return
        self._last_cleanup = now
        stale = [key for key, ts in self.requests.items() if not ts or now - ts[-1] > 120]
        for key in stale:
            del self.requests[key]

        # Memory protection: evict oldest IPs if over limit
        if len(self.requests) > MAX_TRACKED_IPS:
            sorted_keys = sorted(self.requests.items(), key=lambda x: x[1][-1] if x[1] else 0)
            for key, _ in sorted_keys[: len(self.requests) - MAX_TRACKED_IPS]:
                del self.requests[key]

    def _check_limit(self, key: str, now: float, max_req: int, window: int) -> bool:
        self.requests[key] = [t for t in self.requests[key] if now - t < window]
        if len(self.requests[key]) >= max_req:
            return False
        self.requests[key].append(now)
        return True

    async def dispatch(self, request: Request, call_next):
        if getattr(request.app.state, "disable_rate_limit", False):
            return await call_next(request)

        path = request.url.path
        if not path.startswith("/api/"):
            return await call_next(request)

        client_ip = self._get_client_ip(request)
        now = time.time()
        self._cleanup(now)

        # Check path-specific limit
        path_limit = self._get_limit(path, request.method)
        if path_limit:
            prefix, max_req, window = path_limit
            if not self._check_limit(f"{client_ip}:path:{prefix}", now, max_req, window):
                return JSONResponse(
                    status_code=429,
                    content={"detail": "请求过于频繁，请稍后再试"},
                )

        # Check global API limit
        max_req, window = GLOBAL_LIMIT
        if not self._check_limit(f"{client_ip}:global", now, max_req, window):
            return JSONResponse(
                status_code=429,
                content={"detail": "请求过于频繁，请稍后再试"},
            )

        return await call_next(request)
