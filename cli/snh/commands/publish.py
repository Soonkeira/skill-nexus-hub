import os

import typer
from rich import print as rprint
from rich.table import Table

from snh.client import get, post


def publish(
    slug: str = typer.Argument(help="Skill slug"),
    version: str = typer.Option(..., "--version", "-v", help="Version string (e.g. v1.0.0)"),
    file: str = typer.Option(..., "--file", "-f", help="ZIP file path"),
    changelog: str = typer.Option("", "--changelog", "-c", help="Changelog"),
):
    """Publish a new version."""
    with open(file, "rb") as f:
        file_content = f.read()

    form_data = {"version": version}
    if changelog:
        form_data["changelog"] = changelog

    owner = get("/api/auth/me").get("username")

    resp = post(
        f"/api/skills/by-slug/{slug}/versions",
        files={"file": (os.path.basename(file), file_content)},
        data=form_data,
        params={"owner": owner} if owner else None,
    )
    rprint(f"[green]Published v{resp.get('version', '?')} - status: {resp.get('status', '?')}[/green]")


def versions(
    slug: str = typer.Argument(None, help="Skill slug (omit to list all installed)"),
):
    """Show version history of a skill, or list all installed skills with their versions."""
    if slug:
        # Show remote version history for a specific skill
        data = get(f"/api/skills/by-slug/{slug}/versions")
        table = Table(title=f"Versions: {slug}")
        table.add_column("Version", style="cyan")
        table.add_column("Status")
        table.add_column("Changelog")
        table.add_column("Created")
        for v in data.get("items", []):
            table.add_row(
                v["version"],
                v["status"],
                v.get("changelog", "-") or "-",
                v["created_at"][:10],
            )
        rprint(table)
    else:
        # List all installed skills with local + remote latest version
        from snh.config import load_installed

        installed = load_installed()
        if not installed.get("skills"):
            rprint("[dim]No skills installed.[/dim]")
            return

        # Collect unique slugs for batch query
        entries = list(installed["skills"].values())
        slugs = list({e["slug"] for e in entries})

        # Batch query latest versions from server
        latest = {}
        if slugs:
            try:
                resp = get("/api/skills/latest-versions", params={"slugs": ",".join(slugs)})
                latest = resp.get("items", {})
            except SystemExit:
                pass  # Server unreachable, show local only

        table = Table(title="Installed Skills")
        table.add_column("Skill", style="cyan")
        table.add_column("Local Version")
        table.add_column("Target")
        table.add_column("Latest")
        for entry in entries:
            display = f"{entry.get('owner', '')}/{entry['slug']}" if entry.get("owner") else entry["slug"]
            local_ver = entry.get("version", "?")
            target = entry.get("target", "-")
            slug_key = entry["slug"]
            remote = latest.get(slug_key, {})
            latest_ver = remote.get("version", "-")
            table.add_row(display, local_ver, target, latest_ver)
        rprint(table)
