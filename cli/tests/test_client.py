from unittest.mock import MagicMock, patch

from snh import client
from snh import config


def test_get_bypasses_system_proxy_for_internal_server():
    response = MagicMock(status_code=200)
    response.json.return_value = {"ok": True}

    with patch("snh.client.get_server", return_value="http://localhost:9527"), \
         patch("snh.client.get_token", return_value=None), \
         patch("snh.client.httpx.get", return_value=response) as mock_get:
        client.get("/api/health")

    assert mock_get.call_args.kwargs["trust_env"] is False


def test_post_bypasses_system_proxy_for_internal_server():
    response = MagicMock(status_code=200)
    response.json.return_value = {"ok": True}

    with patch("snh.client.get_server", return_value="http://localhost:9527"), \
         patch("snh.client.get_token", return_value=None), \
         patch("snh.client.httpx.post", return_value=response) as mock_post:
        client.post("/api/test", json_data={"value": 1})

    assert mock_post.call_args.kwargs["trust_env"] is False


def test_save_scan_map_merges_existing_mappings(tmp_path, monkeypatch):
    scan_map_file = tmp_path / "scan-map.json"
    monkeypatch.setattr(config, "SCAN_MAP_FILE", scan_map_file)
    config.save_scan_map({"existing-ref": "C:/skills/existing"})

    config.save_scan_map({"new-ref": "C:/skills/new"})

    assert config.load_scan_map() == {
        "existing-ref": "C:/skills/existing",
        "new-ref": "C:/skills/new",
    }
