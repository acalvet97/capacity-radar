"use client";

import { Sparkle, ClipboardList, Gauge, Settings } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NavUser, type NavUserData } from "@/components/nav-user";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "@/components/ui/sidebar";

function useShortcutLabel() {
  if (typeof navigator === "undefined") return "⌘ + K";
  // userAgentData.platform is the modern API; navigator.platform is the
  // widely-supported fallback (deprecated but not yet removed anywhere relevant).
  const platform =
    (navigator as Navigator & { userAgentData?: { platform?: string } })
      .userAgentData?.platform ?? navigator.platform;
  return platform.toUpperCase().includes("MAC") ? "⌘ + K" : "Ctrl + K";
}

const dataNavItems = [
  { label: "Dashboard", href: "/dashboard", icon: Gauge },
  { label: "Workload", href: "/committed-work", icon: ClipboardList },
];

const SIDEBAR_WIDTH = "16rem";

export function AppSidebar({ user }: { user: NavUserData }) {
  const pathname = usePathname();
  const shortcutLabel = useShortcutLabel();

  function NavItem({ label, href, icon: Icon }: { label: string; href: string; icon: React.ElementType }) {
    return (
      <SidebarMenuItem>
        <SidebarMenuButton
          asChild
          isActive={pathname === href}
          className="rounded-sm px-3 py-2"
        >
          <Link href={href}>
            <Icon className="size-4 shrink-0" />
            <span>{label}</span>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  }

  return (
    <div
      className="fixed inset-y-0 left-0 z-50 flex h-screen w-[16rem] flex-col border-r border-sidebar-border"
      style={{ width: SIDEBAR_WIDTH }}
    >
      <Sidebar collapsible="none" className="h-full w-full flex-1 flex-col">
        <div
          data-slot="sidebar-header"
          data-sidebar="header"
          className="flex h-[60px] shrink-0 items-center px-5"
        >
          <Link href="/dashboard" className="flex items-center">
            <Image
              src="/Klira-logo.svg"
              alt="Klira"
              width={115}
              height={38}
              className="h-[1.35rem] w-auto"
            />
          </Link>
        </div>
        <SidebarContent className="pt-4">
          {/* Ask Klira — primary action, sits alone at top */}
          <SidebarGroup className="pb-0">
            <SidebarMenu className="px-0">
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={pathname === "/evaluate"}
                  className="rounded-sm px-3 py-2"
                >
                  <Link href="/evaluate" className="flex items-center justify-between w-full">
                    <span className="flex items-center gap-2 min-w-0">
                      <Sparkle className="size-4 shrink-0" />
                      <span>Ask Klira</span>
                    </span>
                    <span className="ml-2 shrink-0 text-sm text-muted-foreground/60 tabular-nums">
                      {shortcutLabel}
                    </span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>

          <SidebarSeparator className="my-3" />

          {/* Supporting data pages */}
          <SidebarGroup className="py-0">
            <SidebarMenu className="px-0">
              {dataNavItems.map((item) => (
                <NavItem key={item.href} {...item} />
              ))}
            </SidebarMenu>
          </SidebarGroup>

          <SidebarSeparator className="my-3" />

          {/* Settings */}
          <SidebarGroup className="py-0">
            <SidebarMenu className="px-0">
              <NavItem label="Settings" href="/settings" icon={Settings} />
            </SidebarMenu>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter className="p-2">
          <NavUser user={user} />
        </SidebarFooter>
      </Sidebar>
    </div>
  );
}
