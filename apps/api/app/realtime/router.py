from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

from app.core.config import settings
from app.core.security import decode_user_token
from app.db import SessionLocal
from app.modules.users.service import get_active_user
from app.realtime import event, manager

router = APIRouter()


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, token: str = Query(...)):
    origin = websocket.headers.get("origin")
    if origin and origin not in settings.ws_allowed_origins:
        await websocket.close(code=1008, reason="Origin not allowed")
        return
    user_id = decode_user_token(token)
    if user_id is None:
        await websocket.close(code=1008, reason="Invalid token")
        return

    db = SessionLocal()
    try:
        user = get_active_user(db, user_id)
    finally:
        db.close()
    if user is None:
        await websocket.close(code=1008, reason="Account unavailable")
        return

    await manager.connect(user_id, websocket)
    await websocket.send_json(event("connection.ready", {"user_id": user_id}))
    try:
        while True:
            await websocket.receive_text()
            await websocket.send_json(event("connection.ready", {"heartbeat": True}))
    except WebSocketDisconnect:
        await manager.disconnect(user_id, websocket)
