import os
import shutil
import subprocess
import sys

import typer
from rich import print as rprint
from snh.client import post
from snh.config import load_config, save_config, CONFIG_DIR


INSTALL_DIR = os.path.join(os.environ.get("LOCALAPPDATA", ""), "snh")


def init(server: str = typer.Option(..., "--server", "-s", help="Server URL")):
    """Initialize SNH CLI with server URL."""
    cfg = load_config()
    cfg["server"] = server
    save_config(cfg)
    rprint(f"[green]Configured server: {server}[/green]")


def login(
    username: str = typer.Option(..., prompt=True),
    password: str = typer.Option(..., prompt=True, hide_input=True),
):
    """Login to the server."""
    data = post("/api/auth/login", json_data={"username": username, "password": password})
    cfg = load_config()
    cfg["token"] = data["access_token"]
    save_config(cfg)
    rprint("[green]Login successful![/green]")


def logout():
    """Logout."""
    cfg = load_config()
    cfg.pop("token", None)
    save_config(cfg)
    rprint("[green]Logged out.[/green]")


def whoami():
    """Show current user."""
    from snh.client import get
    data = get("/api/auth/me")
    rprint(f"[bold]{data['username']}[/bold] ({data['role']})")


def self_uninstall(
    confirm: bool = typer.Option(False, "--yes", "-y", help="Skip confirmation prompt"),
):
    """Uninstall SNH CLI completely: remove program files, config, and PATH entry."""
    if not confirm:
        rprint("[yellow]This will completely remove SNH CLI, all configuration and installed skills.[/yellow]")
        typer.confirm("Are you sure?", abort=True)

    errors = []

    # 1. Remove install directory (exe + snh.conf)
    exe_path = os.path.join(INSTALL_DIR, "snh.exe")
    running_ourselves = os.path.isfile(exe_path) and os.path.samefile(exe_path, sys.executable)
    if os.path.isdir(INSTALL_DIR):
        try:
            if running_ourselves:
                # Delete everything except the running exe
                for item in os.listdir(INSTALL_DIR):
                    item_path = os.path.join(INSTALL_DIR, item)
                    if os.path.normcase(item_path) != os.path.normcase(exe_path):
                        if os.path.isdir(item_path):
                            shutil.rmtree(item_path)
                        else:
                            os.remove(item_path)
                # Schedule delayed self-delete via cmd
                subprocess.Popen(
                    ["cmd", "/c", f'ping -n 3 127.0.0.1 >nul & rd /s /q "{INSTALL_DIR}"'],
                    creationflags=subprocess.CREATE_NO_WINDOW,
                )
                rprint(f"[green]Program files will be removed after exit.[/green]")
            else:
                shutil.rmtree(INSTALL_DIR)
                rprint(f"[green]Removed program files:[/green] {INSTALL_DIR}")
        except Exception as e:
            errors.append(f"Could not remove {INSTALL_DIR}: {e}")
            rprint(f"[red]Failed to remove {INSTALL_DIR}: {e}[/red]")
    else:
        rprint(f"[dim]Program directory not found: {INSTALL_DIR}[/dim]")

    # 2. Remove config directory (~/.snh)
    if CONFIG_DIR.exists():
        try:
            shutil.rmtree(CONFIG_DIR)
            rprint(f"[green]Removed config directory:[/green] {CONFIG_DIR}")
        except Exception as e:
            errors.append(f"Could not remove {CONFIG_DIR}: {e}")
            rprint(f"[red]Failed to remove {CONFIG_DIR}: {e}[/red]")
    else:
        rprint(f"[dim]Config directory not found.[/dim]")

    # 3. Remove from user PATH
    try:
        result = subprocess.run(
            ["powershell", "-Command",
             '[Environment]::GetEnvironmentVariable("Path", "User")'],
            capture_output=True, text=True
        )
        current_path = result.stdout.strip()
        if INSTALL_DIR.lower() in current_path.lower():
            # Remove the install dir from PATH
            parts = [p for p in current_path.split(";") if p.strip().lower() != INSTALL_DIR.lower()]
            new_path = ";".join(parts)
            subprocess.run(
                ["powershell", "-Command",
                 f'[Environment]::SetEnvironmentVariable("Path", "{new_path}", "User")'],
                capture_output=True
            )
            rprint(f"[green]Removed from PATH.[/green]")
        else:
            rprint(f"[dim]Not found in PATH.[/dim]")
    except Exception as e:
        errors.append(f"Could not update PATH: {e}")
        rprint(f"[yellow]Could not clean PATH: {e}[/yellow]")

    # 4. Remove snh:// protocol handler from registry
    try:
        reg_result = subprocess.run(
            ["powershell", "-Command",
             "if (Test-Path 'HKCU:\\SOFTWARE\\Classes\\snh') { Remove-Item -Path 'HKCU:\\SOFTWARE\\Classes\\snh' -Recurse -Force; Write-Output 'removed' } else { Write-Output 'not_found' }"],
            capture_output=True, text=True
        )
        if reg_result.stdout.strip() == "removed":
            rprint("[green]Removed snh:// protocol handler.[/green]")
        else:
            rprint("[dim]snh:// protocol handler not registered.[/dim]")
    except Exception as e:
        errors.append(f"Could not remove protocol handler: {e}")
        rprint(f"[yellow]Could not remove protocol handler: {e}[/yellow]")

    # Summary
    if errors:
        rprint(f"\n[yellow]Uninstall completed with {len(errors)} warning(s).[/yellow]")
        rprint("[yellow]You may need to manually delete remaining files.[/yellow]")
    else:
        rprint("\n[green]SNH CLI has been completely uninstalled.[/green]")

    rprint("[dim]Please close this window and delete snh.exe if it still exists.[/dim]")
