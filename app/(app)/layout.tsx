import { AppSidebar } from "@/components/layout/AppSidebar";
import { TopBar } from "@/components/layout/TopBar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { supabaseServer } from "@/lib/supabaseServer";
import { redirect } from "next/navigation";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { data: team } = await supabase
      .from("teams")
      .select("onboarding_completed")
      .eq("owner_user_id", user.id)
      .single();

    if (team && !team.onboarding_completed) {
      redirect("/onboarding");
    }
  }

  const displayName =
    user?.user_metadata?.display_name ||
    user?.email?.split("@")[0] ||
    "User";
  const email = user?.email ?? "";
  const avatarRaw = user?.user_metadata?.avatar_url;
  const avatar =
    typeof avatarRaw === "string" && avatarRaw.trim() ? avatarRaw.trim() : null;

  return (
    <SidebarProvider>
      <AppSidebar
        user={{
          name: displayName,
          email,
          avatar,
        }}
      />
      <SidebarInset className="ml-[16rem] flex flex-col">
        <TopBar />
        <main className="min-h-0 flex-1">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
