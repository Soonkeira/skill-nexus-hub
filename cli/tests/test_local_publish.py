import io
import zipfile
from pathlib import Path
from unittest.mock import patch

import yaml

from snh.commands.local_publish import _build_skill_zip, publish_local_request


def test_build_skill_zip_rewrites_frontmatter_without_touching_source(tmp_path: Path):
    skill_dir = tmp_path / "old-skill"
    skill_dir.mkdir()
    source = "---\nname: old-skill\nversion: 0.1.0\ndescription: old\n---\nBody"
    (skill_dir / "SKILL.md").write_text(source, encoding="utf-8")

    payload = _build_skill_zip(skill_dir, slug="new-skill", version="1.2.3", description="Reviewed")

    with zipfile.ZipFile(io.BytesIO(payload)) as zf:
        content = zf.read("SKILL.md").decode("utf-8")
    frontmatter = yaml.safe_load(content.split("---", 2)[1])
    assert frontmatter["name"] == "new-skill"
    assert frontmatter["version"] == "1.2.3"
    assert frontmatter["description"] == "Reviewed"
    assert (skill_dir / "SKILL.md").read_text(encoding="utf-8") == source


@patch("snh.commands.local_publish.post")
@patch("snh.commands.local_publish.get")
@patch("snh.commands.local_publish.load_scan_map")
def test_publish_local_request_creates_skill_and_uploads_version(mock_map, mock_get, mock_post, tmp_path: Path):
    skill_dir = tmp_path / "demo"
    skill_dir.mkdir()
    (skill_dir / "SKILL.md").write_text("---\nname: demo\n---\nBody", encoding="utf-8")
    mock_map.return_value = {"ref-12345678": str(skill_dir)}
    request_payload = {
        "items": [{
            "local_ref": "ref-12345678",
            "name": "Demo Skill",
            "slug": "demo",
            "description": "Reviewed",
            "version": "1.0.0",
            "changelog": None,
            "visibility": "public",
        }]
    }
    mock_get.side_effect = [request_payload, {"username": "alice"}]
    mock_post.side_effect = [
        {"slug": "demo"},
        {"version": "1.0.0", "status": "pending"},
        {"status": "completed"},
    ]

    publish_local_request("request-1")

    assert mock_post.call_args_list[0].args[0] == "/api/skills"
    assert mock_post.call_args_list[1].args[0] == "/api/skills/by-slug/demo/versions"
    assert mock_post.call_args_list[1].kwargs["params"] == {"owner": "alice"}
    assert mock_post.call_args_list[2].args[0] == "/api/local-skills/publish-requests/request-1/results"


@patch("snh.commands.local_publish.delete")
@patch("snh.commands.local_publish.post")
@patch("snh.commands.local_publish.get")
@patch("snh.commands.local_publish.load_scan_map")
def test_publish_local_request_removes_new_skill_when_version_upload_fails(
    mock_map, mock_get, mock_post, mock_delete, tmp_path: Path
):
    skill_dir = tmp_path / "demo"
    skill_dir.mkdir()
    (skill_dir / "SKILL.md").write_text("---\nname: demo\n---\nBody", encoding="utf-8")
    mock_map.return_value = {"ref-12345678": str(skill_dir)}
    request_payload = {
        "items": [{
            "local_ref": "ref-12345678",
            "name": "Demo Skill",
            "slug": "demo",
            "description": None,
            "version": "1.0.0",
            "changelog": None,
            "visibility": "public",
        }]
    }
    mock_get.side_effect = [request_payload, {"username": "alice"}]
    mock_post.side_effect = [
        {"slug": "demo"},
        SystemExit("Error: invalid package"),
        {"status": "failed"},
    ]

    publish_local_request("request-1")

    mock_delete.assert_called_once_with("/api/skills/by-slug/demo", params={"owner": "alice"})
    result_payload = mock_post.call_args_list[-1].kwargs["json_data"]
    assert result_payload["items"][0]["status"] == "failed"
