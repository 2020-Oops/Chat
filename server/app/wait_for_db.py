import asyncio
import os

import asyncpg


def _normalize_dsn(dsn: str) -> str:
    if dsn.startswith("postgresql+asyncpg://"):
        return dsn.replace("postgresql+asyncpg://", "postgresql://", 1)
    return dsn


async def _wait_for_db(dsn: str, retries: int = 30, delay_s: float = 1.0) -> None:
    for attempt in range(1, retries + 1):
        try:
            conn = await asyncpg.connect(dsn)
            await conn.close()
            return
        except Exception as exc:
            print(f"DB not ready (attempt {attempt}/{retries}): {exc}")
            await asyncio.sleep(delay_s)

    raise SystemExit("DB not ready after retries")


def main() -> None:
    dsn = os.getenv("DATABASE_URL", "")
    if not dsn or dsn.startswith("sqlite"):
        print("SQLite or empty DATABASE_URL detected, skipping DB wait.")
        return

    asyncio.run(_wait_for_db(_normalize_dsn(dsn)))


if __name__ == "__main__":
    main()
