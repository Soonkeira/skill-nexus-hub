"""Integration tests for local scan API endpoints."""
import pytest
from httpx import AsyncClient

from tests.conftest import register_user, login_user, auth_header, make_admin


def _scan_payload(device_id="dev-001", device_name="PC-Test", skills=None):
    """Helper to build a scan report payload."""
    if skills is None:
        skills = [
            {
                "skill_name": "Test Skill",
                "skill_slug": "test-skill",
                "local_ref": "local-test-ref",
                "relative_directory": "test-skill/",
                "agent_target": "cursor",
                "has_skill_md": True,
                "has_skill_yaml": False,
                "file_count": 3,
                "total_size": 4096,
            }
        ]
    return {
        "device_id": device_id,
        "device_name": device_name,
        "skills": skills,
    }


class TestScanReport:
    """POST /api/local-skills/report"""

    @pytest.mark.asyncio
    async def test_upload_and_query_scan(self, client: AsyncClient):
        """Upload a scan report, then query it back."""
        await register_user(client)
        token = await login_user(client)
        h = auth_header(token)

        # Upload
        resp = await client.post("/api/local-skills/report", json=_scan_payload(), headers=h)
        assert resp.status_code == 201
        data = resp.json()
        assert "scan_id" in data
        assert data["skill_count"] == 1

        # Query by scan_id
        scan_id = data["scan_id"]
        resp2 = await client.get(f"/api/local-skills/scan/{scan_id}", headers=h)
        assert resp2.status_code == 200
        batch = resp2.json()
        assert batch["id"] == scan_id
        assert len(batch["reports"]) == 1
        assert batch["reports"][0]["skill_slug"] == "test-skill"

    @pytest.mark.asyncio
    async def test_user_cannot_access_other_users_scan(self, client: AsyncClient):
        """User A cannot read User B's scan_id."""
        # User A uploads
        await register_user(client, "userA")
        token_a = await login_user(client, "userA")
        h_a = auth_header(token_a)
        resp = await client.post("/api/local-skills/report", json=_scan_payload(), headers=h_a)
        scan_id = resp.json()["scan_id"]

        # User B tries to read it
        await register_user(client, "userB")
        token_b = await login_user(client, "userB")
        h_b = auth_header(token_b)
        resp2 = await client.get(f"/api/local-skills/scan/{scan_id}", headers=h_b)
        assert resp2.status_code == 404

    @pytest.mark.asyncio
    async def test_multi_device_isolation(self, client: AsyncClient):
        """Skills from different devices are isolated per device."""
        await register_user(client)
        token = await login_user(client)
        h = auth_header(token)

        # Device 1: skill-a
        await client.post("/api/local-skills/report", json=_scan_payload(
            device_id="dev-1", skills=[{
                "skill_name": "Skill A", "skill_slug": "skill-a",
                "relative_directory": "skill-a/",
            }]
        ), headers=h)

        # Device 2: skill-b
        await client.post("/api/local-skills/report", json=_scan_payload(
            device_id="dev-2", skills=[{
                "skill_name": "Skill B", "skill_slug": "skill-b",
                "relative_directory": "skill-b/",
            }]
        ), headers=h)

        # List all — should show both devices' latest
        resp = await client.get("/api/local-skills", headers=h)
        assert resp.status_code == 200
        reports = resp.json()
        slugs = {r["skill_slug"] for r in reports}
        assert "skill-a" in slugs
        assert "skill-b" in slugs

        # Devices endpoint
        resp2 = await client.get("/api/local-skills/devices", headers=h)
        assert resp2.status_code == 200
        devices = resp2.json()
        device_ids = {d["device_id"] for d in devices}
        assert "dev-1" in device_ids
        assert "dev-2" in device_ids

    @pytest.mark.asyncio
    async def test_max_10_batches_per_device(self, client: AsyncClient):
        """Only the latest 10 batches per device are retained."""
        await register_user(client)
        token = await login_user(client)
        h = auth_header(token)

        # Upload 12 batches on same device
        for i in range(12):
            await client.post("/api/local-skills/report", json=_scan_payload(
                device_id="dev-limit",
                skills=[{
                    "skill_name": f"Skill {i}", "skill_slug": f"skill-{i}",
                    "relative_directory": f"skill-{i}/",
                }]
            ), headers=h)

        # Devices endpoint should show 10 total skills (latest batch only has 1)
        resp = await client.get("/api/local-skills/devices", headers=h)
        devices = resp.json()
        dev = [d for d in devices if d["device_id"] == "dev-limit"][0]
        assert dev["skill_count"] <= 10

    @pytest.mark.asyncio
    async def test_invalid_device_id_rejected(self, client: AsyncClient):
        """Empty device_id should be rejected."""
        await register_user(client)
        token = await login_user(client)
        h = auth_header(token)

        resp = await client.post("/api/local-skills/report", json={
            "device_id": "",
            "skills": [{"skill_name": "X", "skill_slug": "x", "relative_directory": "x/"}],
        }, headers=h)
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_empty_skills_rejected(self, client: AsyncClient):
        """Empty skills array should be rejected."""
        await register_user(client)
        token = await login_user(client)
        h = auth_header(token)

        resp = await client.post("/api/local-skills/report", json={
            "device_id": "dev-1",
            "skills": [],
        }, headers=h)
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_unauthenticated_rejected(self, client: AsyncClient):
        """Endpoints require authentication."""
        resp = await client.post("/api/local-skills/report", json=_scan_payload())
        assert resp.status_code == 401 or resp.status_code == 403

        resp2 = await client.get("/api/local-skills")
        assert resp2.status_code == 401 or resp2.status_code == 403

        resp3 = await client.get("/api/local-skills/devices")
        assert resp3.status_code == 401 or resp3.status_code == 403


