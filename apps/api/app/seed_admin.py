import argparse

from sqlalchemy import select

from app.db import SessionLocal
from app.db.init_db import init_database
from app.models import User
from app.core.security import hash_password


def main():
    init_database()
    parser = argparse.ArgumentParser(description="Create/update a FreshFlow admin account")
    parser.add_argument("--email", required=True)
    parser.add_argument("--name", default="FreshFlow Admin")
    parser.add_argument("--password", required=True)
    args = parser.parse_args()
    if len(args.password) < 10:
        parser.error("password must contain at least 10 characters")
    db = SessionLocal()
    try:
        user = db.scalar(select(User).where(User.email == args.email.lower()))
        if user is None:
            user = User(email=args.email.lower(), full_name=args.name, password_hash=hash_password(args.password), role="ADMIN")
            db.add(user)
        else:
            user.role = "ADMIN"
            user.password_hash = hash_password(args.password)
            user.is_active = True
        db.commit()
        print(f"Admin ready: {args.email.lower()}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
