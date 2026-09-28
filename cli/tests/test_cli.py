"""Tests for CLI commands: version, versions, scan."""
import os
import tempfile
from unittest.mock import patch, MagicMock

import pytest
from typer.testing import CliRunner

from snh import __version__
from snh.main import app
from snh import main as main_module


runner = CliRunner()


@patch("snh.commands.publish.post")
@patch("snh.commands.publish.get")
def test_publish_targets_current_users_skill(mock_get, mock_post, tmp_path):
    mock_get.return_value = {"username": "alice"}
    mock_post.return_value = {"version": "1.0.0", "status": "pending"}
    package = tmp_path / "demo.zip"
    package.write_bytes(b"zip")

    result = runner.invoke(
        app,
        ["publish", "demo", "--version", "1.0.0", "--file", str(package)],
    )

    assert result.exit_code == 0
    assert mock_post.call_args.kwargs["params"] == {"owner": "alice"}


class TestVersion:
    """Tests for snh version command."""

    def test_version_flag(self):
        result = runner.invoke(app, ["--version"])
        assert result.exit_code == 0
        assert __version__ in result.output

    def test_version_shorthand(self):
        result = runner.invoke(app, ["-V"])
        assert result.exit_code == 0
        assert __version__ in result.output

    def test_version_format(self):
        result = runner.invoke(app, ["--version"])
        assert f"snh {__version__}" in result.output


class TestVersions:
    """Tests for snh versions command."""

    @patch("snh.config.load_installed")
    @patch("snh.commands.publish.get")
    def test_versions_no_installed(self, mock_get, mock_installed):
        mock_installed.return_value = {"skills": {}}
        result = runner.invoke(app, ["versions"])
        assert result.exit_code == 0
        assert "No skills installed" in result.output

    @patch("snh.config.load_installed")
    @patch("snh.commands.publish.get")
    def test_versions_lists_installed(self, mock_get, mock_installed):
        mock_installed.return_value = {
            "skills": {
                "/path/to/skill1": {
                    "slug": "my-skill",
                    "owner": "admin",
                    "version": "1.0.0",
                    "target": "cursor",
                }
            }
        }
        mock_get.return_value = {"items": {"my-skill": {"version": "2.0.0", "status": "approved"}}}
        result = runner.invoke(app, ["versions"])
        assert result.exit_code == 0
        assert "my-skill" in result.output

    @patch("snh.commands.publish.get")
    def test_versions_with_slug(self, mock_get):
        mock_get.return_value = {
            "items": [
                {"version": "1.0.0", "status": "approved", "changelog": "First", "created_at": "2024-01-01T00:00:00"},
            ]
        }
        result = runner.invoke(app, ["versions", "my-skill"])
        assert result.exit_code == 0
        assert "1.0.0" in result.output

    @patch("snh.config.load_installed")
    @patch("snh.commands.publish.get")
    def test_versions_server_unreachable(self, mock_get, mock_installed):
        mock_installed.return_value = {
            "skills": {
                "/path/to/skill": {"slug": "test", "version": "1.0", "target": "cursor"}
            }
        }
        mock_get.side_effect = SystemExit(1)
        result = runner.invoke(app, ["versions"])
        assert result.exit_code == 0
        # Should still show local skills even when server unreachable
        assert "test" in result.output


