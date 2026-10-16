import { PageFrame } from "@/components/common/page-frame";
import Link from "@/components/common/source-link";
import { redirect } from "next/navigation";
import { AlertTriangle, ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { Button } from "@/components/ui/button";
import { resolveRuleLink } from "@/lib/session-reader";

export const dynamic = "force-dynamic";

export default async function RuleResolverPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ source?: string }>;
}) {
  const { id: rawId } = await params;
  let id: string;
  try {
    id = decodeURIComponent(rawId);
  } catch {
    id = rawId;
  }
  const resolved = await resolveRuleLink(id);
  if (resolved) {
    const { source } = await searchParams;
    const target = new URL(resolved.href, "http://dashboard");
    if (source === "local" || source === "managed")
      target.searchParams.set("source", source);
    redirect(`${target.pathname}${target.search}${target.hash}`);
  }

  return (
    <div className="flex-1 overflow-auto">
      <PageHeader
        title="未找到规则链接"
        description="无法从本机会话索引中解析此短链接。"
      />
      <PageFrame>
        <EmptyState
          icon={AlertTriangle}
          title="未找到规则链接"
          description="会话可能已被清除，或短链接来自其他设备。"
          action={
            <Link href="/sessions">
              <Button variant="outline" size="sm">
                <ArrowLeft className="h-3.5 w-3.5" />
                返回会话列表
              </Button>
            </Link>
          }
        />
      </PageFrame>
    </div>
  );
}
