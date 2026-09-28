import asyncio

import bcrypt
from sqlalchemy import select

from app.database import async_session
from app.models import User


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def clean_input(prompt: str) -> str:
    """Read input and fix Windows terminal encoding issues (surrogate pairs)."""
    value = input(prompt).strip()
    return value.encode("utf-8", errors="surrogateescape").decode("utf-8", errors="replace")


async def createsuperuser():
    username = clean_input("Username: ")
    password = clean_input("Password: ")

    if not username or not password:
        print("All fields are required.")
        return

    async with async_session() as db:
        result = await db.execute(select(User).where(User.username == username))
        if result.scalar_one_or_none() is not None:
            print(f"User '{username}' already exists.")
            return

        user = User(
            username=username,
            password_hash=hash_password(password),
            role="admin",
        )
        db.add(user)
        await db.commit()
        print(f"Admin user '{username}' created successfully.")


if __name__ == "__main__":
    asyncio.run(createsuperuser())