class TestScan:
    """Tests for snh scan command."""

    @patch("snh.commands.scan.get")
    def test_scan_no_targets(self, mock_get):
        mock_get.return_value = []
        result = runner.invoke(app, ["scan"])
        assert result.exit_code == 0
        assert "No install targets" in result.output

    @patch("snh.commands.scan.get")
    def test_scan_no_valid_paths(self, mock_get):
        mock_get.return_value = [
            {"name": "cursor", "global_path": "/nonexistent/path", "project_path": None}
        ]
        result = runner.invoke(app, ["scan"])
        assert result.exit_code == 0
        assert "No valid skill directories" in result.output

    @patch("snh.commands.scan.get")
    def test_scan_detects_skill_with_skill_md(self, mock_get):
        with tempfile.TemporaryDirectory() as tmpdir:
            skill_dir = os.path.join(tmpdir, "my-skill")
            os.makedirs(skill_dir)
            with open(os.path.join(skill_dir, "SKILL.md"), "w") as f:
                f.write("# My Skill")

            mock_get.return_value = [
                {"name": "cursor", "global_path": tmpdir, "project_path": None}
            ]
            result = runner.invoke(app, ["scan"])
            assert result.exit_code == 0
            assert "Found" in result.output or "my-skill" in result.output

    @patch("snh.commands.scan.get")
    def test_scan_ignores_non_skill_dirs(self, mock_get):
        with tempfile.TemporaryDirectory() as tmpdir:
            non_skill = os.path.join(tmpdir, "random-folder")
            os.makedirs(non_skill)
            with open(os.path.join(non_skill, "random.txt"), "w") as f:
                f.write("not a skill")

            mock_get.return_value = [
                {"name": "cursor", "global_path": tmpdir, "project_path": None}
            ]
            result = runner.invoke(app, ["scan"])
            assert result.exit_code == 0
            assert "No skills found" in result.output

    @patch("snh.commands.scan.get")
    def test_scan_deduplicates_paths(self, mock_get):
        with tempfile.TemporaryDirectory() as tmpdir:
            skill_dir = os.path.join(tmpdir, "test-skill")
            os.makedirs(skill_dir)
            with open(os.path.join(skill_dir, "SKILL.md"), "w") as f:
                f.write("# Test")

            # Same path twice (global_path and project_path point to same dir)
            mock_get.return_value = [
                {"name": "cursor", "global_path": tmpdir, "project_path": tmpdir}
            ]
            result = runner.invoke(app, ["scan"])
            assert result.exit_code == 0
            # Should not duplicate the skill
            assert result.output.count("test-skill") <= 3

    @patch("snh.commands.scan.post")
    @patch("snh.commands.scan.get")
    def test_scan_upload_success(self, mock_get, mock_post):
        with tempfile.TemporaryDirectory() as tmpdir:
            skill_dir = os.path.join(tmpdir, "my-skill")
            os.makedirs(skill_dir)
            with open(os.path.join(skill_dir, "SKILL.md"), "w") as f:
                f.write("# My Skill")

            mock_get.return_value = [
                {"name": "cursor", "global_path": tmpdir, "project_path": None}
            ]
            mock_post.return_value = {"scan_id": "test-id", "skill_count": 1}
            result = runner.invoke(app, ["scan", "--upload"])
            assert result.exit_code == 0
            assert "Uploaded scan results" in result.output
            mock_post.assert_called_once()


class TestScanProtocol:
    """Tests for browser-triggered local scan."""

    @patch("snh.commands.scan.post")
    @patch("snh.commands.scan.get")
    @patch("snh.config.save_token")
    @patch("snh.config.save_server")
    @patch("httpx.post")
    @patch("snh.main.scan")
    def test_scan_protocol_exchanges_token_and_uploads(
        self,
        mock_scan,
        mock_http_post,
        mock_save_server,
        mock_save_token,
        _mock_get,
        _mock_post,
    ):
        response = MagicMock(status_code=200)
        response.json.return_value = {"token": "cli-token"}
        mock_http_post.return_value = response

        with patch("builtins.input", return_value=""):
            main_module._handle_protocol(
                "snh://scan?token=browser-jwt&server=http%3A%2F%2Flocalhost%3A9527"
            )

        mock_save_server.assert_called_once_with("http://localhost:9527")
        mock_save_token.assert_called_once_with("cli-token")
        assert mock_http_post.call_args.kwargs["trust_env"] is False
        mock_scan.assert_called_once_with(upload=True, paths=[])

    @patch("snh.config.save_token")
    @patch("snh.config.save_server")
    @patch("httpx.post")
    @patch("snh.main.scan")
    def test_scan_protocol_passes_custom_paths(
        self, mock_scan, mock_http_post, mock_save_server, mock_save_token
    ):
        response = MagicMock(status_code=200)
        response.json.return_value = {"token": "cli-token"}
        mock_http_post.return_value = response

        with patch("builtins.input", return_value=""):
            main_module._handle_protocol(
                "snh://scan?token=browser-jwt&server=http%3A%2F%2Flocalhost%3A9527"
                "&path=C%3A%5Ccustom%5Cskills&path=D%3A%5Cteam-skills"
            )

        mock_scan.assert_called_once_with(
            upload=True,
            paths=[r"C:\custom\skills", r"D:\team-skills"],
        )

    @patch("snh.commands.scan.get")
    def test_scan_accepts_custom_path(self, mock_get):
        with tempfile.TemporaryDirectory() as tmpdir:
            skill_dir = os.path.join(tmpdir, "custom-skill")
            os.makedirs(skill_dir)
            with open(os.path.join(skill_dir, "SKILL.md"), "w") as f:
                f.write("# Custom Skill")

            mock_get.return_value = []
            result = runner.invoke(app, ["scan", "--path", tmpdir])

            assert result.exit_code == 0
            assert "custom-skill" in result.output.lower()
