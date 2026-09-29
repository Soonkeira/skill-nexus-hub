import os
import sys
import shutil
import subprocess
import traceback
from urllib.parse import urlparse, parse_qs

import typer

from snh import __version__
from snh.commands.auth import init, login, logout, whoami, self_uninstall
from snh.commands.search import search, info
from snh.commands.install import install, update, list_installed, uninstall
from snh.commands.publish import publish, versions
from snh.commands.scan import scan
from snh.commands.local_publish import publish_local_request

app = typer.Typer(name="snh", help="Skill Nexus Hub CLI", no_args_is_help=True)


def show_version(value: bool):
    if value:
        from rich import print as rprint
        rprint(f"snh {__version__}")
        raise typer.Exit()


def version():
    """Show the SNH CLI version."""
    from rich import print as rprint
    rprint(f"snh {__version__}")


@app.callback(invoke_without_command=True)
def main(
    version: bool = typer.Option(False, "--version", "-V", help="Show CLI version", is_eager=True, callback=show_version),
):
    pass


app.command("init")(init)
app.command("login")(login)
app.command("logout")(logout)
app.command("whoami")(whoami)
app.command("version")(version)
app.command("search")(search)
app.command("info")(info)
app.command("install")(install)
app.command("update")(update)
app.command("list")(list_installed)
app.command("uninstall")(uninstall)
app.command("publish")(publish)
app.command("versions")(versions)
app.command("scan")(scan)
app.command("uninstall-cli", help="Uninstall SNH CLI from this computer")(self_uninstall)


def _is_double_click() -> bool:
    """Detect if the exe was launched by double-clicking (no args, frozen, Windows, not already installed)."""
    if not (getattr(sys, "frozen", False) and len(sys.argv) == 1 and sys.platform == "win32"):
        return False
    # If already installed to the expected location, don't re-trigger installer
    install_dir = os.path.join(os.environ.get("LOCALAPPDATA", ""), "snh")
    exe_in_install_dir = os.path.join(install_dir, "snh.exe")
    if os.path.normcase(os.path.normpath(sys.executable)) == os.path.normcase(os.path.normpath(exe_in_install_dir)):
        return False
    return True


def _install_to_path():
    """Copy snh.exe to a permanent location and add to user PATH."""
    from rich import print as rprint

    install_dir = os.path.join(os.environ.get("LOCALAPPDATA", ""), "snh")
    exe_src = sys.executable
    exe_dst = os.path.join(install_dir, "snh.exe")

    # Copy conf file next to the exe if it exists
    conf_src = os.path.join(os.path.dirname(exe_src), "snh.conf")
    conf_dst = os.path.join(install_dir, "snh.conf")

    rprint("[bold cyan]Skill Nexus Hub CLI Installer[/bold cyan]\n")

    # Create install directory
    os.makedirs(install_dir, exist_ok=True)

    # Copy exe
    shutil.copy2(exe_src, exe_dst)
    rprint(f"[green]Installed to:[/green] {exe_dst}")

    # Copy conf if exists
    if os.path.exists(conf_src):
        shutil.copy2(conf_src, conf_dst)
        rprint(f"[green]Config copied:[/green] {conf_dst}")

    # Add to user PATH via registry (persistent)
    try:
        result = subprocess.run(
            ["powershell", "-Command",
             f'[Environment]::GetEnvironmentVariable("Path", "User")'],
            capture_output=True, text=True
        )
        current_path = result.stdout.strip()

        if install_dir.lower() not in current_path.lower():
            new_path = f"{current_path};{install_dir}" if current_path else install_dir
            subprocess.run(
                ["powershell", "-Command",
                 f'[Environment]::SetEnvironmentVariable("Path", "{new_path}", "User")'],
                capture_output=True
            )
            rprint(f"[green]Added to PATH:[/green] {install_dir}")
        else:
            rprint(f"[dim]Already in PATH.[/dim]")

        # Also add to current session PATH
        os.environ["PATH"] = f"{os.environ.get('PATH', '')};{install_dir}"
    except Exception as e:
        rprint(f"[yellow]Could not update PATH automatically: {e}[/yellow]")
        rprint(f"[yellow]Please manually add {install_dir} to your system PATH.[/yellow]")

    # Register snh:// protocol handler
    try:
        subprocess.run(
            ["powershell", "-Command",
             f"""
             New-Item -Path 'HKCU:\\SOFTWARE\\Classes\\snh' -Force | Out-Null
             Set-ItemProperty -Path 'HKCU:\\SOFTWARE\\Classes\\snh' -Name '(Default)' -Value 'URL:Skill Nexus Hub'
             Set-ItemProperty -Path 'HKCU:\\SOFTWARE\\Classes\\snh' -Name 'URL Protocol' -Value ''
             New-Item -Path 'HKCU:\\SOFTWARE\\Classes\\snh\\shell\\open\\command' -Force | Out-Null
             Set-ItemProperty -Path 'HKCU:\\SOFTWARE\\Classes\\snh\\shell\\open\\command' -Name '(Default)' -Value '"{exe_dst}" "%1"'
             """],
            capture_output=True
        )
        rprint("[green]Registered snh:// protocol handler.[/green]")
    except Exception as e:
        rprint(f"[yellow]Could not register protocol handler: {e}[/yellow]")

    rprint("\n[bold green]Installation complete![/bold green]")
    rprint("\nYou can now use [bold]snh[/bold] from any terminal:")
    rprint("  [cyan]snh login[/cyan]       - Login to the server")
    rprint("  [cyan]snh search[/cyan]      - Search skills")
    rprint("  [cyan]snh install <name>[/cyan] - Install a skill")
    rprint("\n[dim]Press Enter to exit...[/dim]")
    input()


