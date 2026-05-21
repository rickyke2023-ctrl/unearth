from __future__ import annotations

from pydantic import BaseModel, Field


class ScanRequest(BaseModel):
    root_path: str


class DecisionItem(BaseModel):
    photo_id: str
    decision: str
    is_book_candidate: bool = False


class DecisionsRequest(BaseModel):
    decisions: list[DecisionItem] = Field(default_factory=list)


class UndoRequest(BaseModel):
    photo_id: str


class StagingConfirmRequest(BaseModel):
    confirm: bool
    photo_ids: list[str | int] | None = None
    root_path: str | None = None
    all_roots: bool = False


class StagingRestoreRequest(BaseModel):
    photo_id: str | int


class TrashPurgeRequest(BaseModel):
    photo_ids: list[str | int] | None = None
