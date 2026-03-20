import os
from sqlalchemy import select, delete, func
from app.models import Message, File

async def delete_files_for_messages(db, message_ids=None, room=None, group_id=None, sender_id=None):
    """
    Identifies and deletes File records (DB and disk) associated with messages.
    Must be called BEFORE deleting the messages themselves to maintain FK links.
    """
    stmt = select(File.id, File.stored_name).join(Message)
    
    if message_ids:
        stmt = stmt.where(Message.id.in_(message_ids))
    elif room:
        stmt = stmt.where(func.lower(Message.room) == room.lower())
    elif group_id:
        stmt = stmt.where(Message.group_id == group_id)
    elif sender_id:
        stmt = stmt.where(Message.sender_id == sender_id)
    else:
        return
        
    result = await db.execute(stmt)
    files_to_delete = result.all()
    
    if not files_to_delete:
        return
        
    # 1. Delete File records from database
    file_ids = [f[0] for f in files_to_delete]
    await db.execute(delete(File).where(File.id.in_(file_ids)))
    
    # We don't commit here; the caller should commit after message deletion.
    
    # 2. Delete physical files from disk
    # Use absolute path as mapped in Docker
    UPLOAD_DIR = "/uploads"
    for _, stored_name in files_to_delete:
        file_path = os.path.join(UPLOAD_DIR, stored_name)
        try:
            if os.path.exists(file_path):
                os.remove(file_path)
        except Exception as e:
            # Log error but don't fail the whole request
            print(f"Error removing physical file {file_path}: {e}")
