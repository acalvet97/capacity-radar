"use client";

import * as React from "react";
import { Bell, ArrowRight, Circle } from "lucide-react";
import { useRouter } from "next/navigation";

type NotificationRow = {
  id: string;
  type: string;
  payload: { work_item_ids: string[]; count: number };
  created_at: string;
  read_at: string | null;
};

type Props = {
  initialNotifications: NotificationRow[];
};

export function NotificationBell({ initialNotifications }: Props) {
  const router = useRouter();
  const [notifications, setNotifications] =
    React.useState<NotificationRow[]>(initialNotifications);
  const [open, setOpen] = React.useState(false);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const buttonRef = React.useRef<HTMLButtonElement>(null);

  const unreadCount = notifications.filter((n) => !n.read_at).length;

  // Close dropdown on outside click
  React.useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  async function markAsRead(id: string) {
    setNotifications((prev) =>
      prev.map((n) =>
        n.id === id ? { ...n, read_at: new Date().toISOString() } : n
      )
    );
    try {
      await fetch(`/api/notifications/${id}/read`, { method: "PATCH" });
    } catch {
      // silently fail
    }
  }

  async function handleNotificationClick(notification: NotificationRow) {
    if (!notification.read_at) {
      await markAsRead(notification.id);
    }
    setOpen(false);

    const ids = notification.payload?.work_item_ids ?? [];
    if (ids.length > 0) {
      router.push(`/work-items?highlight=${ids.join(",")}`);
    }
  }

  function handleOpen() {
    setOpen((prev) => !prev);
  }

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={handleOpen}
        className="relative flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-zinc-200 hover:text-foreground dark:hover:bg-zinc-700"
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
      >
        <Bell className="size-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-rose-600 text-[10px] font-semibold text-white leading-none">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          className="absolute right-0 top-10 z-50 w-80 rounded-lg border border-border bg-background shadow-lg overflow-hidden"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <span className="text-sm font-semibold">Notifications</span>
            {unreadCount > 0 && (
              <span className="text-xs text-muted-foreground">{unreadCount} unread</span>
            )}
          </div>

          <div className="divide-y divide-border max-h-[360px] overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                No notifications
              </div>
            ) : (
              notifications.map((notification) => (
                <NotificationCard
                  key={notification.id}
                  notification={notification}
                  onClick={() => handleNotificationClick(notification)}
                />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function NotificationCard({
  notification,
  onClick,
}: {
  notification: NotificationRow;
  onClick: () => void;
}) {
  const isUnread = !notification.read_at;
  const count = notification.payload?.count ?? 0;

  if (notification.type === "deadline_this_week") {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors space-y-1 ${
          isUnread ? "bg-rose-50 dark:bg-rose-950/20" : ""
        }`}
      >
        <p className="text-sm font-semibold flex items-center gap-2">
          <Circle className="size-2.5 shrink-0 fill-rose-600 stroke-rose-600" />
          {count} project{count !== 1 ? "s" : ""} {count !== 1 ? "are" : "is"} due this week
        </p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Their data hasn&apos;t been updated since they were created. Are the hours and deadlines
          still accurate?
        </p>
        <p className="text-xs font-medium text-foreground/80 underline underline-offset-2 flex items-center gap-1">
          Review projects
          <ArrowRight className="size-3 shrink-0" />
        </p>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors"
    >
      <p className="text-sm">{notification.type}</p>
    </button>
  );
}