def _handle_protocol(url: str):
    """Handle snh:// protocol URL from browser."""
    from rich import print as rprint
    from snh.config import save_token, save_server

    parsed = urlparse(url)
    params = parse_qs(parsed.query)

    command = parsed.hostname
    if command not in ("install", "scan", "publish-local"):
        rprint(f"[red]Unknown protocol command: {parsed.hostname}[/red]")
        raise SystemExit(1)

    jwt_token = params.get("token", [None])[0]
    server = params.get("server", [None])[0]

    if not jwt_token or not server:
        rprint("[red]Missing required parameters (token, server).[/red]")
        raise SystemExit(1)

    save_server(server)

    # Exchange short-lived web JWT for a long-lived CLI token.
    import httpx
    cli_token = None
    try:
        resp = httpx.post(
            f"{server.rstrip('/')}/api/auth/cli-token",
            headers={"Authorization": f"Bearer {jwt_token}"},
            timeout=15,
            trust_env=False,
        )
        if resp.status_code == 200:
            cli_token = resp.json().get("token")
    except (httpx.ConnectError, httpx.TimeoutException, httpx.NetworkError):
        rprint("[red]无法连接到服务器，请确认您当前在内网环境下使用。如需外网访问，请先连接公司 VPN。[/red]")
        raise SystemExit(1)

    if not cli_token:
        rprint("[red]Token exchange failed. Please try again from the web.[/red]")
        raise SystemExit(1)

    save_token(cli_token)
    rprint("[green]CLI token saved.[/green]")

    if command == "scan":
        custom_paths = params.get("path", [])
        rprint("\n[cyan]Scanning local Skill directories and uploading results...[/cyan]")
        scan(upload=True, paths=custom_paths)
        rprint("\n[dim]Press Enter to exit...[/dim]")
        input()
        return

    if command == "publish-local":
        request_id = params.get("request", [None])[0]
        if not request_id:
            rprint("[red]Missing required parameter (request).[/red]")
            raise SystemExit(1)
        rprint("\n[cyan]Packaging and publishing selected local Skills...[/cyan]")
        publish_local_request(request_id)
        rprint("\n[dim]Press Enter to exit...[/dim]")
        input()
        return

    owner = params.get("owner", [None])[0]
    slug = params.get("slug", [None])[0]
    target = params.get("target", [None])[0]
    custom_path = params.get("path", [None])[0]
    project = params.get("project", ["0"])[0] in ("1", "true", "True", "yes")

    if not slug or not (target or custom_path):
        rprint("[red]Missing required parameters (slug, target).[/red]")
        raise SystemExit(1)

    # Execute install
    install_slug = f"{owner}/{slug}" if owner else slug
    rprint(f"\nInstalling [cyan]{install_slug}[/cyan] to [cyan]{target or custom_path}[/cyan]...")
    install(slug=install_slug, target=target, project=project, custom_path=custom_path)

    rprint("\n[dim]Press Enter to exit...[/dim]")
    input()


def _pause_after_protocol_error():
    if sys.platform != "win32":
        return
    try:
        input("\nPress Enter to exit...")
    except EOFError:
        pass


if __name__ == "__main__":
    if _is_double_click():
        _install_to_path()
    else:
        # Check for protocol URL argument
        arg = sys.argv[1] if len(sys.argv) > 1 else None
        if arg and arg.startswith("snh://"):
            try:
                _handle_protocol(arg)
            except SystemExit as e:
                if getattr(e, "code", 1) not in (0, None):
                    _pause_after_protocol_error()
                raise
            except Exception:
                traceback.print_exc()
                _pause_after_protocol_error()
                raise
        else:
            app()
