from fastapi import APIRouter
from app.schemas import ConversationIn, MessageIn
from fastapi import Depends
from sqlalchemy.orm import Session
from app.models import User
from app.core.security import get_current_user
from app.db import get_db
from app.api.deps import get_current_user, get_db
from app.modules.chat import service

router = APIRouter()

@router.post('/conversations', status_code=201)
def create_conversation(payload: ConversationIn, db: Session=Depends(get_db), user: User=Depends(get_current_user)):
    return service.create_conversation(payload=payload, db=db, user=user)

@router.get('/conversations/{conversation_id}/messages')
def conversation_messages(conversation_id: int, db: Session=Depends(get_db), user: User=Depends(get_current_user)):
    return service.conversation_messages(conversation_id=conversation_id, db=db, user=user)

@router.post('/conversations/{conversation_id}/messages', status_code=201)
async def send_message(conversation_id: int, payload: MessageIn, db: Session=Depends(get_db), user: User=Depends(get_current_user)):
    return await service.send_message(conversation_id=conversation_id, payload=payload, db=db, user=user)
