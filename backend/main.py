import logging
import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from supabase import create_client

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

load_dotenv()

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
ALLOW_ORIGIN = os.environ.get("ALLOW_ORIGIN", "http://localhost:5173")

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[ALLOW_ORIGIN],
    allow_methods=["POST", "OPTIONS"],
    allow_headers=["Content-Type"],
)

MUSIC_DIR = Path(__file__).resolve().parent.parent / "music"
if MUSIC_DIR.is_dir():
    app.mount("/music", StaticFiles(directory=str(MUSIC_DIR)), name="music")


def get_supabase():
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise HTTPException(status_code=500, detail="Missing Supabase env vars")
    return create_client(SUPABASE_URL, SUPABASE_KEY)


@app.post("/api/responses")
async def save_response(request: Request):
    payload = await request.json()
    participant_id = payload.get("participantId")
    session_id = payload.get("sessionId")

    if not participant_id or not session_id:
        raise HTTPException(
            status_code=400, detail="participantId and sessionId are required"
        )

    supabase = get_supabase()
    row = {
        "participant_id": participant_id,
        "session_id": session_id,
        "payload": payload,
        "updated_at": payload.get("submittedAt") or payload.get("startedAt", ""),
    }

    try:
        supabase.table("questionnaire_responses") \
            .upsert(row, on_conflict="participant_id,session_id") \
            .execute()
    except Exception as exc:
        logger.exception("Supabase upsert failed: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))

    return {"ok": True}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
