"use client";

import { PageFrame } from "@/components/common/page-frame";

import { useEffect, useState } from "react";
import { Save, CheckCircle2 } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { SETTINGS_CHANGED_EVENT } from "@/hooks/use-settings";
import type {
  ClaudeCodeHookConfig,
  ClaudeSmartConfig,
  OptimizerMode,
} from "@/lib/types";

export default function ConfigureEnvPage() {
  const [config, setConfig] = useState<ClaudeSmartConfig | null>(null);
  const [hookConfig, setHookConfig] = useState<ClaudeCodeHookConfig | null>(
    null,
  );
  const [hookDirty, setHookDirty] = useState(false);
  const [apiKeyDirty, setApiKeyDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/config", { cache: "no-store" }).then((r) => r.json()),
      fetch("/api/claude-settings", { cache: "no-store" }).then((r) =>
        r.json(),
      ),
    ])
      .then(([envConfig, claudeConfig]) => {
        setConfig(envConfig);
        setHookConfig(claudeConfig);
        setHookDirty(false);
        setApiKeyDirty(false);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  const update = <K extends keyof ClaudeSmartConfig>(
    key: K,
    value: ClaudeSmartConfig[K],
  ) => {
    setConfig((prev) => (prev ? { ...prev, [key]: value } : prev));
    setSaved(false);
  };

  const updateOptimizer = (mode: OptimizerMode) => {
    setHookConfig((prev) =>
      prev
        ? {
            ...prev,
            CLAUDE_SMART_ENABLE_OPTIMIZER: mode,
            effectiveValue: mode,
            localValue: mode === "auto" ? null : mode,
          }
        : prev,
    );
    setHookDirty(true);
    setSaved(false);
  };

  const save = async () => {
    if (!config || !hookConfig) return;
    setSaving(true);
    setError(null);
    try {
      const envUpdate: Partial<ClaudeSmartConfig> = { ...config };
      if (!apiKeyDirty) delete envUpdate.REFLEXIO_API_KEY;
      delete envUpdate.REFLEXIO_API_KEY_SET;
      const [envRes, hookRes] = await Promise.all([
        fetch("/api/config", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(envUpdate),
        }),
        fetch("/api/claude-settings", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(
            hookDirty
              ? {
                  CLAUDE_SMART_ENABLE_OPTIMIZER:
                    hookConfig.CLAUDE_SMART_ENABLE_OPTIMIZER,
                }
              : {},
          ),
        }),
      ]);
      if (!envRes.ok)
        throw new Error(`运行环境保存失败：${envRes.status}`);
      if (!hookRes.ok)
        throw new Error(`Claude Code 设置保存失败：${hookRes.status}`);
      const updated: ClaudeSmartConfig = await envRes.json();
      const updatedHook: ClaudeCodeHookConfig = await hookRes.json();
      setConfig(updated);
      setHookConfig(updatedHook);
      window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT));
      setHookDirty(false);
      setApiKeyDirty(false);
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader
        title="运行环境"
        description="配置当前使用的学习运行环境。管理页的数据源选项只影响查看内容。"
        actions={
          <Button
            onClick={save}
            disabled={!config || !hookConfig || saving}
            size="sm"
          >
            <Save className="h-3.5 w-3.5" />
            {saving ? "保存中…" : "保存"}
          </Button>
        }
      />

      <PageFrame className="space-y-5">
        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 text-destructive px-4 py-3 text-sm">
            {error}
          </div>
        )}
        {saved && (
          <div className="rounded-lg border border-border bg-accent/40 px-4 py-2.5 text-sm flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
            已保存至 ~/.claude-smart/.env 和 Claude Code 设置
          </div>
        )}

        <section className="space-y-4 border-t border-border py-5">
          <div>
            <h2 className="text-sm font-semibold">本机运行环境</h2>
            <p className="text-xs text-muted-foreground">
              写入 <code className="font-mono">~/.claude-smart/.env</code>，保留未知配置项，由记忆服务后端读取。
            </p>
          </div>

          {config === null && !error ? (
            <div className="text-sm text-muted-foreground">加载中…</div>
          ) : config ? (
            <div className="space-y-5">
              <div className="space-y-2">
                <Label>后端地址</Label>
                <Input
                  value={config.REFLEXIO_URL}
                  onChange={(e) => update("REFLEXIO_URL", e.target.value)}
                  className="font-mono text-xs bg-background/80"
                  placeholder="http://localhost:8071/"
                />
              </div>

              <div className="space-y-2">
                <Label>后端 API 密钥</Label>
                <Input
                  type="password"
                  value={String(config.REFLEXIO_API_KEY ?? "")}
                  onChange={(e) => {
                    setApiKeyDirty(true);
                    update("REFLEXIO_API_KEY", e.target.value);
                  }}
                  className="font-mono text-xs bg-background/80"
                  placeholder={
                    config.REFLEXIO_API_KEY_SET
                      ? "（已配置，留空则保留现有密钥）"
                      : "（留空使用本地模式）"
                  }
                  autoComplete="off"
                />
              </div>

              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <Label htmlFor="use-local-cli">
                    使用本地 CLI 提炼
                  </Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    通过配置的本地 CLI 调用模型进行提炼。
                  </p>
                </div>
                <Switch
                  id="use-local-cli"
                  checked={!!config.CLAUDE_SMART_USE_LOCAL_CLI}
                  onCheckedChange={(v) =>
                    update("CLAUDE_SMART_USE_LOCAL_CLI", v)
                  }
                />
              </div>

              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <Label htmlFor="use-local-embed">
                    使用本地向量模型
                  </Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    使用进程内 ONNX 向量模型，支持离线检索。
                  </p>
                </div>
                <Switch
                  id="use-local-embed"
                  checked={!!config.CLAUDE_SMART_USE_LOCAL_EMBEDDING}
                  onCheckedChange={(v) =>
                    update("CLAUDE_SMART_USE_LOCAL_EMBEDDING", v)
                  }
                />
              </div>

              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <Label htmlFor="read-only-mode">只读模式</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    保留会话上下文，但不向记忆服务发布交互记录。
                  </p>
                </div>
                <Switch
                  id="read-only-mode"
                  checked={!!config.CLAUDE_SMART_READ_ONLY}
                  onCheckedChange={(v) => update("CLAUDE_SMART_READ_ONLY", v)}
                />
              </div>

              <div className="space-y-2">
                <Label>本地 CLI 路径</Label>
                <Input
                  value={String(config.CLAUDE_SMART_CLI_PATH ?? "")}
                  onChange={(e) =>
                    update("CLAUDE_SMART_CLI_PATH", e.target.value)
                  }
                  className="font-mono text-xs bg-background/80"
                  placeholder="（留空则通过 PATH 自动查找）"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="learning-model">本地提炼模型</Label>
                <Input
                  id="learning-model"
                  value={String(config.CLAUDE_SMART_LEARNING_MODEL ?? "")}
                  onChange={(event) =>
                    update("CLAUDE_SMART_LEARNING_MODEL", event.target.value)
                  }
                  placeholder="使用提供商默认模型"
                />
                <p className="text-xs text-muted-foreground">
                  填写本地提炼工具支持的模型 ID，保存后重启本地后端生效。当前为本地修补版本，更新前请保留补丁。托管服务使用其服务端配置。
                </p>
              </div>

              <div className="space-y-2">
                <Label>CLI 超时时间（秒）</Label>
                <Input
                  value={String(config.CLAUDE_SMART_CLI_TIMEOUT ?? "")}
                  onChange={(e) =>
                    update("CLAUDE_SMART_CLI_TIMEOUT", e.target.value)
                  }
                  className="font-mono text-xs bg-background/80"
                  placeholder="120"
                />
              </div>

              <div className="space-y-2">
                <Label>会话缓存目录</Label>
                <Input
                  value={String(config.CLAUDE_SMART_STATE_DIR ?? "")}
                  onChange={(e) =>
                    update("CLAUDE_SMART_STATE_DIR", e.target.value)
                  }
                  className="font-mono text-xs bg-background/80"
                  placeholder="（留空则使用 ~/.claude-smart/sessions）"
                />
              </div>
            </div>
          ) : null}
        </section>

        <section className="space-y-4 border-t border-border py-5">
          <div>
            <h2 className="text-sm font-semibold">
              Claude Code 钩子环境
            </h2>
            <p className="text-xs text-muted-foreground">
              写入{" "}
              <code className="font-mono">.claude/settings.local.json</code>，钩子环境变更将在新的 Claude Code 会话中生效。
            </p>
          </div>

          {hookConfig === null && !error ? (
            <div className="text-sm text-muted-foreground">加载中…</div>
          ) : hookConfig ? (
            <div className="space-y-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <Label htmlFor="enable-optimizer">
                    共享技能优化
                  </Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    控制会话启动时的共享技能优化与汇总，自动模式仅适用于本地服务。
                  </p>
                </div>
                <Select
                  value={hookConfig.CLAUDE_SMART_ENABLE_OPTIMIZER}
                  onValueChange={(value) =>
                    updateOptimizer((value as OptimizerMode) ?? "auto")
                  }
                >
                  <SelectTrigger
                    id="enable-optimizer"
                    size="sm"
                    className="w-40 text-xs bg-background/80"
                  >
                    <SelectValue placeholder="模式" />
                  </SelectTrigger>
                  <SelectContent align="end">
                    <SelectItem value="auto">自动</SelectItem>
                    <SelectItem value="enabled">启用</SelectItem>
                    <SelectItem value="disabled">停用</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="rounded-md border border-border bg-background/60 p-3 text-xs text-muted-foreground space-y-2">
                <div className="flex items-center justify-between gap-4">
                  <span>生效值</span>
                  <span className="font-medium text-foreground">
                    {formatSettingValue(hookConfig.effectiveValue)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span>项目覆盖值</span>
                  <span className="font-medium text-foreground">
                    {formatSettingValue(hookConfig.localValue)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span>用户设置</span>
                  <span className="font-medium text-foreground">
                    {formatSettingValue(hookConfig.userValue)}
                  </span>
                </div>
                <div className="pt-1 space-y-1">
                  <p>
                    项目配置文件：{" "}
                    <code className="font-mono break-all">
                      {hookConfig.settingsPath}
                    </code>
                  </p>
                  <p>
                    用户配置文件：{" "}
                    <code className="font-mono break-all">
                      {hookConfig.userSettingsPath}
                    </code>
                  </p>
                </div>
              </div>
            </div>
          ) : null}
        </section>
      </PageFrame>
    </>
  );
}

function formatSettingValue(value: OptimizerMode | null): string {
  if (value === null) return "未设置";
  if (value === "auto") return "自动（仅本地）";
  return value === "enabled" ? "启用" : "停用";
}
