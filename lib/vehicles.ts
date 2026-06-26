import { supabase } from "./supabase";

export type Vehicle = {
  id: string;
  name: string;
  color: string;
  active: boolean;
  sort_order: number;
};

export async function getVehicles() {
  const { data, error } = await supabase
    .from("vehicles")
    .select("*")
    .eq("active", true)
    .order("sort_order", { ascending: true });

  if (error) {
    console.error("Error loading vehicles:", error);
    return [];
  }

  return data as Vehicle[];
}
