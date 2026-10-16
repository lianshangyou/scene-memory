"use client";

import { PageFrame } from "@/components/common/page-frame";

import { use, useEffect, useMemo, useState } from "react";
import Link from "@/components/common/source-link";
import { useRouter } from "next/navigation";
import { useSettings } from "@/hooks/use-settings";
import {
  ArrowLeft,
  Save,
  AlertTriangle,
  Pencil,
  X,
  Copy,
  Check,
  BookMarked,
  Hash,
  Clock,
  FileText,
} from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { LearningHostProvenance } from "@/components/common/host-badge";
import { EmptyState } from "@/components/common/empty-state";
import { DeleteLearningDangerZone } from "@/components/common/delete-learning-danger-zone";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { reflexio } from "@/lib/reflexio-client";
import { formatTimestamp, truncateId } from "@/lib/format";
import { useRequestHostAttribution } from "@/lib/host-attribution";
import { cn } from "@/lib/utils";
import { statusLabel, localizedStatus } from "@/lib/status";
import type { StatusLabel } from "@/lib/status";
import type { UserPlaybook } from "@/lib/types";

type FormState = { content: string; trigger: string; rationale: string };

function toForm(p: UserPlaybook): FormState {
  return {
    content: p.content,
    trigger: p.trigger ?? "",
    rationale: p.rationale ?? "",
  };
}

function displayName(name: string | null | undefined): string | null {
  if (!name) return null;
  if (name === "default_playbook_extractor") return "项目技能";
  return name;
}

