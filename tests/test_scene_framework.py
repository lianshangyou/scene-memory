"""Offline checks for fresh configuration and user-controlled scene memory."""
import os
from pathlib import Path
import tempfile
import time
import unittest

ROOT = Path(__file__).resolve().parents[1]
os.environ.setdefault("REFLEXIO_RERANK_ENABLED", "false")
os.environ["CLAUDE_SMART_USE_LOCAL_CLI"] = "0"

from reflexio.models.api_schema.service_schemas import (
    DeleteUserProfileRequest, Status, UserProfile,
)
from reflexio.models.config_schema import LLMConfig
from reflexio.server.services.configurator.local_file_config_storage import LocalFileConfigStorage
from reflexio.server.services.storage.sqlite_storage import SQLiteStorage
from reflexio.server.services.storage.sqlite_storage.scene_memory import MANUAL_WRITE


class SceneFrameworkTests(unittest.TestCase):
    def test_fresh_config_and_existing_settings(self):
        with tempfile.TemporaryDirectory() as tmp:
            storage = LocalFileConfigStorage("claude-smart", base_dir=tmp)
            config = storage.load_config()
            self.assertIn("scene_preference:", config.profile_extractor_config.extraction_definition_prompt)
            self.assertIsNone(config.user_playbook_extractor_config)
            self.assertIsNone(config.agent_success_config)
            self.assertFalse(config.playbook_optimizer_config.enabled)
            self.assertEqual((config.window_size, config.stride_size), (5, 3))
            config.window_size = 8
            storage.save_config(config)
            self.assertEqual(storage.load_config().window_size, 8)
            self.assertNotIn("scene_preference:", LocalFileConfigStorage("other", base_dir=tmp).get_default_config().profile_extractor_config.extraction_definition_prompt)

    def test_merge_manual_protection_delete_and_scope(self):
        with tempfile.TemporaryDirectory() as tmp:
            storage = SQLiteStorage(org_id="claude-smart", db_path=str(Path(tmp) / "test.db"),
                llm_config=LLMConfig(generation_model_name="openai/test", embedding_model_name="local/minilm-l6-v2"))
            try:
                def profile(pid, content, scene="新增需求"):
                    return UserProfile(profile_id=pid, user_id="project-a", content=content,
                        last_modified_timestamp=int(time.time()), generated_from_request_id="test",
                        embedding=[1., 0.] + [0.] * 510, custom_features={"title": "核查现状",
                        "scenes": [scene], "scope": "示例项目", "semantic_key": "check-current-state"})
                storage.add_user_profile("project-a", [profile("a", "先核对现状。")], skip_embedding=True)
                storage.add_user_profile("project-a", [profile("b", "先核对现状和数据。", "修改需求")], skip_embedding=True)
                self.assertEqual(storage.count_all_profiles(), 1)
                current = storage.get_profile_by_id("a")
                self.assertEqual(set(current.custom_features["scenes"]), {"新增需求", "修改需求"})
                current.content = "手动确认：先核对当前实现。"
                token = MANUAL_WRITE.set(True)
                try:
                    storage.update_user_profile_by_id(current.user_id, current.profile_id, current)
                finally:
                    MANUAL_WRITE.reset(token)
                incoming = profile("c", "自动建议：跳过核查。")
                storage.add_user_profile("project-a", [incoming], skip_embedding=True)
                self.assertEqual(incoming.status, Status.PENDING)
                self.assertTrue(storage.get_profile_by_id("a").content.startswith("手动确认"))
                storage.delete_user_profile(DeleteUserProfileRequest(user_id="project-a", profile_id="a"))
                storage.add_user_profile("project-a", [profile("d", "先了解已有实现。")], skip_embedding=True)
                self.assertIsNone(storage.get_profile_by_id("d"))
                self.assertTrue(any(item["state"] == "deleted" for item in storage.scene_catalog()["items"]))
                clauses, params = storage.scene_search_conditions("为示例项目修改需求")
                self.assertIn("修改需求", params)
                self.assertIn("instr", " ".join(clauses))
                self.assertEqual(storage.conn.execute("PRAGMA integrity_check").fetchone()[0], "ok")
            finally:
                storage.conn.close()


if __name__ == "__main__":
    unittest.main()
