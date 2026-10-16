"use client";

import { PageFrame } from "@/components/common/page-frame";

import { useEffect, useMemo, useState } from "react";
import Link from "@/components/common/source-link";
import { AlertTriangle, BookOpen, ChevronRight, Layers3 } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { HostBadge } from "@/components/common/host-badge";
import { LearningApplicationBadge } from "@/components/common/learning-application-badge";
import { EmptyState } from "@/components/common/empty-state";
import { DeleteAllButton } from "@/components/common/delete-all-button";
import { PageTabs } from "@/components/common/page-tabs";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { reflexio } from "@/lib/reflexio-client";
import { formatRelative } from "@/lib/format";
import { useRequestHostAttribution } from "@/lib/host-attribution";
import { cn } from "@/lib/utils";
import {
  agentPlaybookStatusLabel,
  statusLabel,
  type AgentPlaybookStatusLabel,
  type StatusLabel,
} from "@/lib/status";
import type {
  AgentPlaybook,
  Host,
  PlaybookApplicationStat,
  UserPlaybook,
} from "@/lib/types";

type SkillKind = "project" | "shared";
type SkillStatus = StatusLabel | AgentPlaybookStatusLabel;
type SkillSort = "newest" | "applied";

const ALL_LIFECYCLE_STATUSES: (string | null)[] = [null, "pending", "archived"];

const SHARED_STATUS_META: Record<
  AgentPlaybookStatusLabel,
  { label: string; description: string }
> = {
  PENDING: {
    label: "自动生成",
    description:
      "自动生成的共享技能，可能会自动更新。",
  },
  APPROVED: {
    label: "已固定",
    description: "已固定的共享技能，不会自动更新。",
  },
  REJECTED: {
    label: "已拒绝",
    description: "已拒绝的共享技能，系统不会使用。",
  },
};

interface SkillCard {
  kind: SkillKind;
  id: number;
  createdAt: number;
  content: string;
  trigger: string | null;
  rationale: string | null;
  status: SkillStatus;
  scopeId: string;
  host: Host | null;
}

function projectSkill(
  p: UserPlaybook,
  requestHosts?: ReadonlyMap<string, Host | null>,
): SkillCard {
  return {
    kind: "project",
    id: p.user_playbook_id,
    createdAt: p.created_at,
    content: p.content,
    trigger: p.trigger,
    rationale: p.rationale,
    status: statusLabel(p),
    scopeId: p.user_id || "unknown",
    host: requestHosts?.get(p.request_id) ?? null,
  };
}

function sharedSkill(p: AgentPlaybook): SkillCard {
  return {
    kind: "shared",
    id: p.agent_playbook_id,
    createdAt: p.created_at,
    content: p.content,
    trigger: p.trigger,
    rationale: p.rationale,
    status: agentPlaybookStatusLabel(p),
    scopeId: p.agent_version || "default",
    host: null,
  };
}

function skillStatKey(skill: SkillCard): string {
  const sourceKind =
    skill.kind === "shared" ? "agent_playbook" : "user_playbook";
  return `playbook:${sourceKind}:${skill.id}`;
}

