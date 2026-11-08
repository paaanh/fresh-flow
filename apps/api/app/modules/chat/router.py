from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import select, or_, and_, desc

from app.api.deps import get_db, get_current_user
from app.models import ChatMessage, User, Order, ModerationTerm, ModerationViolation
from app.schemas import ChatMessageIn, ChatMessageOut
from app.realtime import event, manager

router = APIRouter(prefix="/chat", tags=["Realtime Chat"])


def enrich_message(db: Session, msg: ChatMessage) -> ChatMessageOut:
    sender = db.get(User, msg.sender_id)
    return ChatMessageOut(
        id=msg.id,
        sender_id=msg.sender_id,
        sender_name=sender.full_name if sender else "Người dùng",
        sender_role=sender.role if sender else "CUSTOMER",
        receiver_id=msg.receiver_id,
        order_id=msg.order_id,
        content=msg.content,
        image_url=msg.image_url,
        is_read=msg.is_read,
        created_at=msg.created_at,
    )


@router.get("/conversations")
def get_conversations(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # Find all users who exchanged messages with current user
    msgs = db.scalars(
        select(ChatMessage)
        .where(or_(ChatMessage.sender_id == user.id, ChatMessage.receiver_id == user.id))
        .order_by(desc(ChatMessage.created_at))
    ).all()

    contacts = {}
    for m in msgs:
        peer_id = m.receiver_id if m.sender_id == user.id else m.sender_id
        if not peer_id:
            continue
        if peer_id not in contacts:
            peer = db.get(User, peer_id)
            if peer:
                contacts[peer_id] = {
                    "peer_id": peer.id,
                    "peer_name": peer.shop_name or peer.full_name,
                    "peer_role": peer.role,
                    "avatar_url": peer.avatar_url,
                    "last_message": m.content,
                    "last_time": m.created_at,
                    "unread": 1 if (m.receiver_id == user.id and not m.is_read) else 0,
                    "order_id": m.order_id,
                }
        else:
            if m.receiver_id == user.id and not m.is_read:
                contacts[peer_id]["unread"] += 1

    # If no conversations yet, provide default contacts (Admin or Shop)
    if not contacts:
        if user.role == "CUSTOMER":
            shop = db.scalar(select(User).where(User.role == "SHOP"))
            if shop:
                contacts[shop.id] = {
                    "peer_id": shop.id,
                    "peer_name": shop.shop_name or shop.full_name,
                    "peer_role": "SHOP",
                    "avatar_url": None,
                    "last_message": "Nhắn tin hỏi cửa hàng về sản phẩm...",
                    "last_time": user.created_at,
                    "unread": 0,
                    "order_id": None,
                }
        elif user.role in {"SHOP", "SHIPPER"}:
            admin = db.scalar(select(User).where(User.role == "ADMIN"))
            if admin:
                contacts[admin.id] = {
                    "peer_id": admin.id,
                    "peer_name": admin.full_name,
                    "peer_role": "ADMIN",
                    "avatar_url": None,
                    "last_message": "Kênh hỗ trợ quản trị viên...",
                    "last_time": user.created_at,
                    "unread": 0,
                    "order_id": None,
                }

    return list(contacts.values())


@router.get("/users")
def get_chat_available_users(
    query: str | None = Query(default=None),
    role: str | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    stmt = select(User).where(User.id != user.id, User.is_active == True)
    if user.role == "CUSTOMER":
        stmt = stmt.where(User.role.in_(["SHOP", "ADMIN"]))

    if role:
        stmt = stmt.where(User.role == role)
    if query:
        search_pattern = f"%{query}%"
        stmt = stmt.where(
            or_(
                User.full_name.ilike(search_pattern),
                User.shop_name.ilike(search_pattern),
                User.email.ilike(search_pattern),
                User.phone.ilike(search_pattern),
            )
        )
    users = db.scalars(stmt.order_by(User.full_name.asc()).limit(50)).all()
    return [
        {
            "id": u.id,
            "full_name": u.full_name,
            "shop_name": u.shop_name,
            "role": u.role,
            "email": u.email,
            "phone": u.phone,
            "avatar_url": u.avatar_url,
        }
        for u in users
    ]


@router.get("/messages", response_model=list[ChatMessageOut])
def get_chat_messages(
    peer_id: int | None = Query(default=None),
    order_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    query = select(ChatMessage)

    if order_id:
        if user.role != "ADMIN":
            order = db.get(Order, order_id)
            if not order or (user.id not in {order.user_id, order.shop_id, order.shipper_id}):
                raise HTTPException(status_code=403, detail="Không có quyền truy cập tin nhắn của đơn hàng này")
        query = query.where(ChatMessage.order_id == order_id)
    elif peer_id:
        query = query.where(
            or_(
                and_(ChatMessage.sender_id == user.id, ChatMessage.receiver_id == peer_id),
                and_(ChatMessage.sender_id == peer_id, ChatMessage.receiver_id == user.id),
            )
        )
    else:
        query = query.where(or_(ChatMessage.sender_id == user.id, ChatMessage.receiver_id == user.id))

    messages = db.scalars(query.order_by(ChatMessage.created_at.asc())).all()

    # Mark received messages as read
    for m in messages:
        if m.receiver_id == user.id and not m.is_read:
            m.is_read = True
    db.commit()

    return [enrich_message(db, m) for m in messages]


@router.post("/messages", response_model=ChatMessageOut, status_code=201)
async def send_chat_message(
    payload: ChatMessageIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    active_terms = db.scalars(select(ModerationTerm.term).where(ModerationTerm.is_active == True)).all()
    for term in active_terms:
        if term and term.lower() in payload.content.lower():
            violation = ModerationViolation(user_id=user.id, matched_term=term)
            db.add(violation)
            db.commit()
            raise HTTPException(status_code=400, detail=f"Nội dung chứa từ khóa vi phạm tiêu chuẩn cộng đồng: {term}")

    receiver_id = payload.receiver_id

    # If receiver not specified but order_id is, deduce receiver
    if payload.order_id:
        order = db.get(Order, payload.order_id)
        if not order:
            raise HTTPException(status_code=404, detail="Đơn hàng không tồn tại")
        if user.role != "ADMIN" and user.id not in {order.user_id, order.shop_id, order.shipper_id}:
            raise HTTPException(status_code=403, detail="Không có quyền gửi tin nhắn cho đơn hàng này")
        if not receiver_id:
            if user.id == order.user_id:
                receiver_id = order.shop_id or order.shipper_id
            elif user.id == order.shop_id:
                receiver_id = order.user_id
            elif user.id == order.shipper_id:
                receiver_id = order.user_id

    if receiver_id and not db.get(User, receiver_id):
        raise HTTPException(status_code=404, detail="Người nhận không tồn tại")

    if not receiver_id:
        # Default to an admin or shop
        admin = db.scalar(select(User).where(User.role == "ADMIN"))
        receiver_id = admin.id if admin else user.id

    msg = ChatMessage(
        sender_id=user.id,
        receiver_id=receiver_id,
        order_id=payload.order_id,
        content=payload.content,
        image_url=payload.image_url,
        is_read=False,
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)

    out = enrich_message(db, msg)

    # Realtime notification to receiver
    await manager.send_user(
        receiver_id,
        event(
            "chat.message",
            {
                "id": msg.id,
                "sender_id": user.id,
                "sender_name": user.full_name,
                "content": msg.content,
                "created_at": msg.created_at.isoformat(),
            },
        ),
    )

    return out
