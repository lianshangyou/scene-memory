"""Scenario management for the local claude-smart installation."""

import json
import time
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from reflexio.models.api_schema.service_schemas import UserProfile
from reflexio.server.auth import default_get_org_id
from reflexio.server.cache import reflexio_cache
from reflexio.server.services.storage.sqlite_storage.scene_memory import MANUAL_WRITE

router = APIRouter()


def storage_for(org_id):
    storage = reflexio_cache.get_reflexio(org_id=org_id).get_storage()
    if not getattr(storage, "_scene_enabled", lambda: False)():
        raise HTTPException(409, "Scene preferences require the local claude-smart backend")
    return storage


class PreferenceEdit(BaseModel):
    profile_id: str | None = None
    title: str = Field(min_length=1, max_length=100)
    content: str = Field(min_length=1, max_length=5000)
    scenes: list[str] = Field(min_length=1, max_length=12)
    scope: str = Field(default="全部项目", min_length=1, max_length=200)


class PreferenceRestore(BaseModel):
    profile_id: str


@router.get("/api/get_scene_preferences")
def list_preferences(org_id: str = Depends(default_get_org_id)):
    return storage_for(org_id).scene_catalog()


@router.post("/api/save_scene_preference")
def save_preference(payload: PreferenceEdit, org_id: str = Depends(default_get_org_id)):
    storage = storage_for(org_id)
    with storage._lock:
        old = storage.get_profile_by_id(payload.profile_id, include_tombstones=True) if payload.profile_id else None
        if payload.profile_id and old is None:
            raise HTTPException(404, "Preference was removed; reload before editing")
        data = dict(old.custom_features or {}) if old else {}
        if data.get("possible_deleted_match"):
            raise HTTPException(409, "This candidate may restore a deleted preference; restore the original from 已删除 first")
        data.update(title=payload.title.strip(), scenes=[s.strip() for s in payload.scenes if s.strip()], scope=payload.scope.strip())
        if not data["scenes"] or not payload.content.strip() or not payload.title.strip():
            raise HTTPException(422, "Title, conclusion and scenario are required")
        conflict = data.pop("conflict_with", None)
        profile = UserProfile(profile_id=old.profile_id if old else uuid.uuid4().hex,
            user_id=old.user_id if old else "scene-shared", content=payload.content.strip(),
            last_modified_timestamp=int(time.time()), generated_from_request_id="manual-scene-edit",
            custom_features=data, source="manual-scene-edit")
        # Accepting a conflict revises the protected record only on this explicit action.
        if conflict:
            target = storage.get_profile_by_id(conflict)
            if target:
                profile.profile_id, profile.user_id = target.profile_id, target.user_id
                profile.custom_features["manual_version"] = (target.custom_features or {}).get("manual_version", 0)
        token = MANUAL_WRITE.set(True)
        try:
            storage.precompute_profile_embeddings([profile])
            storage._scene_init()
            exclusions = storage.conn.execute("SELECT * FROM scene_memory_exclusions").fetchall()
            if any(storage._scene_same(profile, row, True) for row in exclusions):
                raise HTTPException(409, "This preference was deleted; restore it from 已删除 first")
            storage.add_user_profile(profile.user_id, [profile], skip_embedding=True)
            if conflict and old and old.profile_id != profile.profile_id:
                storage.delete_profiles_by_ids([old.profile_id], emit_hard_delete=False)
        finally:
            MANUAL_WRITE.reset(token)
    return {"success": True, "profile_id": profile.profile_id}


@router.post("/api/restore_scene_preference")
def restore_preference(payload: PreferenceRestore, org_id: str = Depends(default_get_org_id)):
    storage = storage_for(org_id)
    with storage._lock:
        storage._scene_init()
        row = storage.conn.execute("SELECT * FROM scene_memory_exclusions WHERE profile_id=?", (payload.profile_id,)).fetchone()
        if row is None:
            raise HTTPException(404, "Deleted preference not found")
        profile = UserProfile(profile_id=row["profile_id"], user_id=row["user_id"], content=row["content"],
            custom_features=json.loads(row["metadata"]), last_modified_timestamp=int(time.time()),
            generated_from_request_id="manual-scene-restore", source="manual-scene-restore")
        storage.precompute_profile_embeddings([profile])
        token = MANUAL_WRITE.set(True)
        try:
            with storage.commit_scope():
                storage.conn.execute("DELETE FROM scene_memory_exclusions WHERE profile_id=?", (payload.profile_id,))
                storage.add_user_profile(profile.user_id, [profile], skip_embedding=True)
        finally:
            MANUAL_WRITE.reset(token)
    return {"success": True}
