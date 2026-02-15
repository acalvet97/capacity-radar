import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function POST() {
  const supabase = supabaseServer();

  const { data, error } = await supabase
    .from("work_items")
    .insert({
      team_id: "5fcd452c-5ac8-4afe-be36-dc6145246735",
      name: "Test committed work",
      estimated_hours: 10,
      start_date: new Date().toISOString().slice(0, 10), // requires start_date column
      deadline: null,
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: data.id });
}
