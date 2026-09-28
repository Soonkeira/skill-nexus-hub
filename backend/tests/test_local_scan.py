"""Tests for local scan models and schemas."""
import uuid

import pytest

from app.schemas.local_scan import (
    ScanReportRequest,
    ScanReportSkill,
    ScanReportResponse,
    LocalSkillReportResponse,
    DeviceResponse,
)


class TestScanSchemas:
    """Tests for local scan Pydantic schemas."""

    def test_scan_report_skill_defaults(self):
        skill = ScanReportSkill(
            skill_name="Test Skill",
            skill_slug="test-skill",
            relative_directory="test-skill/",
        )
        assert skill.has_skill_md is False
        assert skill.has_skill_yaml is False
        assert skill.file_count == 0
        assert skill.total_size == 0
        assert skill.agent_target is None

    def test_scan_report_skill_validation(self):
        # Name too long
        with pytest.raises(Exception):
            ScanReportSkill(
                skill_name="x" * 200,
                skill_slug="test",
                relative_directory="test/",
            )

    def test_scan_report_request_min_skills(self):
        with pytest.raises(Exception):
            ScanReportRequest(
                device_id="dev1",
                skills=[],  # min_length=1
            )

    def test_scan_report_response(self):
        resp = ScanReportResponse(
            scan_id=uuid.uuid4(),
            skill_count=5,
        )
        assert resp.skill_count == 5

    def test_device_response(self):
        from datetime import datetime, timezone
        resp = DeviceResponse(
            device_id="dev-123",
            device_name="PC-01",
            last_scanned_at=datetime.now(timezone.utc),
            skill_count=3,
        )
        assert resp.device_id == "dev-123"

    def test_local_skill_report_with_device_id(self):
        from datetime import datetime, timezone
        resp = LocalSkillReportResponse(
            id=uuid.uuid4(),
            skill_name="Test",
            skill_slug="test",
            relative_directory="test/",
            agent_target="cursor",
            device_id="dev-456",
            has_skill_md=True,
            has_skill_yaml=False,
            file_count=5,
            total_size=1024,
            detected_at=datetime.now(timezone.utc),
        )
        assert resp.device_id == "dev-456"


class TestLLMProviderSchemas:
    """Tests for LLM provider schemas."""

    def test_provider_create_validates_type(self):
        from app.schemas.llm_provider import LLMProviderCreate
        # Valid
        p = LLMProviderCreate(
            name="Test",
            provider_type="openai",
            base_url="https://api.openai.com/v1",
            model_name="gpt-4o",
            api_key="sk-test-key",
        )
        assert p.provider_type == "openai"

        # Invalid type
        with pytest.raises(Exception):
            LLMProviderCreate(
                name="Test",
                provider_type="invalid",
                base_url="https://test.com",
                model_name="test",
                api_key="sk-test-key",
            )

    def test_analysis_response_includes_ai_flag(self):
        from app.schemas.llm_provider import SkillAnalysisResponse
        from datetime import datetime, timezone
        resp = SkillAnalysisResponse(
            id=uuid.uuid4(),
            skill_id=uuid.uuid4(),
            version_id=uuid.uuid4(),
            status="completed",
            created_at=datetime.now(timezone.utc),
        )
        assert resp.is_ai_generated is True
