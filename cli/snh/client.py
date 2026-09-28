import httpx
from rich import print as rprint
from snh.config import get_server, get_token

NETWORK_ERROR_MSG = "无法连接到服务器，请确认您当前在内网环境下使用。如需外网访问，请先连接公司 VPN。"


def _base_url() -> str:
    server = get_server()
    if not server:
        raise SystemExit("Not configured. Run: snh init --server <url>")
    return server.rstrip("/")


def _headers() -> dict:
    token = get_token()
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers


def _handle_response(resp: httpx.Response) -> dict:
    if resp.status_code == 401:
        raise SystemExit("Authentication required. Run: snh login")
    if resp.status_code == 403:
        raise SystemExit("Permission denied.")
    if resp.status_code == 404:
        raise SystemExit("Resource not found.")
    if resp.status_code == 413:
        raise SystemExit("File too large.")
    if resp.status_code >= 400:
        detail = ""
        ct = resp.headers.get("content-type", "")
        if "application/json" in ct:
            try:
                detail = resp.json().get("detail", resp.text)
            except Exception:
                detail = resp.text
        else:
            detail = resp.text[:200]
        raise SystemExit(f"Error: {detail}")
    return resp.json()


def get(path: str, params: dict | None = None) -> dict:
    try:
        resp = httpx.get(f"{_base_url()}{path}", headers=_headers(), params=params, timeout=30, trust_env=False)
    except (httpx.ConnectError, httpx.TimeoutException, httpx.NetworkError):
        rprint(f"[red]{NETWORK_ERROR_MSG}[/red]")
        raise SystemExit(1)
    return _handle_response(resp)


def post(path: str, json_data: dict | None = None, files: dict | None = None, data: dict | None = None, params: dict | None = None) -> dict:
    try:
        resp = httpx.post(f"{_base_url()}{path}", headers=_headers(), json=json_data, files=files, data=data, params=params, timeout=30, trust_env=False)
    except (httpx.ConnectError, httpx.TimeoutException, httpx.NetworkError):
        rprint(f"[red]{NETWORK_ERROR_MSG}[/red]")
        raise SystemExit(1)
    return _handle_response(resp)


def delete(path: str, params: dict | None = None) -> dict:
    try:
        resp = httpx.delete(f"{_base_url()}{path}", headers=_headers(), params=params, timeout=30, trust_env=False)
    except (httpx.ConnectError, httpx.TimeoutException, httpx.NetworkError):
        rprint(f"[red]{NETWORK_ERROR_MSG}[/red]")
        raise SystemExit(1)
    if resp.status_code == 204:
        return {}
    return _handle_response(resp)


def download(path: str, params: dict | None = None) -> bytes:
    try:
        resp = httpx.get(f"{_base_url()}{path}", headers=_headers(), params=params, timeout=60, trust_env=False)
    except (httpx.ConnectError, httpx.TimeoutException, httpx.NetworkError):
        rprint(f"[red]{NETWORK_ERROR_MSG}[/red]")
        raise SystemExit(1)
    if resp.status_code == 401:
        raise SystemExit("Authentication required. Run: snh login")
    if resp.status_code == 404:
        raise SystemExit("File not found.")
    if resp.status_code >= 400:
        raise SystemExit(f"Download failed (HTTP {resp.status_code}).")
    return resp.content
