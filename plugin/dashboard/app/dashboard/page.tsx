"use client";

import { PageFrame } from "@/components/common/page-frame";

import { useEffect, useState } from "react";
import Link from "@/components/common/source-link";
import { Activity, BookOpen, Users, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { StatCard } from "@/components/common/stat-card";
import { reflexio } from "@/lib/reflexio-client";
import { useSettings } from "@/hooks/use-settings";
import type { SessionSummary, UserPlaybook, UserProfile } from "@/lib/types";

type Summary = Awaited<
  ReturnType<typeof reflexio.getDashboardStats>
>["stats"]["current_period"];
export default function DashboardPage() {
  const { source, sources } = useSettings();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null);
  const [deviceError, setDeviceError] = useState<string | null>(null);
  const [recent, setRecent] = useState<{
    skills: UserPlaybook[];
    profiles: UserProfile[];
  } | null>(null);
  const [recentError, setRecentError] = useState<string | null>(null);
  const [model, setModel] = useState("加载中…");
  useEffect(() => {
    let cancelled = false;
    reflexio
      .getDashboardStats()
      .then((data) => {
        if (!data.stats?.current_period)
          throw new Error("后端未返回仪表盘统计数据");
        if (!cancelled) setSummary(data.stats.current_period);
      })
      .catch((e) => {
        if (!cancelled) setError(String(e.message || e));
      });
    Promise.all([
      reflexio.getUserPlaybooks({ limit: 4, statusFilter: [null] }),
      reflexio.getAllProfiles({ limit: 4 }),
    ])
      .then(([skills, profiles]) => {
        if (!cancelled)
          setRecent({
            skills: skills.user_playbooks,
            profiles: profiles.user_profiles,
          });
      })
      .catch((e) => {
        if (!cancelled) setRecentError(String(e.message || e));
      });
    reflexio
      .getServerConfiguration()
      .then((config) => {
        if (!cancelled)
          setModel(
            (source === "local" && sources?.local.learningModel
              ? `${sources.local.learningModel}（已配置的本地提炼模型）`
              : config.llm_config?.generation_model_name) ||
              "服务默认模型（未返回模型名称）",
          );
      })
      .catch(() => {
        if (!cancelled) setModel("此后端未返回模型名称");
      });
    fetch("/api/sessions", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("无法读取本机会话");
        return response.json();
      })
      .then((data) => {
        if (!cancelled) setSessions(data.sessions);
      })
      .catch((e) => {
        if (!cancelled) setDeviceError(String(e.message || e));
      });
    return () => {
      cancelled = true;
    };
  }, [source, sources]);
  return (
    <div className="flex-1 overflow-auto">
      <PageHeader
        title="仪表盘"
        description={`${source === "managed" ? "托管" : "本地"}记忆服务 · 最近 30 天`}
      />
      <PageFrame className="space-y-6">
        {error && (
          <div
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm"
          >
            所选后端不可用：{error}。请检查配置或选择其他数据源。
          </div>
        )}
        {!summary && !error && (
          <p role="status" className="text-sm text-muted-foreground">
            正在加载后端统计…
          </p>
        )}
        <div className="metric-strip">
          <StatCard
            label="交互次数（30 天）"
            value={summary?.total_interactions ?? "—"}
            hint="由所选后端记录"
            icon={Activity}
          />
          <StatCard
            label="用户偏好（30 天）"
            value={summary?.total_profiles ?? "—"}
            hint="本时段创建的现有偏好"
            icon={Users}
          />
          <StatCard
            label="技能规则（30 天）"
            value={summary?.total_playbooks ?? "—"}
            hint="本时段创建的技能规则"
            icon={BookOpen}
          />
          <StatCard
            label="智能体成功率（30 天）"
            value={summary ? `${summary.success_rate.toFixed(1)}%` : "—"}
            hint="基于所选后端的评估"
            icon={Sparkles}
          />
        </div>
        <p className="text-sm text-muted-foreground">提炼模型：{model}</p>
        <section className="border-t border-border pt-5 space-y-3">
          <h2 className="font-semibold">最近学习内容 · 所选后端</h2>
          {recentError && (
            <p role="alert" className="text-sm text-destructive">
              无法加载最近学习内容：{recentError}
            </p>
          )}
          {!recent && !recentError && (
            <p className="text-sm text-muted-foreground">
              正在加载最近学习内容…
            </p>
          )}
          {recent && (
            <div className="divide-y divide-border">
              {recent.skills.map((skill) => (
                <Link
                  key={skill.user_playbook_id}
                  className="block py-3 text-sm hover:underline"
                  href={`/skills/project/${skill.user_playbook_id}`}
                >
                  <span className="line-clamp-2 break-words">
                    {skill.content}
                  </span>
                </Link>
              ))}
              {recent.profiles.map((profile) => (
                <Link
                  key={profile.profile_id}
                  className="block py-3 text-sm hover:underline"
                  href={`/preferences/${encodeURIComponent(profile.profile_id)}`}
                >
                  <span className="line-clamp-2 break-words">
                    {profile.content}
                  </span>
                </Link>
              ))}
              {!recent.skills.length && !recent.profiles.length && (
                <p className="text-sm text-muted-foreground">
                  暂无最近学习内容。
                </p>
              )}
            </div>
          )}
          <div className="flex flex-wrap gap-4 text-sm">
            <Link href="/skills" className="text-primary">
              查看技能
            </Link>
            <Link href="/preferences" className="text-primary">
              查看偏好
            </Link>
            <Link href="/sessions" className="text-primary">
              查看后端会话
            </Link>
          </div>
        </section>
        <section className="border-t border-border pt-5 space-y-3">
          <h2 className="font-semibold">本机</h2>
          <p className="text-sm text-muted-foreground">
            本机上的会话文件与钩子活动，独立于所选记忆服务后端。
          </p>
          {deviceError && (
            <p role="alert" className="text-sm text-destructive">
              {deviceError}
            </p>
          )}
          {sessions && (
            <p className="text-sm">
              {sessions.length} 个会话缓存 ·{" "}
              {sessions.reduce(
                (total, session) => total + session.learning_interaction_count,
                0,
              )}{" "}
              次交互引用了学习内容
            </p>
          )}
          <Link href="/device/sessions" className="text-sm text-primary">
            查看本机活动
          </Link>
        </section>
      </PageFrame>
    </div>
  );
}
