import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { Sidebar } from "@/components/layout/sidebar";
import { TopBar } from "@/components/layout/top-bar";
import { StallBanner } from "@/components/stall-banner";

export const metadata: Metadata = {
  title: "工作偏好管理",
  description: "管理会话、偏好、技能和设置",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      className="h-full"
      suppressHydrationWarning
    >
      <body
        className="h-full flex flex-col antialiased font-sans"
        suppressHydrationWarning
      >
        <Providers>
          <StallBanner />
          <TopBar />
          <div className="flex flex-1 min-h-0">
            <aside className="hidden lg:block w-56 border-r border-sidebar-border bg-sidebar shrink-0">
              <Sidebar />
            </aside>
            <main className="flex-1 min-w-0 flex flex-col bg-background">
              {children}
            </main>
          </div>
          <footer className="shrink-0 border-t px-4 py-2 text-center text-xs text-muted-foreground">
            工作偏好管理 · hyz
          </footer>
        </Providers>
      </body>
    </html>
  );
}
