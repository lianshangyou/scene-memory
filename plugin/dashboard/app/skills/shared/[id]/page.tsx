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
import { EmptyState } from "@/components/common/empty-state";
import { DeleteLearningDangerZone } from "@/components/common/delete-learning-danger-zone";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { reflexio } from "@/lib/reflexio-client";
import { formatTimestamp, truncateId } from "@/lib/format";
import { cn } from "@/lib/utils";
import { agentPlaybookStatusLabel, statusLabel, localizedStatus } from "@/lib/status";
import type { StatusLabel } from "@/lib/status";
import type { AgentPlaybook, AgentPlaybookStatus } from "@/lib/types";

type FormState = {
  content: string;
  trigger: string;
  rationale: string;
  playbookStatus: AgentPlaybookStatus;
};

function toForm(p: AgentPlaybook): FormState {
  return {
    content: p.content,
    trigger: p.trigger ?? "",
    rationale: p.rationale ?? "",
    playbookStatus: p.playbook_status,
  };
}

function displayName(name: string | null | undefined): string | null {
  if (!name) return null;
  if (name === "default_playbook_extractor") return "共享技能";
  return name;
}

const REVIEW_STATUS_META: Record<
  AgentPlaybookStatus,
  { label: string; description: string }
> = {
  pending: {
    label: "自动生成",
    description:
      "自动生成的共享技能，可能会自动更新。",
  },
  approved: {
    label: "已固定",
    description: "已固定的共享技能，不会自动更新。",
  },
  rejected: {
    label: "已拒绝",
    description: "已拒绝的共享技能，系统不会使用。",
  },
};

