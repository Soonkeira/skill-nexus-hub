import io
import re
import tarfile
import zipfile
from dataclasses import dataclass
from pathlib import PurePosixPath

import yaml


@dataclass
class SkillYaml:
    name: str
    version: str
    targets: list[str]
    description: str | None = None
    readme: str | None = None


def _parse_skill_md_frontmatter(content: str) -> dict:
    """Extract YAML frontmatter from SKILL.md content."""
    match = re.match(r'^---\s*\n(.*?\n)---\s*\n', content, re.DOTALL)
    if not match:
        raise ValueError("SKILL.md must start with YAML frontmatter (---)")
    data = yaml.safe_load(match.group(1))
    if not isinstance(data, dict):
        raise ValueError("SKILL.md frontmatter must be a YAML mapping")
    return data


def _extract_readme_from_skillmd(content: str) -> str:
    """Extract the body (after frontmatter) from SKILL.md."""
    match = re.match(r'^---\s*\n.*?\n---\s*\n', content, re.DOTALL)
    if match:
        return content[match.end():]
    return content


def _find_file(names: list[str], target: str) -> str | None:
    """Find a file in the ZIP by name, searching root first then any depth."""
    # Exact match at root
    if target in names:
        return target
    # Match at any depth (e.g. "pdf/SKILL.md")
    for n in names:
        if PurePosixPath(n).name == target:
            return n
    return None


def _find_sibling_file(names: list[str], definition_path: str, target: str) -> str | None:
    """Find a case-insensitive companion file next to the skill definition."""
    parent = PurePosixPath(definition_path).parent
    target_lower = target.lower()
    for name in names:
        path = PurePosixPath(name)
        if path.parent == parent and path.name.lower() == target_lower:
            return name
    return None


def parse_skill_yaml(zip_content: bytes) -> SkillYaml:
    """Extract and parse skill.yaml or SKILL.md from a ZIP file.

    Searches at any directory depth to support nested ZIP structures.
    """
    with zipfile.ZipFile(io.BytesIO(zip_content)) as zf:
        total_size = sum(info.file_size for info in zf.infolist())
        if total_size > 100 * 1024 * 1024:
            raise ValueError("Zip file too large when decompressed")

        names = [n for n in zf.namelist() if not n.endswith("/")]

        # Prefer skill.yaml, fall back to SKILL.md
        skill_yaml_path = _find_file(names, "skill.yaml")
        skill_md_path = _find_file(names, "SKILL.md")
        definition_path = skill_yaml_path or skill_md_path
        readme_path = _find_sibling_file(names, definition_path, "README.md") if definition_path else None

        if skill_yaml_path:
            with zf.open(skill_yaml_path) as f:
                data = yaml.safe_load(f)
            if readme_path:
                readme = zf.read(readme_path).decode("utf-8")
            elif skill_md_path:
                readme = _extract_readme_from_skillmd(zf.read(skill_md_path).decode("utf-8"))
            else:
                readme = None
        elif skill_md_path:
            raw = zf.read(skill_md_path).decode("utf-8")
            data = _parse_skill_md_frontmatter(raw)
            readme = zf.read(readme_path).decode("utf-8") if readme_path else _extract_readme_from_skillmd(raw)
        else:
            raise ValueError(
                "ZIP must contain skill.yaml or SKILL.md"
            )

    required = ["name"]
    for field in required:
        if field not in data:
            raise ValueError(f"skill definition missing required field: {field}")

    return SkillYaml(
        name=data["name"],
        version=data.get("version", ""),
        targets=data.get("targets", []),
        description=data.get("description"),
        readme=readme,
    )


def validate_skill_yaml(skill_yaml: SkillYaml, expected_slug: str, expected_version: str):
    """Validate skill definition matches expected values."""
    if skill_yaml.name != expected_slug:
        raise ValueError(
            f"skill name '{skill_yaml.name}' does not match slug '{expected_slug}'"
        )
    if skill_yaml.version and skill_yaml.version != expected_version:
        raise ValueError(
            f"skill version '{skill_yaml.version}' does not match expected '{expected_version}'"
        )


def normalize_to_zip(content: bytes, filename: str) -> tuple[bytes, str]:
    """Normalize various upload formats to a ZIP file. Stores as-is for .zip."""
    lower = filename.lower()

    if lower.endswith(".zip"):
        return content, filename

    if lower.endswith(".md"):
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
            zf.writestr("SKILL.md", content.decode("utf-8"))
        return buf.getvalue(), "upload.zip"

    if lower.endswith((".tar.gz", ".tgz")):
        buf = io.BytesIO()
        with tarfile.open(fileobj=io.BytesIO(content), mode="r:gz") as tf:
            with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
                for member in tf.getmembers():
                    if member.isdir():
                        continue
                    f = tf.extractfile(member)
                    if f is None:
                        continue
                    zf.writestr(member.name, f.read())
        return buf.getvalue(), "upload.zip"

    raise ValueError(f"Unsupported file format: {filename}. Use .zip, .md, or .tar.gz")


def list_zip_files(zip_content: bytes) -> list[dict]:
    """List all files in a ZIP, returning name, size, and type info."""
    with zipfile.ZipFile(io.BytesIO(zip_content)) as zf:
        result = []
        for info in zf.infolist():
            if info.filename.endswith("/"):
                continue
            result.append({
                "path": info.filename,
                "size": info.file_size,
            })
        return result


def read_zip_file(zip_content: bytes, file_path: str) -> bytes:
    """Read a single file from a ZIP by its path."""
    with zipfile.ZipFile(io.BytesIO(zip_content)) as zf:
        # Try exact match first
        names = zf.namelist()
        if file_path in names:
            return zf.read(file_path)
        # Try matching just the filename
        for n in names:
            if PurePosixPath(n).name == file_path:
                return zf.read(n)
        raise ValueError(f"File not found in ZIP: {file_path}")
