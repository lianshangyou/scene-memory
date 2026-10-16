"""Local scenario preferences and durable user-controlled exclusions."""

import hashlib
import json
import math
import re
import time
import unicodedata
from contextvars import ContextVar

MANUAL_WRITE = ContextVar("scene_manual_write", default=False)
SCENES = ["通用协作与工具", "新增需求", "修改需求", "写 PRD", "输出原型", "写工作日报", "写今日计划", "写今日产出"]
ALIASES = {"写日报": "写工作日报", "写今日工作计划": "写今日计划", "写prd": "写 PRD", "原型设计": "输出原型", "通用协作": "通用协作与工具"}


def normalize(value):
    return re.sub(r"[^\w\u4e00-\u9fff]", "", unicodedata.normalize("NFKC", value).lower())


def similarity(left, right):
    if not left or len(left) != len(right):
        return 0.0
    norm = math.sqrt(sum(x*x for x in left) * sum(x*x for x in right))
    return sum(x*y for x, y in zip(left, right)) / norm if norm else 0.0


def metadata(profile):
    data = dict(profile.custom_features or {})
    scenes = data.get("scenes") or ([data["scene"]] if data.get("scene") else [])
    if isinstance(scenes, str):
        scenes = [scenes]
    data["scenes"] = list(dict.fromkeys(ALIASES.get(str(s).strip().lower(), ALIASES.get(str(s).strip(), str(s).strip())) for s in scenes if str(s).strip()))
    data.setdefault("scope", "全部项目")
    data["title"] = data.get("title") or profile.content[:32]
    data["semantic_key"] = data.get("semantic_key") or hashlib.sha256(normalize(data["title"]).encode()).hexdigest()[:24]
    data["memory_kind"] = "scene_preference"
    return data