export default function SkillsPage() {
  const [projectSkills, setProjectSkills] = useState<UserPlaybook[] | null>(
    null,
  );
  const [sharedSkills, setSharedSkills] = useState<AgentPlaybook[] | null>(
    null,
  );
  const [appStats, setAppStats] = useState<PlaybookApplicationStat[] | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [activeKind, setActiveKind] = useState<SkillKind>("project");
  const [scope, setScope] = useState<string>("__all__");
  const [statusFilter, setStatusFilter] = useState<string>("CURRENT");
  const [sortBy, setSortBy] = useState<SkillSort>("newest");
  const [search, setSearch] = useState("");
  const attribution = useRequestHostAttribution();

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [projectRes, sharedRes, statsRes] = await Promise.all([
          reflexio.getUserPlaybooks({
            limit: 500,
            statusFilter: ALL_LIFECYCLE_STATUSES,
          }),
          reflexio.getAgentPlaybooks({
            limit: 500,
            statusFilter: ALL_LIFECYCLE_STATUSES,
          }),
          reflexio.getAppliedRules(),
        ]);
        if (cancelled) return;
        setProjectSkills(projectRes.user_playbooks ?? []);
        setSharedSkills(sharedRes.agent_playbooks ?? []);
        setAppStats(statsRes.stats ?? []);
        setError(null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const legacyUsage = useMemo(
    () =>
      (appStats ?? []).filter(
        (stat) => stat.kind === "playbook" && !stat.source_kind,
      ),
    [appStats],
  );

  const statsByRule = useMemo(() => {
    const map = new Map<string, PlaybookApplicationStat>();
    for (const s of appStats ?? []) {
      map.set(`${s.kind}:${s.source_kind ?? "unknown"}:${s.real_id}`, s);
    }
    return map;
  }, [appStats]);

  const activeSkills = useMemo(() => {
    return activeKind === "project"
      ? (projectSkills ?? []).map((playbook) =>
          projectSkill(playbook, attribution?.hosts),
        )
      : (sharedSkills ?? []).map(sharedSkill);
  }, [activeKind, attribution, projectSkills, sharedSkills]);

  const scopes = useMemo(() => {
    const set = new Set<string>();
    for (const p of activeSkills) set.add(p.scopeId);
    return Array.from(set).sort();
  }, [activeSkills]);

  const filtered = useMemo(() => {
    const matches = activeSkills.filter((p) => {
      if (scope !== "__all__" && p.scopeId !== scope) return false;
      if (statusFilter !== "__all__" && p.status !== statusFilter) return false;
      if (search) {
        const s = search.toLowerCase();
        const hay =
          `${p.scopeId} ${p.content} ${p.trigger ?? ""} ${p.rationale ?? ""}`.toLowerCase();
        if (!hay.includes(s)) return false;
      }
      return true;
    });
    return matches.sort((a, b) => {
      if (sortBy === "applied") {
        const aStat = statsByRule.get(skillStatKey(a));
        const bStat = statsByRule.get(skillStatKey(b));
        const appliedDelta =
          (bStat?.applied_count ?? 0) - (aStat?.applied_count ?? 0);
        if (appliedDelta !== 0) return appliedDelta;
        const recencyDelta =
          (bStat?.last_applied_at ?? 0) - (aStat?.last_applied_at ?? 0);
        if (recencyDelta !== 0) return recencyDelta;
      }
      return b.createdAt - a.createdAt;
    });
  }, [activeSkills, scope, search, sortBy, statsByRule, statusFilter]);

  const projectCount = projectSkills?.length ?? 0;
  const sharedCount = sharedSkills?.length ?? 0;
  const visibleActiveCount = filtered.length;
  const activeCount = activeKind === "project" ? projectCount : sharedCount;
  const loading = projectSkills === null || sharedSkills === null;
  const hasNoSharedSkills = activeKind === "shared" && sharedCount === 0;
  const allScopesLabel =
    activeKind === "project" ? "全部用户范围" : "全部智能体";

  const switchKind = (kind: SkillKind) => {
    setActiveKind(kind);
    setScope("__all__");
    setStatusFilter(kind === "project" ? "CURRENT" : "__all__");
  };

  return (
    <div className="flex-1 overflow-auto">
      <PageHeader
        title="技能"
        description="所选后端的技能，每类最多显示 500 条记录；使用情况统计最近 30 天。来源标记依据本机会话记录。"
        actions={
          <div className="flex max-w-full flex-wrap items-center justify-end gap-2">
            <Select
              value={scope}
              onValueChange={(v) => setScope(v ?? "__all__")}
            >
              <SelectTrigger
                size="sm"
                className="w-40 text-xs bg-background/80"
              >
                <SelectValue>
                  {scope === "__all__" ? allScopesLabel : scope}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">{allScopesLabel}</SelectItem>
                {scopes.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={statusFilter}
              onValueChange={(v) => setStatusFilter(v ?? "__all__")}
            >
              <SelectTrigger
                size="sm"
                className="w-36 text-xs bg-background/80"
              >
                <SelectValue placeholder="状态">
                  {statusFilterLabel(activeKind, statusFilter)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">全部</SelectItem>
                {activeKind === "project" ? (
                  <>
                    <SelectItem value="CURRENT">生效中</SelectItem>
                    <SelectItem value="PENDING">待处理</SelectItem>
                    <SelectItem value="ARCHIVED">已归档</SelectItem>
                  </>
                ) : (
                  <>
                    <SelectItem
                      value="PENDING"
                      title={SHARED_STATUS_META.PENDING.description}
                    >
                      {SHARED_STATUS_META.PENDING.label}
                    </SelectItem>
                    <SelectItem
                      value="APPROVED"
                      title={SHARED_STATUS_META.APPROVED.description}
                    >
                      {SHARED_STATUS_META.APPROVED.label}
                    </SelectItem>
                    <SelectItem
                      value="REJECTED"
                      title={SHARED_STATUS_META.REJECTED.description}
                    >
                      {SHARED_STATUS_META.REJECTED.label}
                    </SelectItem>
                  </>
                )}
              </SelectContent>
            </Select>
            <Select
              value={sortBy}
              onValueChange={(v) => setSortBy((v as SkillSort) ?? "newest")}
            >
              <SelectTrigger
                size="sm"
                className="w-36 text-xs bg-background/80"
              >
                <SelectValue placeholder="排序">
                  {sortBy === "applied" ? "应用最多" : "最新"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">最新</SelectItem>
                <SelectItem value="applied">
                  应用最多 · 已知来源
                </SelectItem>
              </SelectContent>
            </Select>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索"
              className="h-9 w-48 text-xs bg-background/80"
            />
            <DeleteAllButton
              label={`删除全部${activeKind === "project" ? "项目" : "共享"}技能`}
              confirmMessage={`确定删除所选后端的全部${activeKind === "project" ? "项目技能" : "共享技能"}，包括列表中尚未加载的记录？此操作无法撤销。`}
              disabled={activeCount === 0}
              onConfirm={async () => {
                if (activeKind === "project") {
                  await reflexio.deleteAllUserPlaybooks();
                  setProjectSkills([]);
                } else {
                  await reflexio.deleteAllAgentPlaybooks();
                  setSharedSkills([]);
                }
              }}
            />
          </div>
        }
      />

      <PageFrame className="space-y-4">
        <PageTabs
          activeId={activeKind}
          onSelect={(id) => switchKind(id as SkillKind)}
          items={[
            {
              id: "project",
              label: "项目技能",
              description: "从直接纠正中学习的项目规则",
              count:
                activeKind === "project" ? visibleActiveCount : projectCount,
              icon: BookOpen,
            },
            {
              id: "shared",
              label: "共享技能",
              description: "可跨项目使用的汇总规则",
              count: activeKind === "shared" ? visibleActiveCount : sharedCount,
              icon: Layers3,
            },
          ]}
        />

        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 text-destructive px-4 py-3 text-sm">
            {error}。请检查配置的后端地址是否正在运行记忆服务。
          </div>
        )}
        {activeKind === "project" && attribution?.unavailable && !error && (
          <div className="mb-4 flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            本机来源详情暂时不可用，仍可查看后端技能。
          </div>
        )}

        {legacyUsage.length > 0 && (
          <details className="mb-4 rounded-md border border-border p-3 text-sm">
            <summary className="cursor-pointer font-medium">
              旧版技能使用情况 · {legacyUsage.length} 条记录
            </summary>
            <p className="mt-2 text-xs text-muted-foreground">
              这些后端引用未区分项目技能与共享技能。下方保留其计数；单条技能的统计和排序仅使用来源已知的引用。
            </p>
            <ul className="mt-2 divide-y divide-border">
              {legacyUsage.map((stat) => (
                <li key={stat.real_id} className="py-2">
                  {stat.title || `技能 ID ${stat.real_id}`} ·{" "}
                  {stat.applied_count} 次引用 · 来源未知
                </li>
              ))}
            </ul>
          </details>
        )}

        {loading && !error ? (
          <div className="text-sm text-muted-foreground">加载中…</div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={activeKind === "project" ? BookOpen : Layers3}
            title={
              hasNoSharedSkills
                ? "暂无共享技能"
                : `没有匹配的${activeKind === "project" ? "项目技能" : "共享技能"}`
            }
            description={
              hasNoSharedSkills
                ? "系统从多个项目中学习后可生成共享技能。启用插件并在多个项目中持续使用，共通规则形成后会显示在这里。"
                : "请调整筛选条件，或启用插件继续使用。发现重复模式后会自动提炼技能。"
            }
          />
        ) : (
          <div className="overflow-hidden rounded-lg border border-border bg-card">
            {filtered.map((p) => {
              const stat = statsByRule.get(skillStatKey(p));
              return (
                <Link
                  key={`${p.kind}:${p.id}`}
                  href={`/skills/${p.kind}/${p.id}`}
                  className="group block border-b border-border px-4 py-3.5 transition-colors last:border-b-0 hover:bg-accent/35"
                >
                  <header className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <LearningApplicationBadge
                        stat={stat}
                        sourceUnknown={legacyUsage.some(
                          (usage) => usage.real_id === String(p.id),
                        )}
                      />
                      <StatusBadge kind={p.kind} status={p.status} />
                      <Badge variant="secondary" className="h-5 text-[10px]">
                        {p.kind === "project" ? "项目专用" : "共享"}
                      </Badge>
                      {p.kind === "shared" && (
                        <Badge
                          variant="outline"
                          className="h-5 max-w-56 truncate font-mono text-[10px]"
                          title="共享技能的适用范围，不代表来源宿主。"
                        >
                          智能体范围：{p.scopeId}
                        </Badge>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5 pt-0.5">
                      <span className="text-[11px] text-muted-foreground">
                        {formatRelative(p.createdAt)}
                      </span>
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60 transition-colors group-hover:text-foreground" />
                    </div>
                  </header>
                  <p
                    className={cn(
                      "max-w-5xl text-sm leading-relaxed line-clamp-3",
                      !p.trigger && "text-muted-foreground italic",
                    )}
                  >
                    <span className="mr-2 align-baseline text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      触发条件
                    </span>
                    {p.trigger || "始终适用"}
                  </p>
                  <p className="mt-2 max-w-5xl text-xs leading-relaxed text-muted-foreground line-clamp-2">
                    <span className="font-medium text-foreground/80">
                      规则：
                    </span>{" "}
                    {p.content}
                  </p>
                  {p.rationale && (
                    <p className="mt-1 max-w-5xl text-xs leading-relaxed text-muted-foreground line-clamp-2">
                      <span className="font-medium text-foreground/80">
                        原因：
                      </span>{" "}
                      {p.rationale}
                    </p>
                  )}
                  {p.kind === "project" &&
                    attribution &&
                    !attribution.unavailable && (
                      <div className="mt-2">
                        <HostBadge host={p.host} display="provenance" />
                      </div>
                    )}
                </Link>
              );
            })}
          </div>
        )}
      </PageFrame>
    </div>
  );
}

function statusFilterLabel(kind: SkillKind, status: string): string {
  if (status === "__all__") return "全部";
  if (kind === "shared") {
    const meta = SHARED_STATUS_META[status as AgentPlaybookStatusLabel];
    if (meta) return meta.label;
  }
  if (status === "CURRENT") return "生效中";
  if (status === "PENDING") return "待处理";
  if (status === "ARCHIVED") return "已归档";
  return status;
}

function StatusBadge({
  kind,
  status,
}: {
  kind: SkillKind;
  status: SkillStatus;
}) {
  const sharedMeta =
    kind === "shared"
      ? SHARED_STATUS_META[status as AgentPlaybookStatusLabel]
      : null;
  const variant =
    status === "CURRENT" || status === "APPROVED"
      ? "secondary"
      : status === "ARCHIVED" || status === "REJECTED"
        ? "outline"
        : "default";
  return (
    <Badge
      variant={variant}
      className="h-5 text-[10px]"
      title={sharedMeta?.description}
    >
      {sharedMeta?.label ?? statusFilterLabel(kind, status)}
    </Badge>
  );
}
