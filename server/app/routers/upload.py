import os
import uuid
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File as FastAPIFile, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
import aiofiles

from app.auth import get_current_user
from app.database import get_db
from app.models import User, File as FileModel
from app.schemas import FileOut

router = APIRouter(prefix="/api/upload", tags=["upload"])

UPLOAD_DIR = "/uploads"
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB
MAX_USER_QUOTA = 100 * 1024 * 1024  # 100MB

# Ensure upload directory exists
os.makedirs(UPLOAD_DIR, exist_ok=True)

async def get_user_total_storage(db: AsyncSession, user_id: int) -> int:
    result = await db.execute(
        select(func.sum(FileModel.file_size)).where(FileModel.sender_id == user_id)
    )
    return result.scalar() or 0

@router.post("", response_model=FileOut)
async def upload_file(
    file: UploadFile = FastAPIFile(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    # 1. Check file size (approximate from header if available, or read)
    # UploadFile doesn't always have size, so we might need to read it
    file_content = await file.read()
    file_size = len(file_content)
    
    if file_size > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="File is too large (Max 10MB)"
        )
    
    # 2. Check user quota
    current_storage = await get_user_total_storage(db, current_user.id)
    if current_storage + file_size > MAX_USER_QUOTA:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Storage quota exceeded (100MB)"
        )
    
    # 3. Generate unique filename
    ext = os.path.splitext(file.filename)[1]
    stored_name = f"{uuid.uuid4()}{ext}"
    file_path = os.path.join(UPLOAD_DIR, stored_name)
    
    # 4. Save file to disk
    async with aiofiles.open(file_path, "wb") as f:
        await f.write(file_content)
    
    # 5. Save metadata to DB
    new_file = FileModel(
        original_name=file.filename,
        stored_name=stored_name,
        file_size=file_size,
        mime_type=file.content_type or "application/octet-stream",
        sender_id=current_user.id
    )
    db.add(new_file)
    await db.commit()
    await db.refresh(new_file)
    
    # Add helper URL for frontend
    result = FileOut.model_validate(new_file)
    result.url = f"/uploads/{stored_name}"
    
    return result
