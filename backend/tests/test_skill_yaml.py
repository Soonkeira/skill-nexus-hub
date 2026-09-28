import io
import zipfile

import pytest

from app.services.skill_yaml import parse_skill_yaml, validate_skill_yaml, normalize_to_zip, list_zip_files, read_zip_file


def _make_zip(yaml_content: str) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("skill.yaml", yaml_content)
    return buf.getvalue()


def _make_skillmd_zip(frontmatter: str, body: str = "") -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("SKILL.md", f"---\n{frontmatter}\n---\n{body}")
    return buf.getvalue()


def _make_nested_zip() -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("pdf/SKILL.md", "---\nname: pdf\ndescription: PDF tool\n---\n# PDF Guide")
        zf.writestr("pdf/scripts/run.py", "print('hi')")
        zf.writestr("pdf/forms.md", "# Forms")
    return buf.getvalue()


def test_parse_valid():
    data = _make_zip("name: my-skill\nversion: 1.0.0\ntargets:\n  - cursor\n")
    result = parse_skill_yaml(data)
    assert result.name == "my-skill"
    assert result.version == "1.0.0"
    assert result.targets == ["cursor"]


def test_parse_missing_yaml():
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("readme.md", "# Hello")
    with pytest.raises(ValueError, match="skill.yaml"):
        parse_skill_yaml(buf.getvalue())


def test_parse_version_optional():
    data = _make_zip("name: my-skill\n")
    result = parse_skill_yaml(data)
    assert result.name == "my-skill"
    assert result.version == ""


def test_parse_skillmd():
    data = _make_skillmd_zip("name: pdf\ndescription: PDF skill", "# PDF Guide\n\nContent here.")
    result = parse_skill_yaml(data)
    assert result.name == "pdf"
    assert result.description == "PDF skill"
    assert "# PDF Guide" in result.readme


def test_parse_skillmd_no_frontmatter():
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("SKILL.md", "# Just a title")
    with pytest.raises(ValueError, match="frontmatter"):
        parse_skill_yaml(buf.getvalue())


def test_parse_nested_skillmd():
    data = _make_nested_zip()
    result = parse_skill_yaml(data)
    assert result.name == "pdf"
    assert result.description == "PDF tool"
    assert "# PDF Guide" in result.readme


def test_parse_prefers_readme_next_to_skill_definition():
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr(
            "demo/SKILL.md",
            "---\nname: demo\ndescription: Demo skill\n---\n# Internal instructions",
        )
        zf.writestr("demo/README.md", "# Public documentation\n\nUse this guide.")
        zf.writestr("demo/templates/README.md", "# Unrelated template docs")

    result = parse_skill_yaml(buf.getvalue())

    assert result.readme == "# Public documentation\n\nUse this guide."


def test_validate_mismatch():
    sy = parse_skill_yaml(_make_zip("name: wrong\nversion: 1.0.0\n"))
    with pytest.raises(ValueError, match="does not match slug"):
        validate_skill_yaml(sy, "correct", "1.0.0")


def test_validate_ok():
    sy = parse_skill_yaml(_make_zip("name: my-skill\nversion: 1.0.0\n"))
    validate_skill_yaml(sy, "my-skill", "1.0.0")


def test_validate_version_optional():
    sy = parse_skill_yaml(_make_zip("name: my-skill\n"))
    validate_skill_yaml(sy, "my-skill", "2.0.0")


def test_normalize_md():
    md = "---\nname: test\n---\n# Hello"
    result, _ = normalize_to_zip(md.encode(), "test.md")
    with zipfile.ZipFile(io.BytesIO(result)) as zf:
        assert "SKILL.md" in zf.namelist()


def test_normalize_zip_unchanged():
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("pdf/SKILL.md", "---\nname: pdf\n---\ncontent")
        zf.writestr("pdf/scripts/run.py", "print('hi')")
    original = buf.getvalue()
    result, _ = normalize_to_zip(original, "pdf.zip")
    assert result == original


def test_list_zip_files():
    data = _make_nested_zip()
    files = list_zip_files(data)
    paths = [f["path"] for f in files]
    assert "pdf/SKILL.md" in paths
    assert "pdf/scripts/run.py" in paths
    assert "pdf/forms.md" in paths


def test_read_zip_file():
    data = _make_nested_zip()
    content = read_zip_file(data, "pdf/scripts/run.py")
    assert content == b"print('hi')"


def test_read_zip_file_by_name():
    data = _make_nested_zip()
    content = read_zip_file(data, "SKILL.md")
    assert b"name: pdf" in content
