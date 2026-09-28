import io
import os
import re
import zipfile
from pathlib import Path

import yaml
from rich import print as rprint

from snh.client import delete, get, post
from snh.config import load_scan_map

MAX_PACKAGE_SIZE = 50 * 1024 * 1024
MAX_PACKAGE_FILES = 2000


def _rewrite_skill_md(content: str, slug: str, version: str, description: str | None) -> str:
    match = re.match(r"^---\s*\n(.*?)\n---\s*\n?", content, re.DOTALL)
    metadata = yaml.safe_load(match.group(1)) if match else {}
    if not isinstance(metadata, dict):
        metadata = {}
    metadata["name"] = slug
    metadata["version"] = version
    if description:
        metadata["description"] = description
    body = content[match.end():] if match else content
    return f"---\n{yaml.safe_dump(metadata, allow_unicode=True, sort_keys=False)}---\n{body}"


def _build_skill_zip(directory: Path, slug: str, version: str, description: str | None) -> bytes:
    if not directory.is_dir():
        raise ValueError("Local Skill directory no longer exists")
    buffer = io.BytesIO()
    total_size = 0
    file_count = 0
    found_definition = False
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        for root, dirs, files in os.walk(directory):
            dirs[:] = [name for name in dirs if not (Path(root) / name).is_symlink()]
            for filename in files:
                source = Path(root) / filename
                if source.is_symlink():
                    continue
                relative = source.relative_to(directory).as_posix()
                # Check the on-disk size via stat() BEFORE reading the file into
                # memory. A Skill with multi-GB assets would otherwise be fully
                # read into RAM before the size check could reject it.
                try:
                    file_size = source.stat().st_size
                except OSError as exc:
                    raise ValueError(f"Cannot stat {relative}: {exc}") from exc
                total_size += file_size
                file_count += 1
                if total_size > MAX_PACKAGE_SIZE or file_count > MAX_PACKAGE_FILES:
                    raise ValueError(
                        f"Local Skill package exceeds upload limits "
                        f"({total_size} bytes / {file_count} files)"
                    )
                data = source.read_bytes()
                if relative == "SKILL.md":
                    data = _rewrite_skill_md(data.decode("utf-8"), slug, version, description).encode("utf-8")
                    found_definition = True
                elif relative in ("skill.yaml", "skill.yml"):
                    metadata = yaml.safe_load(data) or {}
                    metadata["name"] = slug
                    metadata["version"] = version
                    if description:
                        metadata["description"] = description
                    data = yaml.safe_dump(metadata, allow_unicode=True, sort_keys=False).encode("utf-8")
                    relative = "skill.yaml"
                    found_definition = True
                zf.writestr(relative, data)
    if not found_definition:
        raise ValueError("Local Skill must contain SKILL.md or skill.yaml")
    return buffer.getvalue()


def publish_local_request(request_id: str):
    request = get(f"/api/local-skills/publish-requests/{request_id}")
    path_map = load_scan_map()
    # Resolve the current user's username so we can pass ?owner= on every
    # by-slug call. Without it, a bare slug that another user also owns can
    # resolve to the wrong Skill (or hit an ambiguous-slug path).
    try:
        me = get("/api/auth/me")
        owner = me.get("username")
    except SystemExit:
        owner = None
    results = []
    for item in request.get("items", []):
        local_ref = item["local_ref"]
        created_skill = False
        try:
            local_path = path_map.get(local_ref)
            if not local_path:
                raise ValueError("Local path mapping is missing; rescan this Skill")
            package = _build_skill_zip(
                Path(local_path), item["slug"], item["version"], item.get("description")
            )
            try:
                post("/api/skills", json_data={
                    "name": item["name"],
                    "slug": item["slug"],
                    "description": item.get("description"),
                    "visibility": item.get("visibility", "public"),
                })
                created_skill = True
            except SystemExit as exc:
                if "Slug already taken" not in str(exc):
                    raise
            form = {"version": item["version"]}
            if item.get("changelog"):
                form["changelog"] = item["changelog"]
            post(
                f"/api/skills/by-slug/{item['slug']}/versions",
                files={"file": (f"{item['slug']}.zip", package, "application/zip")},
                data=form,
                params={"owner": owner} if owner else None,
            )
            results.append({"local_ref": local_ref, "status": "completed"})
            rprint(f"[green]Published:[/green] {item['slug']} {item['version']} (pending review)")
        except (Exception, SystemExit) as exc:
            message = str(exc) or exc.__class__.__name__
            if created_skill:
                try:
                    delete(f"/api/skills/by-slug/{item['slug']}", params={"owner": owner} if owner else None)
                except (Exception, SystemExit) as cleanup_exc:
                    message = f"{message}; cleanup failed: {cleanup_exc}"
            results.append({"local_ref": local_ref, "status": "failed", "error_message": message[:1000]})
            rprint(f"[red]Failed:[/red] {item.get('slug')} - {message}")
    post(f"/api/local-skills/publish-requests/{request_id}/results", json_data={"items": results})
