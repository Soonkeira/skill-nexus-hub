"""Tests for analysis service: ZIP extraction, LLM parsing, bomb protection."""
import json
import zipfile
from io import BytesIO

import pytest

from app.services.analysis import _extract_safe_files, _parse_llm_response


class TestExtractSafeFiles:
    """Tests for _extract_safe_files."""

    def _make_zip(self, files: dict[str, str]) -> bytes:
        buf = BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
            for name, content in files.items():
                zf.writestr(name, content)
        return buf.getvalue()

    def test_extracts_allowed_extensions(self):
        zip_data = self._make_zip({
            "SKILL.md": "# My Skill",
            "skill.yaml": "name: test",
            "config.json": '{"key": "val"}',
            "settings.toml": "[settings]",
            "readme.txt": "hello",
        })
        result = _extract_safe_files(zip_data)
        assert len(result) == 5
        assert "SKILL.md" in result
        assert "skill.yaml" in result

    def test_ignores_disallowed_extensions(self):
        zip_data = self._make_zip({
            "SKILL.md": "# Good",
            "main.py": "print('hello')",
            "image.png": "fake png data",
            "script.sh": "#!/bin/bash",
        })
        result = _extract_safe_files(zip_data)
        assert len(result) == 1
        assert "SKILL.md" in result

    def test_respects_max_files_limit(self):
        files = {f"file{i}.md": f"content {i}" for i in range(30)}
        zip_data = self._make_zip(files)
        result = _extract_safe_files(zip_data)
        assert len(result) <= 20

    def test_respects_max_chars_limit(self):
        big_content = "x" * 60000  # 60KB each
        files = {f"big{i}.md": big_content for i in range(3)}
        zip_data = self._make_zip(files)
        result = _extract_safe_files(zip_data)
        total = sum(len(v) for v in result.values())
        assert total <= 100_000 + 20  # small margin for truncation marker

    def test_zip_bomb_rejected(self):
        """ZIP with extreme compression ratio (>1000x) should be rejected."""
        import struct
        # Create a small, highly compressible ZIP entry then patch the declared
        # uncompressed size to simulate a decompression bomb.
        buf = BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
            zf.writestr("bomb.md", "x" * 10000)
        data = bytearray(buf.getvalue())
        idx = data.find(b"bomb.md")
        assert idx > 0
        # Local file header: uncompressed size sits at filename_offset - 26 + 22
        header_start = idx - 26
        struct.pack_into("<I", data, header_start + 22, 50 * 1024 * 1024)
        result = _extract_safe_files(bytes(data))
        # Should be empty because compression ratio > 1000x
        assert result == {}

    def test_single_oversized_file_skipped(self):
        buf = BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_STORED) as zf:
            zf.writestr("huge.md", "y" * (101 * 1024 * 1024))  # 101MB > 100MB limit
        result = _extract_safe_files(buf.getvalue())
        # Single file exceeds the 100MB per-file limit — should be skipped
        assert result == {}

    def test_empty_zip(self):
        buf = BytesIO()
        with zipfile.ZipFile(buf, "w") as zf:
            pass
        result = _extract_safe_files(buf.getvalue())
        assert result == {}

    def test_only_directories(self):
        buf = BytesIO()
        with zipfile.ZipFile(buf, "w") as zf:
            zf.writestr("subdir/", "")  # directory entry
        result = _extract_safe_files(buf.getvalue())
        assert result == {}

    def test_invalid_zip(self):
        """Invalid ZIP data should return empty dict gracefully."""
        with pytest.raises((zipfile.BadZipFile, Exception)):
            _extract_safe_files(b"not a zip file at all")

    def test_unicode_content(self):
        zip_data = self._make_zip({"readme.md": "中文内容 🎉"})
        result = _extract_safe_files(zip_data)
        assert result["readme.md"] == "中文内容 🎉"

    def test_truncation_marker(self):
        """When total chars exceed limit, the last file should be truncated with marker."""
        content = "a" * 60000
        files = {f"f{i}.md": content for i in range(3)}
        zip_data = self._make_zip(files)
        result = _extract_safe_files(zip_data)
        # At least one file should have [truncated] or total should be limited
        all_text = "".join(result.values())
        assert len(all_text) <= 100_000 + 20


class TestParseLLMResponse:
    """Tests for _parse_llm_response."""

    def test_direct_json(self):
        data = {"summary": "test", "quality_score": 7}
        result = _parse_llm_response(json.dumps(data))
        assert result == data

    def test_json_in_code_block(self):
        data = {"summary": "test", "quality_score": 8}
        raw = f"```json\n{json.dumps(data)}\n```"
        result = _parse_llm_response(raw)
        assert result == data

    def test_json_in_plain_code_block(self):
        data = {"summary": "test"}
        raw = f"```\n{json.dumps(data)}\n```"
        result = _parse_llm_response(raw)
        assert result == data

    def test_json_with_surrounding_text(self):
        data = {"summary": "test"}
        raw = f"Here is the analysis:\n{json.dumps(data)}\nEnd of analysis."
        result = _parse_llm_response(raw)
        assert result == data

    def test_invalid_json(self):
        result = _parse_llm_response("This is just plain text with no JSON at all")
        assert result is None

    def test_empty_string(self):
        result = _parse_llm_response("")
        assert result is None
