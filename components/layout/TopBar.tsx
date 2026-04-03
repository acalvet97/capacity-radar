import Link from "next/link";
import { User } from "lucide-react";
import { supabaseServer } from "@/lib/supabaseServer";

/**
 * Height matches the sidebar header (logo row): p-5 + h-7 + p-5 = 4.25rem
 */
const TOP_BAR_HEIGHT = "4.25rem";

export async function TopBar() {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  const displayName =
    user?.user_metadata?.display_name ||
    user?.email?.split('@')[0] ||
    'Account';

  return (
    <header
      className="sticky top-0 z-40 flex shrink-0 items-center justify-end border-b border-border bg-background"
      style={{ height: TOP_BAR_HEIGHT }}
    >
      <Link
        href="/account"
        className="flex items-center gap-2 px-8 text-sm font-medium text-foreground hover:text-foreground/80 transition-colors"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-muted">
          <User className="size-3.5 text-muted-foreground" />
        </span>
        <span>{displayName}</span>
      </Link>
    </header>
  );
}
