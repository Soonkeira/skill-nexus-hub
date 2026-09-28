import json
import os
import zipfile
from io import BytesIO

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse

from app.config import settings

router = APIRouter(prefix="/api/cli", tags=["cli"])

PLATFORM_FILES = {
    "windows": "snh.exe",
    "darwin": "snh-macos",
    "linux": "snh-linux",
}


@router.get("/download/{platform}")
async def download_cli(platform: str, request: Request):
    filename = PLATFORM_FILES.get(platform)
    if not filename:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported platform: {platform}. Supported: {', '.join(PLATFORM_FILES.keys())}",
        )
    path = os.path.join(settings.cli_dir, filename)
    if not os.path.exists(path):
        raise HTTPException(
            status_code=404,
            detail="CLI binary not found on server. Build and deploy first.",
        )

    # Determine server base URL from the request
    # Check X-Forwarded-Host first (set by Next.js proxy), then fall back
    host = (
        request.headers.get("x-forwarded-host")
        or request.headers.get("x-original-host")
        or request.headers.get("host", request.url.hostname or "localhost")
    )
    forwarded_proto = request.headers.get("x-forwarded-proto")
    scheme = forwarded_proto or request.url.scheme or "http"
    server_url = f"{scheme}://{host}"

    # Build a zip containing the binary + snh.conf with pre-configured server.
    # ZIP_DEFLATED with a pre-buffered archive; stream the buffer back so we
    # don't double the payload in memory (zip_buf + response copy).
    conf_content = json.dumps({"server": server_url}, indent=2)

    zip_buf = BytesIO()
    with zipfile.ZipFile(zip_buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.write(path, filename)
        zf.writestr("snh.conf", conf_content)

    total = zip_buf.tell()
    zip_buf.seek(0)

    def iterate() -> bytes:
        while True:
            chunk = zip_buf.read(1024 * 1024)
            if not chunk:
                break
            yield chunk

    zip_name = f"snh-{platform}.zip"
    return StreamingResponse(
        iterate(),
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="{zip_name}"',
            "Content-Length": str(total),
        },
    )
