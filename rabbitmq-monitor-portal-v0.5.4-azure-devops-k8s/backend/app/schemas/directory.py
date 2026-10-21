from pydantic import BaseModel, EmailStr


class DirectoryPersonRead(BaseModel):
    first_name: str
    last_name: str
    full_name: str
    email: EmailStr