export default function SharedSkillDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { source } = useSettings();

  const [playbook, setPlaybook] = useState<AgentPlaybook | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [reviewingStatus, setReviewingStatus] =
    useState<AgentPlaybookStatus | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<FormState>({
    content: "",
    trigger: "",
    rationale: "",
    playbookStatus: "pending",
  });

  useEffect(() => {
    let cancelled = false;
    reflexio
      .getAgentPlaybooks({})
      .then((res) => {
        if (cancelled) return;
        const found = (res.agent_playbooks ?? []).find(
          (p) => String(p.agent_playbook_id) === id,
        );
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
  }, [id]);

  const dirty = useMemo(() => {
    if (!playbook) return false;
    const orig = toForm(playbook);
    return (
      orig.content !== form.content ||
      orig.trigger !== form.trigger ||
      orig.rationale !== form.rationale ||
      orig.playbookStatus !== form.playbookStatus
    );
  }, [playbook, form]);

  const save = async () => {
    if (!playbook || !dirty) return;
    setSaving(true);
    setError(null);
    try {
      await reflexio.updateAgentPlaybook({
        agent_playbook_id: playbook.agent_playbook_id,
        content: form.content,
        trigger: form.trigger || null,
        rationale: form.rationale || null,
        playbook_status: form.playbookStatus,
      });
      setPlaybook({
        ...playbook,
        content: form.content,
        trigger: form.trigger || null,
        rationale: form.rationale || null,
        playbook_status: form.playbookStatus,
      });
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const setReviewStatus = async (nextStatus: AgentPlaybookStatus) => {
    if (!playbook || playbook.playbook_status === nextStatus) return;
    if (
      nextStatus === "rejected" &&
      !confirm(
        `确定拒绝共享技能 #${playbook.agent_playbook_id}？系统将不再使用已拒绝的共享技能。`,
      )
    ) {
      return;
    }

    setReviewingStatus(nextStatus);
    setError(null);
    try {
      await reflexio.updateAgentPlaybook({
        agent_playbook_id: playbook.agent_playbook_id,
        playbook_status: nextStatus,
      });
      setPlaybook((current) =>
        current ? { ...current, playbook_status: nextStatus } : current,
      );
      setForm((current) => ({ ...current, playbookStatus: nextStatus }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setReviewingStatus(null);
    }
  };

  const remove = async () => {
    if (!playbook) return;
    setDeleting(true);
    try {
      await reflexio.deleteAgentPlaybook(playbook.agent_playbook_id);
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

  if (notFound) {
    return (
      <div className="flex-1 overflow-auto">
        <PageHeader title="未找到共享技能" />
        <PageFrame>
          <EmptyState
            icon={AlertTriangle}
            title="未找到共享技能"
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

  const lifecycleStatus = playbook ? statusLabel(playbook) : null;
  const playbookStatus = playbook ? agentPlaybookStatusLabel(playbook) : null;

  return (
    <div className="flex-1 overflow-auto">
      <PageHeader
        title={`共享技能 #${playbook?.agent_playbook_id ?? id}`}
        description="从项目技能中汇总生成的共享技能。"
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
                disabled={!playbook || reviewingStatus !== null}
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
                {editing ? (
                  <ReviewStatusBadge
                    status={playbook.playbook_status}
                    displayStatus={playbookStatus!}
                  />
                ) : (
                  <ReviewStatusSelect
                    status={playbook.playbook_status}
                    displayStatus={playbookStatus!}
                    disabled={reviewingStatus !== null || deleting}
                    busy={reviewingStatus !== null}
                    onChange={setReviewStatus}
                  />
                )}
                {lifecycleStatus !== "CURRENT" && (
                  <StatusBadge status={lifecycleStatus!} />
                )}
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
              hint="此共享技能适用的场景，留空表示始终适用。"
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
              icon={Check}
              title="审核状态"
              hint="自动生成、已固定或已拒绝。"
            >
              {editing ? (
                <Select
                  value={form.playbookStatus}
                  onValueChange={(v) =>
                    setForm((f) => ({
                      ...f,
                      playbookStatus: v as AgentPlaybookStatus,
                    }))
                  }
                >
                  <SelectTrigger
                    className="w-48 text-xs"
                    title={REVIEW_STATUS_META[form.playbookStatus].description}
                  >
                    <SelectValue placeholder="状态" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem
                      value="pending"
                      title={REVIEW_STATUS_META.pending.description}
                    >
                      {REVIEW_STATUS_META.pending.label}
                    </SelectItem>
                    <SelectItem
                      value="approved"
                      title={REVIEW_STATUS_META.approved.description}
                    >
                      {REVIEW_STATUS_META.approved.label}
                    </SelectItem>
                    <SelectItem
                      value="rejected"
                      title={REVIEW_STATUS_META.rejected.description}
                    >
                      {REVIEW_STATUS_META.rejected.label}
                    </SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                playbook && (
                  <ReviewStatusSelect
                    status={playbook.playbook_status}
                    displayStatus={playbookStatus ?? "PENDING"}
                    disabled={reviewingStatus !== null || deleting}
                    busy={reviewingStatus !== null}
                    onChange={setReviewStatus}
                  />
                )
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
                    value={String(playbook.agent_playbook_id)}
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
                  <Meta
                    label="审核"
                    value={REVIEW_STATUS_META[playbook.playbook_status].label}
                    mono
                  />
                  {playbook.playbook_metadata && (
                    <CopyMeta
                      label="元数据"
                      value={playbook.playbook_metadata}
                      display={truncateId(playbook.playbook_metadata, 32, 8)}
                    />
                  )}
                </dl>
              </div>
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

function StatusBadge({
  status,
}: {
  status: StatusLabel | "APPROVED" | "REJECTED";
}) {
  const variant =
    status === "CURRENT" || status === "APPROVED"
      ? "secondary"
      : status === "ARCHIVED" ||
          status === "MERGED" ||
          status === "SUPERSEDED" ||
          status === "REJECTED"
        ? "outline"
        : "default";
  return (
    <Badge variant={variant} className="gap-1.5">
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          status === "CURRENT" && "bg-emerald-500",
          status === "APPROVED" && "bg-emerald-500",
          status === "PENDING" && "bg-amber-500",
          status === "REJECTED" && "bg-destructive",
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

function ReviewStatusSelect({
  status,
  displayStatus,
  disabled,
  busy,
  onChange,
}: {
  status: AgentPlaybookStatus;
  displayStatus: "PENDING" | "APPROVED" | "REJECTED";
  disabled: boolean;
  busy: boolean;
  onChange: (status: AgentPlaybookStatus) => void;
}) {
  const meta = REVIEW_STATUS_META[status];

  return (
    <Select
      value={status}
      onValueChange={(value) => onChange(value as AgentPlaybookStatus)}
      disabled={disabled}
    >
      <SelectTrigger
        size="sm"
        aria-label="审核状态"
        title={meta.description}
        className={cn(
          "h-7 w-fit gap-1.5 rounded-lg border px-2.5 py-0 text-xs font-medium",
          "bg-background hover:bg-muted focus-visible:ring-3",
          displayStatus === "APPROVED" &&
            "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
          displayStatus === "PENDING" &&
            "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
          displayStatus === "REJECTED" &&
            "border-destructive/30 bg-destructive/10 text-destructive",
        )}
      >
        <StatusPillContent
          status={displayStatus}
          label={busy ? "更新中" : meta.label}
        />
      </SelectTrigger>
      <SelectContent align="start" alignItemWithTrigger={false}>
        <SelectItem
          value="pending"
          title={REVIEW_STATUS_META.pending.description}
        >
          <StatusPillContent
            status="PENDING"
            label={REVIEW_STATUS_META.pending.label}
          />
        </SelectItem>
        <SelectItem
          value="approved"
          title={REVIEW_STATUS_META.approved.description}
        >
          <StatusPillContent
            status="APPROVED"
            label={REVIEW_STATUS_META.approved.label}
          />
        </SelectItem>
        <SelectItem
          value="rejected"
          title={REVIEW_STATUS_META.rejected.description}
        >
          <StatusPillContent
            status="REJECTED"
            label={REVIEW_STATUS_META.rejected.label}
          />
        </SelectItem>
      </SelectContent>
    </Select>
  );
}

function ReviewStatusBadge({
  status,
  displayStatus,
}: {
  status: AgentPlaybookStatus;
  displayStatus: "PENDING" | "APPROVED" | "REJECTED";
}) {
  const meta = REVIEW_STATUS_META[status];
  return (
    <Badge
      variant={displayStatus === "REJECTED" ? "outline" : "secondary"}
      className={cn(
        "gap-1.5",
        displayStatus === "APPROVED" &&
          "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
        displayStatus === "PENDING" &&
          "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
        displayStatus === "REJECTED" &&
          "border-destructive/30 bg-destructive/10 text-destructive",
      )}
      title={meta.description}
    >
      <StatusPillContent status={displayStatus} label={meta.label} />
    </Badge>
  );
}

function StatusPillContent({
  status,
  label,
}: {
  status: "PENDING" | "APPROVED" | "REJECTED";
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          status === "APPROVED" && "bg-emerald-500",
          status === "PENDING" && "bg-amber-500",
          status === "REJECTED" && "bg-destructive",
        )}
      />
      {label}
    </span>
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
  value: string;
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
      learningName="此共享技能"
      description="永久删除此共享技能。"
      consequences={[
        "系统将不再使用此共享技能。",
        "历史会话记录中可能仍会显示此前的使用情况。",
      ]}
      onDelete={onDelete}
      deleting={deleting}
      disabled={disabled}
    />
  );
}
