"use client";

import { Bot, ClipboardList, LayoutDashboard, LogOut, Settings, User } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { logout } from "@/app/actions/auth";

const dataNavItems = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Workload", href: "/committed-work", icon: ClipboardList },
];

const SIDEBAR_WIDTH = "16rem";

export function AppSidebar() {
  const pathname = usePathname();

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
        <SidebarHeader className="p-5">
          <Link href="/dashboard" className="flex items-center">
            <Image
              src="/klyra-logo.svg"
              alt="Klyra"
              width={120}
              height={40}
              className="h-7 w-auto"
            />
          </Link>
        </SidebarHeader>
        <SidebarContent className="pt-4">
          {/* Ask Klyra — primary action, sits alone at top */}
          <SidebarGroup className="pb-0">
            <SidebarMenu className="px-0">
              <NavItem label="Ask Klyra" href="/evaluate" icon={Bot} />
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
        <SidebarFooter className="p-3 space-y-0.5">
          <SidebarMenuButton
            asChild
            isActive={pathname === '/account'}
            className="rounded-sm px-3 py-2"
          >
            <Link href="/account">
              <User className="size-4 shrink-0" />
              <span>Account</span>
            </Link>
          </SidebarMenuButton>
          <form action={logout}>
            <button
              type="submit"
              className="flex w-full items-center gap-2 rounded-sm px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            >
              <LogOut className="size-4 shrink-0" />
              <span>Sign out</span>
            </button>
          </form>
        </SidebarFooter>
      </Sidebar>
    </div>
  );
}
