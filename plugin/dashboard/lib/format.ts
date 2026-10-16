export function formatTimestamp(ts: number | null | undefined): string {
  if (!ts) return "—";
  const ms = ts < 1e12 ? ts * 1000 : ts;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatRelative(ts: number | null | undefined): string {
  if (!ts) return "—";
  const ms = ts < 1e12 ? ts * 1000 : ts;
  const diff = Date.now() - ms;
  if (diff < 0) return "刚刚";
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s} 秒前`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  const days = Math.floor(h / 24);
  if (days < 30) return `${days} 天前`;
  return formatTimestamp(ts);
}

export function truncate(text: string, n: number): string {
  if (text.length <= n) return text;
  return text.slice(0, n - 1).trimEnd() + "…";
}

export function truncateId(id: string, prefix = 8, suffix = 4): string {
  if (id.length <= prefix + suffix + 1) return id;
  return `${id.slice(0, prefix)}…${id.slice(-suffix)}`;
}

export function dayBucket(ts: number | null | undefined): string {
  if (!ts) return "未知";
  const ms = ts < 1e12 ? ts * 1000 : ts;
  const d = new Date(ms);
  const now = new Date();
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
  const oneDay = 86_400_000;
  if (d.getTime() >= startOfToday) return "今天";
  if (d.getTime() >= startOfToday - oneDay) return "昨天";
  if (d.getTime() >= startOfToday - 7 * oneDay) return "最近一周";
  if (d.getFullYear() === now.getFullYear()) {
    return d.toLocaleDateString("zh-CN", { month: "long" });
  }
  return d.toLocaleDateString("zh-CN", { year: "numeric", month: "long" });
}
