"""Create the first administrator without shipping a default credential."""

import argparse
from getpass import getpass

from pydantic import EmailStr, TypeAdapter, ValidationError
from sqlalchemy import select

from app.core.security import hash_password
from app.db import SessionLocal
from app.db.init_db import init_database
from app.models import User


def main() -> None:
    init_database()
    parser = argparse.ArgumentParser(description="Create the first FreshFlow administrator")
    parser.add_argument("--email", required=True, help="Administrator email address")
    parser.add_argument("--name", required=True, help="Administrator full name")
    args = parser.parse_args()

    try:
        email = str(TypeAdapter(EmailStr).validate_python(args.email.strip())).lower()
    except ValidationError:
        parser.error("--email must be a valid email address")
    full_name = args.name.strip()
    if len(full_name) < 2 or len(full_name) > 120:
        parser.error("--name must be between 2 and 120 characters")

    password = getpass("New administrator password (minimum 12 characters): ")
    confirmation = getpass("Confirm password: ")
    if len(password) < 12:
        parser.error("Password must be at least 12 characters")
    if password != confirmation:
        parser.error("Passwords do not match")

    with SessionLocal() as db:
        if db.scalar(select(User.id).where(User.role == "ADMIN").limit(1)):
            parser.error("An administrator already exists; refusing to create another bootstrap account")
        if db.scalar(select(User.id).where(User.email == email)):
            parser.error("That email is already registered")

        db.add(User(
            email=email,
            full_name=full_name,
            password_hash=hash_password(password),
            role="ADMIN",
            customer_group="STUDENT",
            is_active=True,
        ))
        db.commit()

    print(f"Administrator created: {email}")


if __name__ == "__main__":
    main()
