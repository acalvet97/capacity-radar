"use client";

import { ClipboardList, LayoutDashboard, Scale, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

const navItems = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Committed Work", href: "/committed-work", icon: ClipboardList },
  { label: "Evaluate", href: "/evaluate", icon: Scale },
  { label: "Settings", href: "/settings", icon: Settings },
];

const SIDEBAR_WIDTH = "16rem";

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <div
      className="fixed inset-y-0 left-0 z-50 flex h-screen w-[16rem] flex-col border-r border-sidebar-border"
      style={{ width: SIDEBAR_WIDTH }}
    >
      <Sidebar collapsible="none" className="h-full w-full flex-1 flex-col">
        <SidebarHeader>
        <Link
          href="/dashboard"
          className="text-xl font-bold tracking-tight text-sidebar-foreground hover:text-sidebar-foreground"
        >
          klyra
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              const Icon = item.icon;
              return (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton asChild isActive={isActive}>
                    <Link href={item.href}>
                      <Icon className="size-4 shrink-0" />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      </Sidebar>
    </div>
  );
}
