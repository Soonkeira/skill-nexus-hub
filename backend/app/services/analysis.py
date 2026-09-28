"""Service for running LLM-based skill analysis."""

from __future__ import annotations

import json
import logging
import re
import uuid
import zipfile
from io import BytesIO

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import async_session
from app.llm.factory import get_adapter
from app.llm.prompts import SYSTEM_PROMPT, build_user_prompt
from app.models.llm_provider import LLMProvider, SkillAnalysis
from app.models.skill import SkillVersion
from app.services import file_storage
from app.services.secret_storage import decrypt_secret
from app.utils.time import utc_now

logger = logging.getLogger(__name__)

# Safety limits for file extraction
ALLOWED_EXTENSIONS = {".md", ".txt", ".yaml", ".yml", ".json", ".toml"}
MAX_FILES = 20
MAX_TOTAL_CHARS = 100_000  # ~100KB text content
MAX_ZIP_DECOMPRESSED_SIZE = 100 * 1024 * 1024  # 100MB total decompressed


def _extract_safe_files(zip_content: bytes) -> dict[str, str]:
    """Extract safe text files from a ZIP for analysis."""
    files: dict[str, str] = {}
    total_chars = 0

    with zipfile.ZipFile(BytesIO(zip_content)) as zf:
        # ZIP bomb protection: check compression ratio (not total size,
        # since skill packages may contain large binary assets we'll skip)
        total_compressed = sum(info.compress_size for info in zf.infolist() if not info.is_dir())
        total_decompressed = sum(info.file_size for info in zf.infolist() if not info.is_dir())
        if total_compressed > 0 and total_decompressed / total_compressed > 1000:
            logger.warning(f"ZIP bomb suspected: compression ratio {total_decompressed / total_compressed:.0f}x")
            return {}

        for info in zf.infolist():
            if info.is_dir():
                continue

            name = info.filename
            # Check extension first — skip non-text files early
            ext = "." + name.rsplit(".", 1)[-1].lower() if "." in name else ""
            if ext not in ALLOWED_EXTENSIONS:
                continue

            # Skip individual files with suspiciously large declared size
            if info.file_size > MAX_ZIP_DECOMPRESSED_SIZE:
                continue

            if len(files) >= MAX_FILES:
                break

            try:
                raw = zf.read(name)
                text = raw.decode("utf-8", errors="replace")
                total_chars += len(text)
                if total_chars > MAX_TOTAL_CHARS:
                    # Truncate last file
                    remaining = MAX_TOTAL_CHARS - (total_chars - len(text))
                    text = text[:remaining] + "\n[truncated]"
                    files[name] = text
                    break
                files[name] = text
            except Exception:
                continue

    return files


