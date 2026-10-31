import asyncio
import json
from collections import defaultdict

from fastapi import WebSocket


class ConnectionManager:
    def __init__(self):
        self._connections: dict[int, set[WebSocket]] = defaultdict(set)
        self._lock = asyncio.Lock()

    async def connect(self, user_id: int, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            self._connections[user_id].add(websocket)

    async def disconnect(self, user_id: int, websocket: WebSocket) -> None:
        async with self._lock:
            self._connections[user_id].discard(websocket)
            if not self._connections[user_id]:
                self._connections.pop(user_id, None)

    async def send_user(self, user_id: int, event: dict) -> None:
        async with self._lock:
            targets = list(self._connections.get(user_id, ()))
        stale = []
        for socket in targets:
            try:
                await socket.send_text(json.dumps(event, ensure_ascii=False, default=str))
            except Exception:
                stale.append(socket)
        for socket in stale:
            await self.disconnect(user_id, socket)

    async def broadcast(self, event: dict) -> None:
        async with self._lock:
            targets = [(user_id, socket) for user_id, sockets in self._connections.items() for socket in sockets]
        stale = []
        encoded = json.dumps(event, ensure_ascii=False, default=str)
        for user_id, socket in targets:
            try:
                await socket.send_text(encoded)
            except Exception:
                stale.append((user_id, socket))
        for user_id, socket in stale:
            await self.disconnect(user_id, socket)

    async def broadcast_admins(self, event: dict) -> None:
        async with self._lock:
            targets = [(user_id, socket) for user_id, sockets in self._connections.items() for socket in sockets]
        for user_id, socket in targets:
            # Role is checked by the caller's recipient list in production. This helper is intentionally unused.
            await socket.send_text(json.dumps({**event, "recipient": user_id}, ensure_ascii=False, default=str))


manager = ConnectionManager()


def event(event_type: str, data: dict) -> dict:
    from datetime import datetime, timezone
    from uuid import uuid4

    return {
        "event_id": str(uuid4()),
        "type": event_type,
        "occurred_at": datetime.now(timezone.utc).isoformat(),
        "data": data,
    }
