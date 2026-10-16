import { Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatRelative } from "@/lib/format";
import type { PlaybookApplicationStat } from "@/lib/types";

export function LearningApplicationBadge({
  stat,
  sourceUnknown = false,
}: {
  stat: PlaybookApplicationStat | undefined;
  sourceUnknown?: boolean;
}) {
  if (sourceUnknown) {
    return (
      <Badge
        variant="outline"
        className="h-5 text-[10px] text-muted-foreground"
        title="此编号的旧引用未区分项目技能与共享技能，统计请参见旧版技能使用情况。"
      >
        {stat?.applied_count
          ? `至少应用 ${stat.applied_count} 次`
          : "使用来源未知"}
      </Badge>
    );
  }
  if (!stat || stat.applied_count === 0) {
    return (
      <Badge
        variant="outline"
        className="h-5 text-[10px] text-muted-foreground"
        title="此学习内容暂无引用记录，助手回复引用后将开始计数。"
      >
        尚未应用
      </Badge>
    );
  }

  const last = formatRelative(stat.last_applied_at);
  return (
    <Badge
      variant="outline"
      className="h-5 gap-1 border-amber-500/45 bg-amber-500/10 text-[10px] text-amber-700 dark:text-amber-300"
      title={`最近应用：${last}`}
    >
      <Sparkles className="h-2.5 w-2.5 text-amber-500" />
      已应用 {stat.applied_count} 次{stat.last_applied_at ? ` · ${last}` : ""}
    </Badge>
  );
}
