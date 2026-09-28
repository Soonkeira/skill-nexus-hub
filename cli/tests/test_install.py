import io
import zipfile
from pathlib import Path

import pytest

from snh.commands import install as install_module


def _zip_bytes(*entries: tuple[str, str]) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for path, content in entries:
            zf.writestr(path, content)
    return buf.getvalue()


def test_install_places_rootless_zip_inside_slug_directory(monkeypatch, tmp_path: Path):
    saved = {}

    monkeypatch.setattr(
        install_module,
        "get",
        lambda path, params=None: (
            {"name": "summarize"}
            if path.endswith("/by-slug/summarize")
            else {"items": [{"version": "1.0.0"}]}
        ),
    )
    monkeypatch.setattr(
        install_module,
        "download",
        lambda path, params=None: _zip_bytes(
            ("SKILL.md", "---\nname: summarize\n---\nbody"),
            ("README.md", "hello"),
        ),
    )
    monkeypatch.setattr(install_module, "load_installed", lambda: {"skills": {}})
    monkeypatch.setattr(install_module, "save_installed", lambda payload: saved.update(payload))

    install_module.install("user1749/summarize", target=None, project=False, custom_path=str(tmp_path))

    skill_dir = tmp_path / "summarize"
    assert skill_dir.is_dir()
    assert (skill_dir / "SKILL.md").read_text(encoding="utf-8").startswith("---")
    assert (skill_dir / "README.md").read_text(encoding="utf-8") == "hello"
    assert not (tmp_path / "SKILL.md").exists()
    assert "user1749/summarize:custom" in saved["skills"]


def test_install_strips_single_top_level_folder_from_zip(monkeypatch, tmp_path: Path):
    monkeypatch.setattr(
        install_module,
        "get",
        lambda path, params=None: (
            {"name": "summarize"}
            if path.endswith("/by-slug/summarize")
            else {"items": [{"version": "1.0.0"}]}
        ),
    )
    monkeypatch.setattr(
        install_module,
        "download",
        lambda path, params=None: _zip_bytes(
            ("summarize/SKILL.md", "---\nname: summarize\n---\nbody"),
            ("summarize/docs/guide.md", "guide"),
        ),
    )
    monkeypatch.setattr(install_module, "load_installed", lambda: {"skills": {}})
    monkeypatch.setattr(install_module, "save_installed", lambda payload: None)

    install_module.install("user1749/summarize", target=None, project=False, custom_path=str(tmp_path))

    skill_dir = tmp_path / "summarize"
    assert skill_dir.is_dir()
    assert (skill_dir / "SKILL.md").exists()
    assert (skill_dir / "docs" / "guide.md").read_text(encoding="utf-8") == "guide"
    assert not (skill_dir / "summarize").exists()


def test_programmatic_target_install_does_not_treat_missing_custom_path_as_typer_option(monkeypatch, tmp_path: Path):
    saved = {}

    monkeypatch.setattr(
        install_module,
        "get",
        lambda path, params=None: (
            [
                {
                    "name": "claude-code",
                    "display_name": "Claude Code",
                    "global_path": str(tmp_path),
                    "project_path": ".claude/skills",
                }
            ]
            if path == "/api/skills/install-targets"
            else (
                {"name": "summarize"}
                if path.endswith("/by-slug/summarize")
                else {"items": [{"version": "1.0.0"}]}
            )
        ),
    )
    monkeypatch.setattr(
        install_module,
        "download",
        lambda path, params=None: _zip_bytes(("SKILL.md", "---\nname: summarize\n---\nbody")),
    )
    monkeypatch.setattr(install_module, "load_installed", lambda: {"skills": {}})
    monkeypatch.setattr(install_module, "save_installed", lambda payload: saved.update(payload))

    install_module.install("user1749/summarize", target="claude-code", project=False)

    assert (tmp_path / "summarize" / "SKILL.md").exists()
    assert saved["skills"]["user1749/summarize:claude-code"]["custom_path"] is None
