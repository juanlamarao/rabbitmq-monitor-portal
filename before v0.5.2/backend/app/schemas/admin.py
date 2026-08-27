from datetime import datetime

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.schemas.common import ORMModel


def _normalize_emails(value: list[str] | None) -> list[str]:
    if not value:
        return []
    normalized: list[str] = []
    seen: set[str] = set()
    for item in value:
        email = str(item).strip().lower()
        if email and email not in seen:
            seen.add(email)
            normalized.append(email)
    return normalized


class SREGroupMemberRead(ORMModel):
    id: int
    email: str
    position: int
    created_at: datetime


class SREGroupBase(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str | None = None
    is_active: bool = True
    member_emails: list[EmailStr] = Field(default_factory=list)

    @field_validator("member_emails")
    @classmethod
    def normalize_member_emails(cls, value: list[EmailStr]) -> list[str]:
        return _normalize_emails([str(item) for item in value])


class SREGroupCreate(SREGroupBase):
    pass


class SREGroupUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = None
    is_active: bool | None = None
    member_emails: list[EmailStr] | None = None

    @field_validator("member_emails")
    @classmethod
    def normalize_member_emails(cls, value: list[EmailStr] | None) -> list[str] | None:
        if value is None:
            return None
        return _normalize_emails([str(item) for item in value])


class SREGroupRead(ORMModel):
    id: int
    name: str
    description: str | None = None
    is_active: bool
    created_at: datetime
    updated_at: datetime
    members: list[SREGroupMemberRead] = Field(default_factory=list)


class DatadogOrgBase(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    api_url: str = "https://api.datadoghq.com"
    org_url: str | None = None
    description: str | None = None
    is_active: bool = True


class DatadogOrgCreate(DatadogOrgBase):
    api_key: str = Field(min_length=1)
    app_key: str = Field(min_length=1)


class DatadogOrgUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    api_url: str | None = None
    org_url: str | None = None
    api_key: str | None = None
    app_key: str | None = None
    description: str | None = None
    is_active: bool | None = None


class DatadogOrgRead(ORMModel):
    id: int
    name: str
    api_url: str
    org_url: str | None = None
    description: str | None = None
    is_active: bool
    has_credentials: bool
    created_at: datetime
    updated_at: datetime
