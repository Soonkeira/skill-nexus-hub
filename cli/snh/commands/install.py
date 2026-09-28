import os
import io
import shutil
import zipfile
from pathlib import Path

import typer
from typer.models import ArgumentInfo, OptionInfo
from rich import print as rprint

from snh.client import get, download
from snh.config import load_installed, save_installed


def _parse_slug(slug: str) -> tuple[str | None, str]:
    """Parse 'owner/slug' or plain 'slug' format. Returns (owner, slug)."""
    if "/" in slug:
        parts = slug.split("/", 1)
        return parts[0], parts[1]
    return None, slug


def _get_targets() -> list[dict]:
    """Fetch install targets from server."""
    return get("/api/skills/install-targets")


def _resolve_target_path(target_name: str, project: bool = False) -> str:
    """Resolve install path for a given target name."""
    targets = _get_targets()
    for t in targets:
        if t["name"] == target_name:
            path = t["project_path"] if project else t["global_path"]
            if not path:
                scope = "project" if project else "global"
                raise SystemExit(f"Target {target_name} does not define a {scope} install path.")
            return os.path.expanduser(path)
    raise SystemExit(
        f"Unknown target: {target_name}. Run 'snh install <slug>' without --target "
        "to see available targets, or use --path <skills-dir> for a custom agent."
    )


def _normalize_zip_members(zf: zipfile.ZipFile) -> list[tuple[zipfile.ZipInfo, str]]:
    """Return safe relative output paths, stripping a shared top-level folder when present."""
    file_members = [m for m in zf.infolist() if m.filename and not m.is_dir()]
    cleaned_parts: list[tuple[zipfile.ZipInfo, list[str]]] = []

    for member in file_members:
        parts = [part for part in Path(member.filename).parts if part not in ("", ".")]
        if not parts:
            continue
        if any(part == ".." for part in parts):
            raise SystemExit(f"Unsafe path in ZIP: {member.filename}")
        cleaned_parts.append((member, parts))

    if not cleaned_parts:
        return []

    top_levels = {parts[0] for _, parts in cleaned_parts if len(parts) > 1}
    has_root_files = any(len(parts) == 1 for _, parts in cleaned_parts)
    strip_shared_root = not has_root_files and len(top_levels) == 1

    normalized: list[tuple[zipfile.ZipInfo, str]] = []
    for member, parts in cleaned_parts:
        rel_parts = parts[1:] if strip_shared_root and len(parts) > 1 else parts
        if not rel_parts:
            continue
        normalized.append((member, os.path.join(*rel_parts)))

    return normalized


def _safe_output_path(root_dir: str, relative_path: str) -> str:
    root = os.path.realpath(root_dir)
    output = os.path.realpath(os.path.join(root_dir, relative_path))
    if not output.startswith(root + os.sep):
        raise SystemExit(f"Unsafe path in ZIP: {relative_path}")
    return output


def _default_if_typer_info(value, default):
    return default if isinstance(value, (OptionInfo, ArgumentInfo)) else value


def install(
    slug: str = typer.Argument(help="Skill slug (owner/slug or just slug)"),
    target: str = typer.Option(None, "--target", "-t", help="Target tool (e.g. cursor, claude-code)"),
    project: bool = typer.Option(False, "--project", help="Install to project directory instead of global"),
    custom_path: str = typer.Option(None, "--path", help="Custom skills directory for unsupported agents"),
):
    """Install a skill."""
    target = _default_if_typer_info(target, None)
    project = _default_if_typer_info(project, False)
    custom_path = _default_if_typer_info(custom_path, None)

    owner, slug_only = _parse_slug(slug)

    params = {}
    if owner:
        params["owner"] = owner

    # Fetch skill and latest version
    skill = get(f"/api/skills/by-slug/{slug_only}", params=params or None)
    versions = get(f"/api/skills/by-slug/{slug_only}/versions", params={**params, "page_size": 1})
    items = versions.get("items", [])
    if not items:
        rprint("[red]No approved versions available.[/red]")
        raise typer.Exit(1)

    ver = items[0]

    if custom_path and project:
        rprint("[yellow]--project is ignored when --path is provided.[/yellow]")

    # If no target/path specified, show options and prompt
    if not target and not custom_path:
        targets = _get_targets()
        rprint("\nAvailable targets:")
        for i, t in enumerate(targets, 1):
            rprint(f"  {i}. [cyan]{t['name']}[/cyan] - {t['display_name']}")
        rprint("\nFor unsupported agents, use: [cyan]snh install <slug> --path <skills-dir>[/cyan]")
        choice = typer.prompt("Choose target (name or number)", default="1")
        # Check if it's a number
        try:
            idx = int(choice) - 1
            target = targets[idx]["name"]
        except (ValueError, IndexError):
            target = choice

    target_label = target or "custom"
    # Resolve path and install
    if custom_path:
        dest_dir = os.path.abspath(os.path.expanduser(custom_path))
    else:
        dest_dir = _resolve_target_path(target_label, project)
    os.makedirs(dest_dir, exist_ok=True)

    content = download(f"/api/skills/by-slug/{slug_only}/versions/{ver['version']}/download", params=params or None)

    skill_dir = os.path.join(dest_dir, slug_only)
    if os.path.exists(skill_dir):
        shutil.rmtree(skill_dir)
    os.makedirs(skill_dir, exist_ok=True)

    with zipfile.ZipFile(io.BytesIO(content)) as zf:
        for member, relative_path in _normalize_zip_members(zf):
            output_path = _safe_output_path(skill_dir, relative_path)
            os.makedirs(os.path.dirname(output_path), exist_ok=True)
            with zf.open(member) as source, open(output_path, "wb") as dest:
                shutil.copyfileobj(source, dest)

    # Track in installed.json using owner/slug key for uniqueness
    install_key = f"{owner}/{slug_only}" if owner else slug_only
    installed = load_installed()
    installed["skills"][f"{install_key}:{target_label}"] = {
        "slug": slug_only,
        "owner": owner,
        "version": ver["version"],
        "target": target_label,
        "project": project if not custom_path else False,
        "custom_path": dest_dir if custom_path else None,
    }
    save_installed(installed)

    display_name = f"{owner}/{slug_only}" if owner else slug_only
    rprint(f"[green]Installed {display_name} v{ver['version']} to {dest_dir}[/green]")


