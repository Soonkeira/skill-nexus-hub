import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, require_role
from app.llm.factory import get_adapter
from app.models import User
from app.models.llm_provider import LLMProvider
from app.schemas.llm_provider import (
    LLMProviderCreate,
    LLMProviderResponse,
    LLMProviderTestResponse,
    LLMProviderUpdate,
)
from app.services.secret_storage import decrypt_secret, encrypt_secret

router = APIRouter(prefix="/api/admin/llm-providers", tags=["admin-llm"])


@router.get("", response_model=list[LLMProviderResponse])
async def list_providers(
    admin: Annotated[User, Depends(require_role("admin"))],
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(LLMProvider).order_by(LLMProvider.created_at.desc()))
    return result.scalars().all()


@router.post("", response_model=LLMProviderResponse, status_code=status.HTTP_201_CREATED)
async def create_provider(
    body: LLMProviderCreate,
    admin: Annotated[User, Depends(require_role("admin"))],
    db: AsyncSession = Depends(get_db),
):
    # If setting as default, clear existing defaults
    if body.is_default:
        await db.execute(
            update(LLMProvider).where(LLMProvider.is_default == True).values(is_default=False)
        )

    provider = LLMProvider(
        name=body.name,
        provider_type=body.provider_type,
        base_url=body.base_url.strip(),
        model_name=body.model_name,
        api_key_encrypted=encrypt_secret(body.api_key.get_secret_value()),
        is_default=body.is_default,
        max_tokens=body.max_tokens,
        temperature=body.temperature,
    )
    db.add(provider)
    await db.commit()
    await db.refresh(provider)
    return provider


@router.put("/{provider_id}", response_model=LLMProviderResponse)
async def update_provider(
    provider_id: uuid.UUID,
    body: LLMProviderUpdate,
    admin: Annotated[User, Depends(require_role("admin"))],
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(LLMProvider).where(LLMProvider.id == provider_id))
    provider = result.scalar_one_or_none()
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")

    update_data = body.model_dump(exclude_unset=True)
    api_key = update_data.pop("api_key", None)
    # If setting as default, clear existing defaults
    if update_data.get("is_default"):
        await db.execute(
            update(LLMProvider).where(LLMProvider.is_default == True).values(is_default=False)
        )

    for field, value in update_data.items():
        if field == "base_url" and isinstance(value, str):
            value = value.strip()
        setattr(provider, field, value)
    if api_key is not None:
        provider.api_key_encrypted = encrypt_secret(api_key.get_secret_value())

    await db.commit()
    await db.refresh(provider)
    return provider


@router.delete("/{provider_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_provider(
    provider_id: uuid.UUID,
    admin: Annotated[User, Depends(require_role("admin"))],
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(LLMProvider).where(LLMProvider.id == provider_id))
    provider = result.scalar_one_or_none()
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")

    await db.delete(provider)
    await db.commit()


@router.post("/{provider_id}/test", response_model=LLMProviderTestResponse)
async def test_provider(
    provider_id: uuid.UUID,
    admin: Annotated[User, Depends(require_role("admin"))],
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(LLMProvider).where(LLMProvider.id == provider_id))
    provider = result.scalar_one_or_none()
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")

    try:
        adapter = get_adapter(
            provider_type=provider.provider_type,
            base_url=provider.base_url,
            model_name=provider.model_name,
            api_key=decrypt_secret(provider.api_key_encrypted),
        )
        success, message = await adapter.test_connection()
        return LLMProviderTestResponse(success=success, message=message)
    except ValueError as e:
        return LLMProviderTestResponse(success=False, message=str(e))
    except Exception as e:
        return LLMProviderTestResponse(success=False, message=f"Connection failed: {e}")