export default function ProjectSkillDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { source } = useSettings();
  const userPlaybookId = Number(id);
  const invalidId =
    !Number.isSafeInteger(userPlaybookId) || userPlaybookId <= 0;

  const [playbook, setPlaybook] = useState<UserPlaybook | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<FormState>({
    content: "",
    trigger: "",
    rationale: "",
  });
  const attribution = useRequestHostAttribution();

  useEffect(() => {
    let cancelled = false;
    if (invalidId) return;
    reflexio
      .getUserPlaybooks({ userPlaybookId, limit: 1 })
      .then((res) => {
        if (cancelled) return;
        const found = res.user_playbooks?.[0];
        if (!found) {
          setNotFound(true);
          return;
        }
        setPlaybook(found);
        setForm(toForm(found));
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [invalidId, userPlaybookId]);

  const dirty = useMemo(() => {
    if (!playbook) return false;
    const orig = toForm(playbook);
    return (
      orig.content !== form.content ||
      orig.trigger !== form.trigger ||
      orig.rationale !== form.rationale
    );
  }, [playbook, form]);

  const save = async () => {
    if (!playbook || !dirty) return;
    setSaving(true);
    setError(null);
    try {
      await reflexio.updateUserPlaybook({
        user_playbook_id: playbook.user_playbook_id,
        content: form.content,
        trigger: form.trigger || null,
        rationale: form.rationale || null,
      });
      setPlaybook({
        ...playbook,
        content: form.content,
        trigger: form.trigger || null,
        rationale: form.rationale || null,
      });
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!playbook) return;
    setDeleting(true);
    try {
      await reflexio.deleteUserPlaybook(playbook.user_playbook_id);
      router.push(`/skills?source=${source}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setDeleting(false);
    }
  };

  const cancelEdit = () => {
    if (playbook) setForm(toForm(playbook));
    setEditing(false);
  };

  if (notFound || invalidId) {
    return (
      <div className="flex-1 overflow-auto">
        <PageHeader title="未找到项目技能" />
        <PageFrame>
          <EmptyState
            icon={AlertTriangle}
            title="未找到项目技能"
            description="该技能可能已被删除、归档，或不在前 100 条结果中。"
            action={
              <Link href="/skills">
                <Button variant="outline" size="sm">
                  <ArrowLeft className="h-3.5 w-3.5" />
                  返回技能列表
                </Button>
              </Link>
            }
          />
        </PageFrame>
      </div>
    );
  }

  const status = playbook ? statusLabel(playbook) : null;

  return (
    <div className="flex-1 overflow-auto">
      <PageHeader
        title={`项目技能 #${playbook?.user_playbook_id ?? id}`}
        description="系统学习的项目专用技能。"
        actions={
          <div className="flex items-center gap-2">
            <Link href="/skills">
              <Button variant="outline" size="sm">
                <ArrowLeft className="h-3.5 w-3.5" />
                返回
              </Button>
            </Link>
            {!editing ? (
              <Button
                size="sm"
                onClick={() => setEditing(true)}
                disabled={!playbook}
              >
                <Pencil className="h-3.5 w-3.5" />
                编辑
              </Button>
            ) : (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={cancelEdit}
                  disabled={saving}
                >
                  <X className="h-3.5 w-3.5" />
                  取消
                </Button>
                <Button size="sm" onClick={save} disabled={saving || !dirty}>
                  <Save className="h-3.5 w-3.5" />
                  {saving ? "保存中…" : "保存"}
                </Button>
              </>
            )}
          </div>
        }
      />

      <PageFrame>
        <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
          <div className="space-y-6 min-w-0">
            {error && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 text-destructive px-4 py-3 text-sm flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {playbook && (
              <div className="flex items-center gap-2 flex-wrap">
                <StatusBadge status={status!} />
                {displayName(playbook.playbook_name) && (
                  <Badge variant="secondary" className="font-mono text-[10px]">
                    {displayName(playbook.playbook_name)}
                  </Badge>
                )}
                {dirty && (
                  <Badge variant="destructive" className="gap-1.5">
                    有未保存的修改
                  </Badge>
                )}
              </div>
            )}

            <Section
              icon={AlertTriangle}
              title="触发条件"
              hint="此规则适用的场景，留空表示始终适用。"
            >
              {editing ? (
                <AutoTextarea
                  value={form.trigger}
                  onChange={(v) => setForm((f) => ({ ...f, trigger: v }))}
                  rows={2}
                  placeholder="例如：编写或运行 Python 异步测试时。"
                />
              ) : (
                <Prose
                  text={playbook?.trigger ?? ""}
                  muted={!playbook?.trigger}
                />
              )}
            </Section>

            <Section
              icon={BookMarked}
              title="规则"
              hint="助手应遵循的规则，将在后续相关会话中注入。"
            >
              {editing ? (
                <AutoTextarea
                  value={form.content}
                  onChange={(v) => setForm((f) => ({ ...f, content: v }))}
                  rows={6}
                  placeholder="例如：使用 anyio 的 trio 后端，禁用 pytest-asyncio。"
                />
              ) : (
                <Prose text={playbook?.content ?? ""} />
              )}
            </Section>

            <Section
              icon={FileText}
              title="原因"
              hint="此规则背后的原因、约束或历史事件。"
            >
              {editing ? (
                <AutoTextarea
                  value={form.rationale}
                  onChange={(v) => setForm((f) => ({ ...f, rationale: v }))}
                  rows={3}
                  placeholder="例如：pytest-asyncio 曾导致项目 CI 死锁，本项目统一使用 trio。"
                />
              ) : (
                <Prose
                  text={playbook?.rationale ?? ""}
                  muted={!playbook?.rationale}
                />
              )}
            </Section>

            {!editing && playbook && (
              <>
                <Separator />
                <DangerZone
                  onDelete={remove}
                  deleting={deleting}
                  disabled={saving}
                />
              </>
            )}
          </div>

          {playbook && (
            <aside className="space-y-3 lg:sticky lg:top-6 lg:self-start">
              <div className="rounded-lg border border-border bg-card p-4">
                <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-3">
                  元数据
                </h3>
                <dl className="space-y-2.5 text-sm">
                  <Meta
                    icon={Hash}
                    label="ID"
                    value={String(playbook.user_playbook_id)}
                    mono
                  />
                  <Meta
                    icon={Clock}
                    label="创建时间"
                    value={formatTimestamp(playbook.created_at)}
                  />
                  <Meta
                    label="智能体版本"
                    value={playbook.agent_version || "default"}
                    mono
                  />
                  {playbook.user_id && (
                    <CopyMeta
                      label="项目"
                      value={playbook.user_id}
                      display={truncateId(playbook.user_id, 32, 8)}
                    />
                  )}
                  {playbook.request_id && (
                    <CopyMeta
                      label="请求"
                      value={playbook.request_id}
                      display={truncateId(playbook.request_id, 8, 4)}
                    />
                  )}
                  {attribution && playbook.request_id && (
                    <Meta
                      label="来源"
                      value={
                        <LearningHostProvenance
                          attribution={attribution}
                          requestId={playbook.request_id}
                        />
                      }
                    />
                  )}
                  {playbook.source && (
                    <Meta label="集成来源" value={playbook.source} mono />
                  )}
                </dl>
              </div>

              {playbook.source_interaction_ids?.length > 0 && (
                <div className="rounded-lg border border-border bg-card p-4">
                  <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-3">
                    提炼来源
                  </h3>
                  <p className="text-xs text-muted-foreground mb-2">
                    {playbook.source_interaction_ids.length} 次交互
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {playbook.source_interaction_ids.slice(0, 24).map((iid) => (
                      <Badge
                        key={iid}
                        variant="outline"
                        className="font-mono text-[10px]"
                      >
                        #{iid}
                      </Badge>
                    ))}
                    {playbook.source_interaction_ids.length > 24 && (
                      <Badge variant="ghost" className="text-[10px]">
                        另有 {playbook.source_interaction_ids.length - 24} 条
                      </Badge>
                    )}
                  </div>
                </div>
              )}
            </aside>
          )}
        </div>
      </PageFrame>
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  hint,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-baseline gap-2">
        <Label className="text-sm font-semibold flex items-center gap-1.5">
          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
          {title}
        </Label>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

function Prose({ text, muted = false }: { text: string; muted?: boolean }) {
  if (!text) {
    return (
      <p className="text-sm text-muted-foreground italic">
        {muted ? "未设置" : "—"}
      </p>
    );
  }
  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-card px-4 py-3",
        muted && "bg-muted/30",
      )}
    >
      <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
        {text}
      </p>
    </div>
  );
}

function AutoTextarea({
  value,
  onChange,
  rows = 3,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={rows}
      placeholder={placeholder}
      className="w-full rounded-lg border border-input bg-transparent px-4 py-3 text-sm leading-relaxed font-sans resize-y outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 placeholder:text-muted-foreground"
    />
  );
}

function StatusBadge({ status }: { status: StatusLabel }) {
  const variant =
    status === "CURRENT"
      ? "secondary"
      : status === "ARCHIVED" || status === "MERGED" || status === "SUPERSEDED"
        ? "outline"
        : "default";
  return (
    <Badge variant={variant} className="gap-1.5">
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          status === "CURRENT" && "bg-emerald-500",
          status === "PENDING" && "bg-amber-500",
          (status === "ARCHIVED" ||
            status === "MERGED" ||
            status === "SUPERSEDED") &&
            "bg-muted-foreground",
        )}
      />
      {localizedStatus(status)}
    </Badge>
  );
}

function Meta({
  icon: Icon,
  label,
  value,
  mono,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-xs text-muted-foreground shrink-0 flex items-center gap-1.5">
        {Icon && <Icon className="h-3 w-3" />}
        {label}
      </dt>
      <dd
        className={cn(
          "text-xs text-right min-w-0 break-words",
          mono && "font-mono",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function CopyMeta({
  label,
  value,
  display,
}: {
  label: string;
  value: string;
  display: string;
}) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // ignore
    }
  };
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-xs text-muted-foreground shrink-0">{label}</dt>
      <dd className="text-xs min-w-0 flex items-center gap-1.5">
        <code className="font-mono">{display}</code>
        <button
          onClick={copy}
          className="text-muted-foreground hover:text-foreground transition-colors"
          title="复制完整 ID"
        >
          {copied ? (
            <Check className="h-3 w-3 text-emerald-500" />
          ) : (
            <Copy className="h-3 w-3" />
          )}
        </button>
      </dd>
    </div>
  );
}

function DangerZone({
  onDelete,
  deleting,
  disabled,
}: {
  onDelete: () => void;
  deleting: boolean;
  disabled: boolean;
}) {
  return (
    <DeleteLearningDangerZone
      learningName="此项目技能"
      description="永久删除此技能。"
      consequences={[
        "此技能将不再注入本项目的后续会话。",
        "历史会话记录中可能仍会显示此前的使用情况。",
      ]}
      onDelete={onDelete}
      deleting={deleting}
      disabled={disabled}
    />
  );
}
