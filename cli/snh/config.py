import json
import sys
from pathlib import Path

CONFIG_DIR = Path.home() / ".snh"
CONFIG_FILE = CONFIG_DIR / "config.json"
INSTALLED_FILE = CONFIG_DIR / "installed.json"
SCAN_MAP_FILE = CONFIG_DIR / "scan-map.json"


def _exe_dir_config() -> dict:
    """Check for snh.conf next to the executable (bundled by server download)."""
    if getattr(sys, "frozen", False):
        conf = Path(sys.executable).parent / "snh.conf"
    else:
        conf = Path(__file__).resolve().parent.parent / "snh.conf"
    if conf.exists():
        try:
            return json.loads(conf.read_text())
        except Exception:
            pass
    return {}


def load_config() -> dict:
    bundled = _exe_dir_config()
    if CONFIG_FILE.exists():
        user_cfg = json.loads(CONFIG_FILE.read_text())
        return {**bundled, **user_cfg}
    return bundled


def save_config(data: dict):
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    CONFIG_FILE.write_text(json.dumps(data, indent=2))


def get_server() -> str | None:
    return load_config().get("server")


def get_token() -> str | None:
    return load_config().get("token")


def save_token(token: str):
    cfg = load_config()
    cfg["token"] = token
    save_config(cfg)


def save_server(server: str):
    cfg = load_config()
    cfg["server"] = server.rstrip("/")
    save_config(cfg)


def load_installed() -> dict:
    if INSTALLED_FILE.exists():
        return json.loads(INSTALLED_FILE.read_text())
    return {"skills": {}}


def save_installed(data: dict):
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    INSTALLED_FILE.write_text(json.dumps(data, indent=2))


def load_scan_map() -> dict[str, str]:
    if SCAN_MAP_FILE.exists():
        return json.loads(SCAN_MAP_FILE.read_text(encoding="utf-8"))
    return {}


def save_scan_map(data: dict[str, str]):
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    merged = load_scan_map()
    merged.update(data)
    SCAN_MAP_FILE.write_text(json.dumps(merged, indent=2), encoding="utf-8")
