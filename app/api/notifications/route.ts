import { supabaseServer } from "@/lib/supabaseServer";
import { NextResponse } from "next/server";

export type NotificationRow = {
  id: string;
  type: string;
  payload: { work_item_ids: string[]; count: number };
  created_at: string;
  read_at: string | null;
};

export async function GET() {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("notifications")
    .select("id, type, payload, created_at, read_at")
    .eq("user_id", user.id)
    .is("read_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}
