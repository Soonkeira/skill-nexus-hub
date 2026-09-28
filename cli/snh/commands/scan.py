import os
import uuid
import hashlib

import typer
from rich import print as rprint
from rich.table import Table

from snh.client import get, post
from snh.config import load_config, save_config, save_scan_map


SKILL_MARKERS = ["SKILL.md", "skill.yaml", "skill.yml", ".skill"]
MAX_FILES_PER_SKILL = 100
MAX_SIZE_PER_SKILL = 10 * 1024 * 1024  # 10MB
MAX_SCAN_DEPTH = 2


def _has_root_skill_marker(directory: str) -> bool:
    try:
        entries = set(os.listdir(directory))
    except OSError:
        return False
    return any(marker in entries for marker in SKILL_MARKERS)


def _local_ref(path: str) -> str:
    normalized = os.path.normcase(os.path.realpath(path))
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()[:32]


def _ensure_device_id() -> str:
    """Get or create device_id."""
    cfg = load_config()
    device_id = cfg.get("device_id")
    if not device_id:
        device_id = str(uuid.uuid4())
        cfg["device_id"] = device_id
        save_config(cfg)
    return device_id


def _detect_skill(directory: str) -> dict | None:
    """Check if a directory looks like a skill. Return metadata or None."""
    has_skill_md = False
    has_skill_yaml = False
    files = []
    total_size = 0

    for root, dirs, filenames in os.walk(directory):
        depth = root.replace(directory, "").count(os.sep)
        if depth >= MAX_SCAN_DEPTH:
            dirs.clear()
            continue
        for fname in filenames:
            fpath = os.path.join(root, fname)
            try:
                fsize = os.path.getsize(fpath)
            except OSError:
                continue
            rel = os.path.relpath(fpath, directory)
            if fname == "SKILL.md":
                has_skill_md = True
            if fname in ("skill.yaml", "skill.yml"):
                has_skill_yaml = True
            files.append(rel)
            total_size += fsize
            if len(files) >= MAX_FILES_PER_SKILL or total_size >= MAX_SIZE_PER_SKILL:
                break

    if not has_skill_md and not has_skill_yaml:
        try:
            entries = os.listdir(directory)
        except OSError:
            return None
        if ".skill" not in entries:
            return None

    dirname = os.path.basename(directory)
    return {
        "skill_name": dirname.replace("-", " ").replace("_", " ").title(),
        "skill_slug": dirname,
        "relative_directory": "",
        "has_skill_md": has_skill_md,
        "has_skill_yaml": has_skill_yaml,
        "file_count": len(files),
        "total_size": total_size,
        "files": files,
    }


def scan(
    upload: bool = typer.Option(False, "--upload", help="Upload scan results to server"),
    paths: list[str] | None = typer.Option(None, "--path", help="Additional Skill directory to scan (repeatable)"),
):
    """Scan local skill directories and optionally upload results."""
    custom_paths = paths or []
    # Get install targets from server
    try:
        targets = get("/api/skills/install-targets")
    except SystemExit:
        if not custom_paths:
            rprint("[red]Cannot connect to server. Run 'snh login' first.[/red]")
            raise typer.Exit(1)
        targets = []

    if not targets and not custom_paths:
        rprint("[yellow]No install targets configured on server.[/yellow]")
        return

    # Collect unique scan paths
    seen_paths = set()
    scan_paths = []  # list of (real_path, target_name)
    for t in targets:
        for path_key in ("global_path", "project_path"):
            p = t.get(path_key)
            if not p:
                continue
            expanded = os.path.expanduser(p)
            real = os.path.realpath(expanded)
            if real in seen_paths:
                continue
            if not os.path.isdir(real):
                continue
            seen_paths.add(real)
            scan_paths.append((real, t["name"]))

    for path in custom_paths:
        expanded = os.path.expandvars(os.path.expanduser(path.strip().strip('"')))
        real = os.path.realpath(expanded)
        if real in seen_paths:
            continue
        if not os.path.isdir(real):
            rprint(f"[yellow]Custom path does not exist, skipping: {real}[/yellow]")
            continue
        seen_paths.add(real)
        scan_paths.append((real, "custom"))

    if not scan_paths:
        rprint("[yellow]No valid skill directories found on this machine.[/yellow]")
        return

    # Scan each path
    all_skills = []
    path_map = {}
    for scan_dir, target_name in scan_paths:
        rprint(f"Scanning [dim]{scan_dir}[/dim] ({target_name})...")
        direct_skill = _detect_skill(scan_dir) if target_name == "custom" and _has_root_skill_marker(scan_dir) else None
        if direct_skill:
            direct_skill["local_ref"] = _local_ref(scan_dir)
            path_map[direct_skill["local_ref"]] = scan_dir
            direct_skill["agent_target"] = target_name
            direct_skill["relative_directory"] = os.path.basename(scan_dir)
            all_skills.append(direct_skill)
            rprint(f"  [green]Found:[/green] {direct_skill['skill_name']} ({direct_skill['file_count']} files)")
            continue
        try:
            entries = sorted(os.listdir(scan_dir))
        except PermissionError:
            rprint("  [yellow]Permission denied, skipping.[/yellow]")
            continue

        for entry in entries:
            full = os.path.join(scan_dir, entry)
            if not os.path.isdir(full):
                continue
            if os.path.realpath(full) != full and os.path.realpath(full) in seen_paths:
                continue  # skip symlink loops
            skill = _detect_skill(full)
            if skill:
                skill["local_ref"] = _local_ref(full)
                path_map[skill["local_ref"]] = full
                skill["agent_target"] = target_name
                skill["relative_directory"] = os.path.relpath(full, scan_dir)
                all_skills.append(skill)
                rprint(f"  [green]Found:[/green] {skill['skill_name']} ({skill['file_count']} files)")

    if not all_skills:
        rprint("[dim]No skills found in any scan directory.[/dim]")
        return


    save_scan_map(path_map)

    rprint(f"\nFound [cyan]{len(all_skills)}[/cyan] skill(s) across {len(scan_paths)} director(ies).")

    if upload:
        device_id = _ensure_device_id()
        import platform

        device_name = platform.node()
        payload = {
            "device_id": device_id,
            "device_name": device_name,
            "skills": all_skills,
        }
        resp = post("/api/local-skills/report", json_data=payload)
        rprint(
            f"[green]Uploaded scan results. scan_id: {resp.get('scan_id')} ({resp.get('skill_count')} skills)[/green]"
        )
    else:
        # Show results locally
        table = Table(title="Local Skills")
        table.add_column("Name", style="cyan")
        table.add_column("Slug")
        table.add_column("Target")
        table.add_column("Files", justify="right")
        table.add_column("Size", justify="right")
        for s in all_skills:
            if s["total_size"] < 1024 * 1024:
                size_str = f"{s['total_size'] / 1024:.1f}KB"
            else:
                size_str = f"{s['total_size'] / (1024*1024):.1f}MB"
            table.add_row(
                s["skill_name"],
                s["skill_slug"],
                s.get("agent_target", "-"),
                str(s["file_count"]),
                size_str,
            )
        rprint(table)
        rprint("\n[dim]Use --upload to sync results to the server.[/dim]")