async def run_analysis(analysis_id: uuid.UUID) -> None:
    """Run LLM analysis for a skill version. Called as BackgroundTask."""
    async with async_session() as db:
        try:
            # Load analysis record
            result = await db.execute(
                select(SkillAnalysis).where(SkillAnalysis.id == analysis_id)
            )
            analysis = result.scalar_one_or_none()
            if not analysis or analysis.status not in ("pending", "processing"):
                return

            # Mark as processing
            analysis.status = "processing"
            await db.commit()

            # Load provider (default or specified)
            if analysis.provider_id:
                prov_result = await db.execute(
                    select(LLMProvider).where(LLMProvider.id == analysis.provider_id)
                )
                provider = prov_result.scalar_one_or_none()
            else:
                prov_result = await db.execute(
                    select(LLMProvider).where(LLMProvider.is_default == True)
                )
                provider = prov_result.scalar_one_or_none()

            if not provider:
                analysis.status = "failed"
                analysis.error_message = "No LLM provider configured"
                await db.commit()
                return

            # Load version and read ZIP
            ver_result = await db.execute(
                select(SkillVersion).where(SkillVersion.id == analysis.version_id)
            )
            version = ver_result.scalar_one_or_none()
            if not version:
                analysis.status = "failed"
                analysis.error_message = "Version not found"
                await db.commit()
                return

            # Read and extract safe files
            zip_content = await file_storage.read_file(version.file_path)
            skill_files = _extract_safe_files(zip_content)

            if not skill_files:
                analysis.status = "failed"
                analysis.error_message = "No analyzable text files found in skill package"
                await db.commit()
                return

            # Build prompts and call LLM
            skill_name = version.skill_id  # fallback
            user_prompt = build_user_prompt(str(skill_name), skill_files)

            adapter = get_adapter(
                provider_type=provider.provider_type,
                base_url=provider.base_url,
                model_name=provider.model_name,
                api_key=decrypt_secret(provider.api_key_encrypted),
            )

            raw_response = await adapter.analyze(
                system_prompt=SYSTEM_PROMPT,
                user_prompt=user_prompt,
                max_tokens=provider.max_tokens,
                temperature=provider.temperature,
            )

            # Parse JSON response
            analysis.raw_response = raw_response
            parsed = _parse_llm_response(raw_response)

            if parsed:
                _apply_analysis_fields(analysis, parsed)
                analysis.status = "completed"
            else:
                # Retry once with lower temperature
                retry_response = await adapter.analyze(
                    system_prompt=SYSTEM_PROMPT,
                    user_prompt=user_prompt,
                    max_tokens=provider.max_tokens,
                    temperature=max(0.0, provider.temperature - 0.2),
                )
                analysis.raw_response = retry_response
                parsed = _parse_llm_response(retry_response)
                if parsed:
                    _apply_analysis_fields(analysis, parsed)
                    analysis.status = "completed"
                else:
                    analysis.status = "failed"
                    analysis.error_message = "Failed to parse LLM response as JSON"

            analysis.analyzed_at = utc_now()
            analysis.provider_id = provider.id
            await db.commit()

        except Exception as e:
            logger.error(f"Analysis {analysis_id} failed: {e}", exc_info=True)
            try:
                async with async_session() as db2:
                    await db2.execute(
                        update(SkillAnalysis)
                        .where(SkillAnalysis.id == analysis_id)
                        .values(status="failed", error_message=str(e)[:500])
                    )
                    await db2.commit()
            except Exception:
                logger.error(f"Failed to update analysis {analysis_id} error state", exc_info=True)


def _coerce_text(value) -> str | None:
    """Coerce an LLM output value into a string (or None).

    LLMs sometimes return arrays for list-style fields even when asked for a
    string; join those with newlines so the result fits a TEXT column.
    """
    if value is None:
        return None
    if isinstance(value, str):
        return value.strip() or None
    if isinstance(value, (list, tuple)):
        lines = [_coerce_text(v) for v in value]
        joined = "\n".join(line for line in lines if line)
        return joined or None
    return str(value)


def _coerce_score(value) -> int | None:
    """Coerce an LLM quality_score into a 1-10 integer."""
    if value is None:
        return None
    try:
        score = int(round(float(value)))
    except (TypeError, ValueError):
        return None
    return max(1, min(10, score))


def _apply_analysis_fields(analysis: SkillAnalysis, parsed: dict) -> None:
    """Map the parsed LLM JSON onto the analysis record with type coercion."""
    analysis.summary = _coerce_text(parsed.get("what_it_does"))
    analysis.usage_guide = _coerce_text(parsed.get("how_to_use"))
    analysis.use_cases = _coerce_text(parsed.get("use_cases"))
    analysis.effects = _coerce_text(parsed.get("expected_effects"))
    analysis.warnings = _coerce_text(parsed.get("warnings"))
    analysis.quality_score = _coerce_score(parsed.get("quality_score"))


def _parse_llm_response(raw: str) -> dict | None:
    """Try to extract JSON from LLM response."""
    # Try direct parse
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        pass

    # Try to extract JSON from markdown code block
    match = re.search(r"```(?:json)?\s*\n?(.*?)```", raw, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(1).strip())
        except json.JSONDecodeError:
            pass

    # Try to find first { ... } block
    start = raw.find("{")
    end = raw.rfind("}")
    if start != -1 and end > start:
        try:
            return json.loads(raw[start:end+1])
        except json.JSONDecodeError:
            pass

    return None
