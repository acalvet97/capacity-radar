"use client";

import { ClipboardList, LayoutDashboard, Scale, Settings } from "lucide-react";
import Image from "next/image";
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
      <SidebarHeader className="p-5">
        <Link
          href="/dashboard"
          className="flex items-center"
        >
          <Image
            src="/klyra-logo.svg"
            alt="Klyra"
            width={120}
            height={40}
            className="h-7 w-auto"
          />
        </Link>
      </SidebarHeader>
      <SidebarContent className="pt-6">
        <SidebarGroup>
          <SidebarMenu className="px-0">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              const Icon = item.icon;
              return (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton asChild isActive={isActive} className="px-3 py-2 rounded-sm">
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
