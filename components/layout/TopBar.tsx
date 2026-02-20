import { MVP_TEAM_ID } from "@/lib/mvpTeam";
import { getTeamName } from "@/lib/db/getTeamName";

/**
 * Height matches the sidebar header (logo row): p-5 + h-7 + p-5 = 4.25rem
 */
const TOP_BAR_HEIGHT = "4.25rem";

export async function TopBar() {
  const teamName = await getTeamName(MVP_TEAM_ID);

  return (
    <header
      className="flex shrink-0 items-center border-b border-border bg-background"
      style={{ height: TOP_BAR_HEIGHT }}
    >
      <span className="px-8 text-base font-medium text-foreground">
        {teamName}
      </span>
    </header>
  );
}
