import os
from fastapi import APIRouter, Request, HTTPException, status
from fastapi.responses import StreamingResponse, FileResponse

router = APIRouter(tags=["uploads"])

UPLOAD_DIR = "/uploads"

def send_bytes_range_requests(file_obj, start: int, end: int, chunk_size: int = 1024 * 1024):
    """Generator to stream a specific byte range of a file."""
    with file_obj as f:
        f.seek(start)
        while (pos := f.tell()) <= end:
            read_size = min(chunk_size, end + 1 - pos)
            yield f.read(read_size)

@router.get("/uploads/{filename}")
async def serve_upload(filename: str, request: Request):
    file_path = os.path.join(UPLOAD_DIR, filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")

    file_size = os.path.getsize(file_path)
    range_header = request.headers.get("range")

    # If no Range header, just return the whole file
    if not range_header:
        headers = {
            "Accept-Ranges": "bytes",
            "Content-Length": str(file_size)
        }
        return FileResponse(file_path, headers=headers)

    # Simple range parsing
    try:
        range_match = range_header.replace("bytes=", "").split("-")
        start = int(range_match[0]) if range_match[0] else 0
        end = int(range_match[1]) if len(range_match) > 1 and range_match[1] else file_size - 1
    except ValueError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Invalid range header")

    if start >= file_size or end >= file_size or start > end:
        raise HTTPException(
            status.HTTP_416_REQUESTED_RANGE_NOT_SATISFIABLE,
            detail=f"Requested range not satisfiable. Max size is {file_size}"
        )

    content_length = end - start + 1
    
    # Determine basic MIME type for audio vs other, though FileResponse guesses better
    # For streaming audio, content type is important
    content_type = "application/octet-stream"
    if filename.lower().endswith('.mp3'):
        content_type = "audio/mpeg"
    elif filename.lower().endswith('.wav'):
        content_type = "audio/wav"
    elif filename.lower().endswith('.ogg'):
        content_type = "audio/ogg"

    headers = {
        "Accept-Ranges": "bytes",
        "Content-Range": f"bytes {start}-{end}/{file_size}",
        "Content-Length": str(content_length),
        "Content-Type": content_type
    }

    return StreamingResponse(
        send_bytes_range_requests(open(file_path, "rb"), start, end),
        status_code=206,
        headers=headers,
    )
