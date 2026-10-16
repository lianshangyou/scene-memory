import {
  LayoutDashboard,
  MessageSquare,
  Users,
  BookOpen,
  Settings,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const navItems: NavItem[] = [
  { href: "/dashboard", label: "仪表盘", icon: LayoutDashboard },
  { href: "/sessions", label: "会话", icon: MessageSquare },
  { href: "/preferences", label: "偏好", icon: Users },
  { href: "/skills", label: "技能", icon: BookOpen },
  { href: "/configure", label: "设置", icon: Settings },
];
