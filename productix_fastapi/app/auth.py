from datetime import datetime, timedelta
from jose import JWTError, jwt
from passlib.context import CryptContext
from .schemas import TokenData
from .models import UserRole

SECRET_KEY = "SUPERSECRETCHANGE"   # 🔐 change this
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 1 day

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def verify_password(plain, hashed):
    return pwd_context.verify(plain, hashed)

def hash_password(password: str):
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: int = None):
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def decode_token(token: str) -> TokenData:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("user_id")
        if user_id is None:
            return None  # or raise an exception
        return TokenData(
            id=int(user_id),
            role=payload.get("role"),
            organization_id=payload.get("organization_id"),
        )
    except JWTError:
        return None
