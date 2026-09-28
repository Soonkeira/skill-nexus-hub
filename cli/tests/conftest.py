import pytest

from snh import config


@pytest.fixture(autouse=True)
def isolate_cli_state(tmp_path, monkeypatch):
    config_dir = tmp_path / ".snh"
    monkeypatch.setattr(config, "CONFIG_DIR", config_dir)
    monkeypatch.setattr(config, "CONFIG_FILE", config_dir / "config.json")
    monkeypatch.setattr(config, "INSTALLED_FILE", config_dir / "installed.json")
    monkeypatch.setattr(config, "SCAN_MAP_FILE", config_dir / "scan-map.json")
