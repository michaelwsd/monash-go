"""
token: user logs in -> server sends back a string (answer + cryptographic proof)
-> server verifies it with a key it holds

jwt: three chunks of base64 joined by dots - header.paylod.signature

header (how it was signed): {"alg": "RS256", "typ": "JWT"}
payload:
{
  "sub": "user_2abc123",
  "iss": "https://monashgo.clerk.accounts.dev",
  "iat": 1755000000,
  "exp": 1755000060
}
signature is computed from header + payload + key

hs256: one shared secret key both signs and verifies
rs256: a key pair, private key signs (clerk) and public key verifies
"""

import jwt
from pydantic import BaseModel, ValidationError

from app.core.config import get_settings
from app.exceptions.errors import InvalidCredentialsError


class ClerkClaims(BaseModel):
    clerk_id: str
    email: str
    full_name: str


# token -> userid
def verify_clerk_token(token: str) -> ClerkClaims:
    settings = get_settings()
    try:
        # verifies jwt token
        claims = jwt.decode(
            token,
            settings.clerk_pem_public_key,
            algorithms=["RS256"],
            issuer=settings.clerk_issuer,
            options={"verify_aud": False, "require": ["exp", "iss", "sub", "email", "full_name"]},
        )
    except jwt.PyJWTError as exc:
        raise InvalidCredentialsError("invalid or expired token") from exc

    try:
        return ClerkClaims(
            clerk_id=claims["sub"], email=claims["email"], full_name=claims["full_name"]
        )
    except ValidationError as exc:
        raise ValidationError("invalid or expired token") from exc