class SceneMemoryMixin:
    def _scene_enabled(self):
        return self.org_id == "claude-smart"

    def _scene_init(self):
        self.conn.execute("""CREATE TABLE IF NOT EXISTS scene_memory_exclusions (
            profile_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, content TEXT NOT NULL,
            metadata TEXT NOT NULL, embedding TEXT NOT NULL, deleted_at INTEGER NOT NULL
        )""")
        self.conn.execute("""CREATE TABLE IF NOT EXISTS scene_history_boundaries (
            file_key TEXT PRIMARY KEY, byte_boundary INTEGER NOT NULL,
            fingerprint TEXT NOT NULL, registered_at INTEGER NOT NULL
        )""")

    def _scene_remember_deletion(self, where, params=()):
        if not self._scene_enabled():
            return
        self._scene_init()
        for row in self.conn.execute(f"SELECT * FROM profiles WHERE {where}", params).fetchall():
            if row["status"] not in (None, "pending"):
                continue
            self.conn.execute("""INSERT OR REPLACE INTO scene_memory_exclusions
                VALUES (?,?,?,?,?,?)""", (row["profile_id"], row["user_id"], row["content"],
                row["custom_features"] or "{}", row["embedding"] or "[]", int(time.time())))

    def _scene_same(self, profile, row, deleted=False):
        data = profile.custom_features or {}
        other = json.loads(row["metadata" if deleted else "custom_features"] or "{}")
        # Project-scoped legacy exclusions stay in that project; shared preferences
        # are deliberately reusable across working directories.
        if other.get("memory_kind") != "scene_preference" and row["user_id"] != profile.user_id:
            return False
        if data.get("scope", "全部项目") != other.get("scope", "全部项目"):
            return False
        if deleted and other.get("conflict_with") and profile.profile_id == other["conflict_with"]:
            return False
        if data.get("semantic_key") and data.get("semantic_key") == other.get("semantic_key"):
            return True
        if normalize(profile.content) == normalize(row["content"]):
            return True
        return similarity(profile.embedding, json.loads(row["embedding"] or "[]")) >= (0.90 if deleted else 0.97)

    def _scene_prepare(self, profile):
        if not self._scene_enabled():
            return True
        self._scene_init()
        data = metadata(profile)
        if not data["scenes"] and not MANUAL_WRITE.get():
            # Old queued outputs lack the new contract and must not reintroduce
            # project facts after the migration.
            return False
        profile.custom_features = data
        from reflexio.models.api_schema.service_schemas import ProfileTimeToLive
        from reflexio.models.api_schema.common import NEVER_EXPIRES_TIMESTAMP
        profile.profile_time_to_live = ProfileTimeToLive.INFINITY
        profile.expiration_timestamp = NEVER_EXPIRES_TIMESTAMP
        profile.source_span = profile.notes = profile.reader_angle = None
        profile.source_interaction_ids = []
        for row in self.conn.execute("SELECT * FROM scene_memory_exclusions").fetchall():
            if row["profile_id"] == profile.profile_id or self._scene_same(profile, row, True):
                return False
            other = json.loads(row["metadata"] or "{}")
            if (not MANUAL_WRITE.get() and data["scope"] == other.get("scope")
                    and similarity(profile.embedding, json.loads(row["embedding"] or "[]")) >= 0.78):
                from reflexio.models.api_schema.service_schemas import Status
                profile.status = Status.PENDING
                data["possible_deleted_match"] = row["profile_id"]
        rows = self.conn.execute("SELECT * FROM profiles WHERE status IS NULL OR status='pending' ORDER BY (profile_id=?) DESC", (profile.profile_id,)).fetchall()
        for row in rows:
            if MANUAL_WRITE.get() and row["profile_id"] != profile.profile_id:
                continue
            if not (row["profile_id"] == profile.profile_id or self._scene_same(profile, row)):
                continue
            old = json.loads(row["custom_features"] or "{}")
            if (old.get("manual_state") == "edited" or (profile.status is not None and row["status"] is None)) and not MANUAL_WRITE.get():
                if normalize(profile.content) == normalize(row["content"]):
                    return False
                from reflexio.models.api_schema.service_schemas import Status
                profile.status = Status.PENDING
                data["conflict_with"] = row["profile_id"]
                data.pop("manual_state", None)
                data.pop("manual_version", None)
                # A pending proposal is updated in place on subsequent runs.
                pending = next((r for r in rows if json.loads(r["custom_features"] or "{}").get("conflict_with") == row["profile_id"]), None)
                if pending:
                    profile.profile_id = pending["profile_id"]
                elif profile.profile_id == row["profile_id"]:
                    import uuid
                    profile.profile_id = uuid.uuid4().hex
                break
            profile.profile_id = row["profile_id"]
            profile.user_id = row["user_id"]
            if not MANUAL_WRITE.get():
                data["scenes"] = list(dict.fromkeys(old.get("scenes", []) + data["scenes"]))
            else:
                data["manual_version"] = old.get("manual_version", 0)
            data["semantic_key"] = old.get("semantic_key", data["semantic_key"])
            break
        if MANUAL_WRITE.get():
            data["manual_state"] = "edited"
            data["manual_version"] = int(data.get("manual_version", 0)) + 1
        return True

    def scene_history_cutoff(self):
        with self._lock:
            self._scene_init()
            row = self.conn.execute("SELECT registered_at FROM scene_history_boundaries WHERE file_key='migration-cutoff'").fetchone()
            return row[0] if row else 0

    def scene_filter_interactions(self, groups):
        cutoff = self.scene_history_cutoff()
        result = []
        for group in groups:
            interactions = [item for item in group.interactions if item.created_at > cutoff]
            if interactions:
                result.append(group.model_copy(update={"interactions": interactions}))
        return result

    def scene_search_conditions(self, query):
        text = normalize(query or "")
        detected = []
        triggers = {
            "新增需求": ["新增需求", "新需求", "需求澄清", "设计功能"],
            "修改需求": ["修改需求", "改需求", "需求调整", "优化需求"],
            "写 PRD": ["prd", "需求文档", "需求说明"],
            "输出原型": ["原型", "figma", "pendev", "pencil"],
            "写工作日报": ["工作日报", "写日报", "我的日报"],
            "写今日计划": ["今日计划", "工作计划", "今天的计划"],
            "写今日产出": ["今日产出", "工作产出", "今天的产出"],
        }
        for scene, words in triggers.items():
            if any(normalize(word) in text for word in words):
                detected.append(scene)
        clauses, params = [], []
        if detected:
            allowed = ["通用协作与工具", *detected]
            placeholders = ",".join("?" for _ in allowed)
            clauses.append(f"EXISTS (SELECT 1 FROM json_each(p.custom_features, '$.scenes') WHERE value IN ({placeholders}))")
            params.extend(allowed)
        scopes = ["全部项目"]
        if "公司产品" in text:
            scopes.append("公司产品工作")
        placeholders = ",".join("?" for _ in scopes)
        clauses.append(f"(json_extract(p.custom_features, '$.scope') IN ({placeholders}) OR instr(?, json_extract(p.custom_features, '$.scope')) > 0)")
        params.extend([*scopes, query or ""])
        return clauses, params

    def scene_catalog(self):
        with self._lock:
            self._scene_init()
            profiles = [dict(r) for r in self.conn.execute("SELECT * FROM profiles WHERE status IS NULL OR status='pending'")]
            deleted = [dict(r) for r in self.conn.execute("SELECT * FROM scene_memory_exclusions ORDER BY deleted_at DESC")]
        scenes = list(SCENES)
        items = []
        for row in profiles + deleted:
            data = json.loads(row.get("custom_features") or row.get("metadata") or "{}")
            if "deleted_at" not in row and data.get("memory_kind") != "scene_preference":
                continue
            for scene in data.get("scenes", []):
                if scene not in scenes:
                    scenes.append(scene)
            items.append({"profile_id": row["profile_id"], "user_id": row["user_id"], "content": row["content"],
                "custom_features": data, "state": "deleted" if "deleted_at" in row else ("pending" if row["status"] == "pending" else "active")})
        return {"success": True, "scenes": scenes, "items": items}
