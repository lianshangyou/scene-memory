"use client";

import { PageFrame } from "@/components/common/page-frame";

import { useCallback, useEffect, useState } from "react";
import { Save, CheckCircle2 } from "lucide-react";
import { reflexio } from "@/lib/reflexio-client";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { ReflexioConfig, ReflexioRetrievalFloorConfig } from "@/lib/types";

type ExtractorField =
  | "profile_extractor_configs"
  | "user_playbook_extractor_configs";

const DEFAULT_RETRIEVAL_FLOOR: Required<
  Pick<
    ReflexioRetrievalFloorConfig,
    | "enabled"
    | "pool_size"
    | "profile_floor"
    | "user_playbook_floor"
    | "agent_playbook_floor"
  >
> = {
  enabled: false,
  pool_size: 30,
  profile_floor: -3,
  user_playbook_floor: -3,
  agent_playbook_floor: -3,
};

export default function ConfigureServerPage() {
  const [srvConfig, setSrvConfig] = useState<ReflexioConfig | null>(null);
  const [srvError, setSrvError] = useState<string | null>(null);
  const [srvSaved, setSrvSaved] = useState(false);
  const [srvSaving, setSrvSaving] = useState(false);
  const [srvLoading, setSrvLoading] = useState(true);

  const fetchSrvConfig = useCallback(async (): Promise<ReflexioConfig> => {
    return reflexio.getServerConfiguration();
  }, []);

  useEffect(() => {
    let alive = true;
    async function load() {
      setSrvLoading(true);
      setSrvError(null);
      try {
        const data = await fetchSrvConfig();
        if (alive) setSrvConfig(data);
      } catch (e) {
        if (alive) setSrvError(e instanceof Error ? e.message : String(e));
      } finally {
        if (alive) setSrvLoading(false);
      }
    }
    void load();
    return () => {
      alive = false;
    };
  }, [fetchSrvConfig]);

  const updateSrv = <K extends keyof ReflexioConfig>(
    key: K,
    value: ReflexioConfig[K],
  ) => {
    setSrvConfig((prev) => (prev ? { ...prev, [key]: value } : prev));
    setSrvSaved(false);
  };

  const updateExtractorPrompt = (field: ExtractorField, v: string) => {
    setSrvConfig((prev) => {
      if (!prev) return prev;
      const list = prev[field];
      if (!list || list.length === 0) return prev;
      const next = [...list];
      next[0] = { ...next[0], extraction_definition_prompt: v };
      return { ...prev, [field]: next };
    });
    setSrvSaved(false);
  };

  const updateReranker = (enabled: boolean) => {
    setSrvConfig((prev) =>
      prev
        ? {
            ...prev,
            retrieval_floor: {
              ...DEFAULT_RETRIEVAL_FLOOR,
              ...(prev.retrieval_floor ?? {}),
              enabled,
            },
          }
        : prev,
    );
    setSrvSaved(false);
  };

  const saveSrv = async () => {
    if (!srvConfig) return;
    setSrvSaving(true);
    setSrvError(null);
    try {
      await reflexio.setServerConfiguration(srvConfig);
      const fresh = await fetchSrvConfig();
      setSrvConfig(fresh);
      setSrvSaved(true);
    } catch (e) {
      setSrvError(e instanceof Error ? e.message : String(e));
    } finally {
      setSrvSaving(false);
    }
  };

  return (
    <>
      <PageHeader
        title="记忆服务"
        description="所选记忆服务的后端配置。"
        actions={
          <Button
            onClick={saveSrv}
            disabled={!srvConfig || srvSaving}
            size="sm"
          >
            <Save className="h-3.5 w-3.5" />
            {srvSaving ? "保存中…" : "保存"}
          </Button>
        }
      />

      <PageFrame className="space-y-5">
        {srvError && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 text-destructive px-4 py-3 text-sm">
            {srvError}
          </div>
        )}
        {srvSaved && (
          <div className="rounded-lg border border-border bg-accent/40 px-4 py-2.5 text-sm flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
            已保存至记忆服务
          </div>
        )}

        {srvLoading ? (
          <div className="text-sm text-muted-foreground">加载中…</div>
        ) : srvConfig ? (
          <section className="space-y-5 border-t border-border py-5">
            <div className="space-y-2">
              <Label>智能体补充说明</Label>
              <p className="text-xs text-muted-foreground">
                描述智能体工作环境的补充上下文，将添加到提炼器提示词开头。
              </p>
              <textarea
                value={srvConfig.agent_context_prompt ?? ""}
                onChange={(e) =>
                  updateSrv("agent_context_prompt", e.target.value || null)
                }
                className="w-full font-mono text-xs min-h-[80px] rounded-md border border-input bg-background/80 px-3 py-2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                placeholder="（留空）"
              />
            </div>

            <div className="space-y-2">
              <Label>提炼窗口大小</Label>
              <p className="text-xs text-muted-foreground">
                每次提炼读取最近多少次交互。
              </p>
              <Input
                type="number"
                min={1}
                value={srvConfig.window_size ?? ""}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  updateSrv(
                    "window_size",
                    Number.isFinite(n) && n > 0 ? n : undefined,
                  );
                }}
                className="font-mono text-xs bg-background/80"
                placeholder="10"
              />
            </div>

            <div className="space-y-2">
              <Label>提炼步长</Label>
              <p className="text-xs text-muted-foreground">
                累计多少次新交互后触发下一次提炼。
              </p>
              <Input
                type="number"
                min={1}
                value={srvConfig.stride_size ?? ""}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  updateSrv(
                    "stride_size",
                    Number.isFinite(n) && n > 0 ? n : undefined,
                  );
                }}
                className="font-mono text-xs bg-background/80"
                placeholder="5"
              />
            </div>

            <div className="flex items-start justify-between gap-4 rounded-md border border-border bg-background/60 p-3">
              <div className="min-w-0">
                <Label htmlFor="search-reranker">检索重排序</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  为注入的记忆检索启用跨编码器相关性阈值。内置本地后端停用了此模型，此开关适用于支持重排序的其他服务部署。
                </p>
              </div>
              <Switch
                id="search-reranker"
                checked={!!srvConfig.retrieval_floor?.enabled}
                onCheckedChange={updateReranker}
              />
            </div>

            <div className="space-y-2">
              <Label>偏好提炼重点</Label>
              <p className="text-xs text-muted-foreground">
                偏好提炼器应重点关注的内容。
              </p>
              {srvConfig.profile_extractor_configs &&
              srvConfig.profile_extractor_configs.length > 0 ? (
                <textarea
                  value={
                    srvConfig.profile_extractor_configs[0]
                      .extraction_definition_prompt ?? ""
                  }
                  onChange={(e) =>
                    updateExtractorPrompt(
                      "profile_extractor_configs",
                      e.target.value,
                    )
                  }
                  className="w-full font-mono text-xs min-h-[120px] rounded-md border border-input bg-background/80 px-3 py-2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              ) : (
                <div className="text-xs text-muted-foreground italic">
                  服务端未配置偏好提炼器。
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>项目技能提炼重点</Label>
              <p className="text-xs text-muted-foreground">
                项目技能提炼器应重点关注的内容。
              </p>
              {srvConfig.user_playbook_extractor_configs &&
              srvConfig.user_playbook_extractor_configs.length > 0 ? (
                <textarea
                  value={
                    srvConfig.user_playbook_extractor_configs[0]
                      .extraction_definition_prompt ?? ""
                  }
                  onChange={(e) =>
                    updateExtractorPrompt(
                      "user_playbook_extractor_configs",
                      e.target.value,
                    )
                  }
                  className="w-full font-mono text-xs min-h-[120px] rounded-md border border-input bg-background/80 px-3 py-2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              ) : (
                <div className="text-xs text-muted-foreground italic">
                  服务端未配置项目技能提炼器。
                </div>
              )}
            </div>
          </section>
        ) : null}
      </PageFrame>
    </>
  );
}