def update(
    slug: str = typer.Argument(None, help="Skill slug to update, or omit for --all"),
    all: bool = typer.Option(False, "--all", help="Update all installed skills"),
):
    """Update installed skill(s)."""
    installed = load_installed()

    if not installed["skills"]:
        rprint("[dim]No skills installed.[/dim]")
        return

    entries = []
    if all:
        entries = list(installed["skills"].values())
    elif slug:
        owner, slug_only = _parse_slug(slug)
        for v in installed["skills"].values():
            match = v["slug"] == slug_only and (
                owner is None or v.get("owner") == owner
            )
            if match:
                entries = [v]
                break
        if not entries:
            rprint(f"[red]{slug} is not installed.[/red]")
            raise typer.Exit(1)
    else:
        rprint("Specify a slug or use --all")
        raise typer.Exit(1)

    for entry in entries:
        display = f"{entry.get('owner', '')}/{entry['slug']}" if entry.get("owner") else entry["slug"]
        rprint(f"Updating [cyan]{display}[/cyan]...")
        install_key = f"{entry.get('owner', '')}/{entry['slug']}" if entry.get("owner") else entry["slug"]
        install(
            slug=install_key,
            target=entry["target"],
            project=entry.get("project", False),
            custom_path=entry.get("custom_path"),
        )


def list_installed():
    """List installed skills."""
    installed = load_installed()
    if not installed["skills"]:
        rprint("[dim]No skills installed.[/dim]")
        return
    for key, entry in installed["skills"].items():
        display = f"{entry.get('owner', '')}/{entry['slug']}" if entry.get("owner") else entry["slug"]
        suffix = f" ({entry['custom_path']})" if entry.get("custom_path") else ""
        rprint(f"  [cyan]{display}[/cyan] v{entry['version']} -> {entry['target']}{suffix}")


def uninstall(
    slug: str = typer.Argument(help="Skill slug (owner/slug or just slug)"),
    target: str = typer.Option(None, "--target", "-t", help="Target tool"),
):
    """Uninstall a skill."""
    installed = load_installed()
    owner, slug_only = _parse_slug(slug)

    if target:
        install_key = f"{owner}/{slug_only}" if owner else slug_only
        key = f"{install_key}:{target}"
    else:
        # Find first match
        matching = [
            k for k, v in installed["skills"].items()
            if v["slug"] == slug_only and (owner is None or v.get("owner") == owner)
        ]
        if not matching:
            rprint(f"[red]{slug} is not installed.[/red]")
            raise typer.Exit(1)
        key = matching[0]
        target = installed["skills"][key]["target"]

    if key not in installed["skills"]:
        rprint(f"[red]{slug} not installed for {target}.[/red]")
        raise typer.Exit(1)

    entry = installed["skills"][key]
    try:
        dest_dir = entry.get("custom_path") or _resolve_target_path(target, entry.get("project", False))
        skill_dir = os.path.join(dest_dir, slug_only)
        if os.path.exists(skill_dir):
            shutil.rmtree(skill_dir)
    except SystemExit:
        pass  # Target might not exist anymore, still remove from tracking

    del installed["skills"][key]
    save_installed(installed)

    display = f"{owner}/{slug_only}" if owner else slug_only
    rprint(f"[green]Uninstalled {display} from {target}.[/green]")