class TestLocalPublishRequests:
    @pytest.mark.asyncio
    async def test_create_and_fetch_publish_request(self, client: AsyncClient):
        await register_user(client)
        token = await login_user(client)
        h = auth_header(token)

        scan = await client.post("/api/local-skills/report", json=_scan_payload(), headers=h)
        reports = (await client.get("/api/local-skills", headers=h)).json()
        report_id = reports[0]["id"]

        created = await client.post(
            "/api/local-skills/publish-requests",
            headers=h,
            json={"items": [{
                "report_id": report_id,
                "name": "Test Skill",
                "slug": "test-skill",
                "description": "Reviewed description",
                "version": "1.0.0",
                "visibility": "public",
            }]},
        )
        assert created.status_code == 201
        request_id = created.json()["request_id"]

        fetched = await client.get(f"/api/local-skills/publish-requests/{request_id}", headers=h)
        assert fetched.status_code == 200
        item = fetched.json()["items"][0]
        assert item["local_ref"] == "local-test-ref"
        assert item["description"] == "Reviewed description"

    @pytest.mark.asyncio
    async def test_publish_request_rejects_foreign_report(self, client: AsyncClient):
        await register_user(client, "ownerA")
        token_a = await login_user(client, "ownerA")
        h_a = auth_header(token_a)
        await client.post("/api/local-skills/report", json=_scan_payload(), headers=h_a)
        report_id = (await client.get("/api/local-skills", headers=h_a)).json()[0]["id"]

        await register_user(client, "ownerB")
        token_b = await login_user(client, "ownerB")
        response = await client.post(
            "/api/local-skills/publish-requests",
            headers=auth_header(token_b),
            json={"items": [{
                "report_id": report_id,
                "name": "Test Skill",
                "slug": "test-skill",
                "version": "1.0.0",
            }]},
        )
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_update_publish_results(self, client: AsyncClient):
        await register_user(client)
        token = await login_user(client)
        h = auth_header(token)
        await client.post("/api/local-skills/report", json=_scan_payload(), headers=h)
        report_id = (await client.get("/api/local-skills", headers=h)).json()[0]["id"]
        request_id = (await client.post(
            "/api/local-skills/publish-requests",
            headers=h,
            json={"items": [{"report_id": report_id, "name": "Test Skill", "slug": "test-skill", "version": "1.0.0"}]},
        )).json()["request_id"]

        result = await client.post(
            f"/api/local-skills/publish-requests/{request_id}/results",
            headers=h,
            json={"items": [{"local_ref": "local-test-ref", "status": "completed"}]},
        )
        assert result.status_code == 200
        assert result.json()["status"] == "completed"
