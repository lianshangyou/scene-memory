"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Pencil, Trash2, RotateCcw, Check, X } from "lucide-react";
import { PageFrame } from "@/components/common/page-frame";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { reflexio, type ScenePreference } from "@/lib/reflexio-client";
import { useSettings } from "@/hooks/use-settings";
import { cn } from "@/lib/utils";

type Draft = { profile_id?: string; title: string; content: string; scenes: string[]; scope: string };
const states = { active: "已生效", pending: "待确认", deleted: "已删除" } as const;
const initialScenes = ["通用协作与工具", "新增需求", "修改需求", "写 PRD", "输出原型", "写工作日报", "写今日计划", "写今日产出"];

export default function PreferencesPage() {
  const { source } = useSettings();
  const [items, setItems] = useState<ScenePreference[]>([]);
  const [scenes, setScenes] = useState(initialScenes);
  const [scene, setScene] = useState("全部");
  const [status, setStatus] = useState<keyof typeof states>("active");
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [newScene, setNewScene] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const data = await reflexio.getScenePreferences();
    setItems(data.items); setScenes(data.scenes); setLoading(false);
  };
  useEffect(() => {
    let cancelled = false;
    reflexio.getScenePreferences().then(data => {
      if (!cancelled) { setItems(data.items); setScenes(data.scenes); setError(""); setLoading(false); }
    }).catch(e => { if (!cancelled) { setError(String(e)); setLoading(false); } });
    return () => { cancelled = true; };
  }, [source]);

  const visible = useMemo(() => items.filter(p => p.state === status &&
    (scene === "全部" || p.custom_features.scenes?.includes(scene)) &&
    `${p.custom_features.title} ${p.content} ${p.custom_features.scope}`.toLowerCase().includes(query.toLowerCase())), [items, status, scene, query]);
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true); setError("");
    try { await action(); await load(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  const edit = (p: ScenePreference) => setDraft({ profile_id: p.profile_id, title: p.custom_features.title || "工作偏好", content: p.content, scenes: p.custom_features.scenes || [], scope: p.custom_features.scope || "全部项目" });
  const save = () => run(async () => { if (!draft) return; await reflexio.saveScenePreference(draft); setDraft(null); });

  return <div className="min-w-0 w-full flex-1 overflow-auto">
    <PageHeader title="我的工作偏好" description="按工作场景整理可复用的做法。自动学习会补充已有场景，手动修改的内容以你的版本为准。" actions={
      <Button size="sm" disabled={busy || loading} onClick={() => setDraft({ title: "", content: "", scenes: [scene === "全部" ? scenes[0] : scene], scope: "全部项目" })}><Plus className="h-4 w-4" />新增偏好</Button>
    } />
    <PageFrame>
      {error && <div role="alert" className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{error}</div>}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[210px_minmax(0,1fr)]">
        <aside className="hidden lg:block">
          <p className="mb-3 text-xs text-muted-foreground">工作场景</p>
          <nav aria-label="工作场景" className="space-y-1">{["全部", ...scenes].map(s => <button key={s} onClick={() => setScene(s)} className={cn("flex w-full items-center justify-between rounded-md px-3 py-2.5 text-left text-sm transition-colors", scene === s ? "bg-accent font-medium" : "text-muted-foreground hover:bg-accent/50")}><span>{s}</span><span className="text-xs tabular-nums">{items.filter(p => p.state === status && (s === "全部" || p.custom_features.scenes?.includes(s))).length}</span></button>)}</nav>
        </aside>
        <main className="min-w-0">
          <label className="mb-4 block lg:hidden"><span className="mb-1 block text-xs text-muted-foreground">工作场景</span><select value={scene} onChange={e => setScene(e.target.value)} className="h-10 w-full rounded-md border bg-background px-3 text-sm">{["全部", ...scenes].map(s => <option key={s}>{s}</option>)}</select></label>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex rounded-md border p-1" aria-label="偏好状态">{(Object.keys(states) as (keyof typeof states)[]).map(s => <button key={s} aria-pressed={status === s} onClick={() => setStatus(s)} className={cn("rounded px-3 py-1.5 text-sm", status === s ? "bg-accent font-medium" : "text-muted-foreground")}>{states[s]}</button>)}</div>
            <Input aria-label="搜索偏好" placeholder="搜索偏好" value={query} onChange={e => setQuery(e.target.value)} className="w-full sm:w-64" />
          </div>
          <h2 className="mb-2 text-lg font-semibold">{scene === "全部" ? "全部场景" : scene}</h2>
          <p className="mb-5 text-xs leading-relaxed text-muted-foreground">{status === "deleted" ? "已删除的结论停止检索，并阻止再次自动生成。只有主动恢复后才会重新生效。" : status === "pending" ? "推断出的习惯或与手动版本冲突的补充在这里确认；接受前不会用于回答。" : "只保留可以重复使用的工作方法。具体页面、按钮文案和临时项目决定不作为通用偏好。"}</p>
          {loading ? <p className="py-10 text-sm text-muted-foreground">加载中…</p> : visible.length === 0 ? <div className="rounded-lg border border-dashed px-6 py-14 text-center"><p className="text-sm">{query ? "没有匹配的偏好" : `暂无${states[status]}偏好`}</p><p className="mt-2 text-xs text-muted-foreground">{status === "active" ? "继续工作时会自动学习，也可以手动新增；没有依据的场景保持为空。" : "可以切换场景或状态查看其他记录。"}</p></div> :
            <div className="space-y-3">{visible.map(p => <article key={p.profile_id} className="rounded-lg border bg-card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3"><h3 className="text-sm font-semibold">{p.custom_features.title || "工作偏好"}</h3><Badge variant="secondary">{p.custom_features.manual_state === "edited" && p.state === "active" ? "手动维护" : states[p.state]}</Badge></div>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-7">{p.content}</p>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">{p.custom_features.scenes?.map(s => <Badge key={s} variant="outline">{s}</Badge>)}<span>适用范围：{p.custom_features.scope || "原项目"}</span></div>
              <div className="flex items-center gap-2">{p.state === "deleted" ? <Button size="sm" variant="outline" disabled={busy} onClick={() => run(() => reflexio.restoreScenePreference(p.profile_id))}><RotateCcw className="h-3.5 w-3.5" />恢复</Button> : <><Button size="sm" variant="outline" disabled={busy} onClick={() => edit(p)}>{p.state === "pending" ? <Check className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}{p.state === "pending" ? "确认 / 修改" : "编辑 / 调整场景"}</Button><Button size="sm" variant="ghost" disabled={busy} onClick={() => run(() => reflexio.deleteUserProfile({ user_id: p.user_id, profile_id: p.profile_id }))}><Trash2 className="h-3.5 w-3.5" />删除</Button></>}</div></div>
              <details className="mt-3 text-xs text-muted-foreground"><summary className="cursor-pointer">高级详情</summary><p className="mt-2 break-all">ID：{p.profile_id}</p></details>
            </article>)}</div>}
        </main>
      </div>
    </PageFrame>
    {draft && <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 p-4" onClick={() => { if (!busy) setDraft(null); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="preference-editor" className="my-auto w-full max-w-2xl rounded-xl border bg-background p-6 shadow-xl" onClick={e => e.stopPropagation()} onKeyDown={e => { if (e.key === "Escape" && !busy) setDraft(null); }}>
        <div className="mb-5 flex items-center justify-between"><h2 id="preference-editor" className="font-semibold">{draft.profile_id ? "编辑偏好" : "新增偏好"}</h2><Button aria-label="关闭" variant="ghost" size="sm" disabled={busy} onClick={() => setDraft(null)}><X className="h-4 w-4" /></Button></div>
        <form onSubmit={e => { e.preventDefault(); save(); }} className="space-y-4">
          <label className="block text-sm">标题<Input autoFocus required maxLength={100} value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} className="mt-2" /></label>
          <fieldset><legend className="mb-2 text-sm">工作场景（可多选）</legend><div className="flex flex-wrap gap-2">{Array.from(new Set([...scenes, ...draft.scenes])).map(s => <label key={s} className="flex items-center gap-2 rounded border px-3 py-2 text-xs"><input type="checkbox" checked={draft.scenes.includes(s)} onChange={e => setDraft({ ...draft, scenes: e.target.checked ? [...draft.scenes, s] : draft.scenes.filter(v => v !== s) })} />{s}</label>)}</div><div className="mt-2 flex gap-2"><Input aria-label="新场景名称" maxLength={60} placeholder="没有合适的场景时新增" value={newScene} onChange={e => setNewScene(e.target.value)} /><Button type="button" variant="outline" disabled={!newScene.trim()} onClick={() => { setDraft({ ...draft, scenes: Array.from(new Set([...draft.scenes, newScene.trim()])) }); setNewScene(""); }}>添加场景</Button></div></fieldset>
          <label className="block text-sm">结论<textarea required maxLength={5000} value={draft.content} onChange={e => setDraft({ ...draft, content: e.target.value })} rows={5} className="mt-2 w-full resize-y rounded-md border bg-background p-3 text-sm leading-7" /></label>
          <label className="block text-sm">适用范围<Input required maxLength={200} value={draft.scope} onChange={e => setDraft({ ...draft, scope: e.target.value })} className="mt-2" /></label>
          <p className="text-xs text-muted-foreground">保存后以你的版本为准；自动学习的冲突内容会进入待确认。</p>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={() => setDraft(null)}>取消</Button><Button type="submit" disabled={busy || !draft.scenes.length}>{busy ? "保存中…" : "保存并生效"}</Button></div>
        </form>
      </section>
    </div>}
  </div>;
}
