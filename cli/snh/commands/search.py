import typer
from rich import print as rprint
from rich.table import Table
from snh.client import get


def _parse_slug(slug: str) -> tuple[str | None, str]:
    """Parse 'owner/slug' or plain 'slug' format. Returns (owner, slug)."""
    if "/" in slug:
        parts = slug.split("/", 1)
        return parts[0], parts[1]
    return None, slug


def search(keyword: str = typer.Argument(help="Search keyword")):
    """Search skills."""
    data = get("/api/skills", params={"q": keyword, "page_size": 20})
    table = Table(title="Search Results")
    table.add_column("Owner", style="dim")
    table.add_column("Slug", style="cyan")
    table.add_column("Name")
    table.add_column("Downloads", justify="right")
    for item in data.get("items", []):
        owner = item.get("owner_name") or "-"
        table.add_row(owner, item["slug"], item["name"], str(item.get("download_count", 0)))
    rprint(table)


def info(slug: str = typer.Argument(help="Skill slug (owner/slug or just slug)")):
    """Show skill details."""
    owner, slug_only = _parse_slug(slug)
    params = {}
    if owner:
        params["owner"] = owner
    data = get(f"/api/skills/by-slug/{slug_only}", params=params or None)
    rprint(f"[bold cyan]{data['name']}[/bold cyan]")
    display = f"{owner}/{slug_only}" if owner else slug_only
    rprint(f"Slug: {display}")
    rprint(f"Owner: {data.get('owner_name', '-')}")
    rprint(f"Description: {data.get('description', '-')}")
    tags = data.get("tags") or []
    rprint(f"Tags: {', '.join(tags) if tags else '-'}")
    rprint(f"Downloads: {data.get('download_count', 0)}")

    # Show versions
    versions = data.get("versions") or []
    if versions:
        rprint("\nVersions:")
        for v in versions:
            status_str = v.get("status", "?")
            rprint(f"  {v['version']} ({status_str})")
