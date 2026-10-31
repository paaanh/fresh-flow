from app.core.notifications import add_notification
from app.models import Conversation, ConversationMember, Message, ModerationTerm, ModerationViolation, User
from app.schemas import ConversationIn, MessageIn
from fastapi import HTTPException
from sqlalchemy.orm import Session
from app.realtime import event, manager
from sqlalchemy import select


def create_conversation(payload: ConversationIn, db: Session=None, user: User=None):
    conversation = Conversation()
    db.add(conversation)
    db.flush()
    members = {user.id}
    if payload.participant_id:
        participant = db.get(User, payload.participant_id)
        if not participant or not participant.is_active:
            raise HTTPException(404, 'Không tìm thấy người tham gia')
        members.add(participant.id)
    for member_id in members:
        db.add(ConversationMember(conversation_id=conversation.id, user_id=member_id))
    db.commit()
    return {'id': conversation.id, 'member_ids': sorted(members)}

def conversation_messages(conversation_id: int, db: Session=None, user: User=None):
    allowed = db.scalar(select(ConversationMember.id).where(ConversationMember.conversation_id == conversation_id, ConversationMember.user_id == user.id))
    if not allowed:
        raise HTTPException(404, 'Không tìm thấy hội thoại')
    return db.scalars(select(Message).where(Message.conversation_id == conversation_id).order_by(Message.created_at).limit(200)).all()

async def send_message(conversation_id: int, payload: MessageIn, db: Session=None, user: User=None):
    member_ids = db.scalars(select(ConversationMember.user_id).where(ConversationMember.conversation_id == conversation_id)).all()
    if user.id not in member_ids:
        raise HTTPException(404, 'Không tìm thấy hội thoại')
    normalized = payload.body.casefold()
    terms = db.scalars(select(ModerationTerm).where(ModerationTerm.is_active.is_(True))).all()
    matched = next((term.term for term in terms if term.term.casefold() in normalized), None)
    body = payload.body
    if matched:
        import re
        body = re.sub(re.escape(matched), lambda match: '*' * len(match.group(0)), body, flags=re.IGNORECASE)
        db.add(ModerationViolation(user_id=user.id, conversation_id=conversation_id, matched_term=matched))
        admin_ids = db.scalars(select(User.id).where(User.role == 'ADMIN', User.is_active.is_(True))).all()
        for admin_id in admin_ids:
            add_notification(db, admin_id, 'Cảnh báo kiểm duyệt', 'Tin nhắn đã được che từ khóa hạn chế.', 'moderation.alert_created')
    else:
        admin_ids = []
    message = Message(conversation_id=conversation_id, sender_id=user.id, body=body)
    db.add(message)
    db.commit()
    db.refresh(message)
    payload_event = event('chat.message_created', {'conversation_id': conversation_id, 'message_id': message.id, 'body': body})
    for recipient_id in member_ids:
        if recipient_id != user.id:
            await manager.send_user(recipient_id, payload_event)
    if matched:
        alert = event('moderation.alert_created', {'conversation_id': conversation_id, 'message_id': message.id})
        for admin_id in admin_ids:
            await manager.send_user(admin_id, alert)
    return message
