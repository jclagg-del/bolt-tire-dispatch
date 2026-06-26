"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type VehicleOption = {
  id: string;
  name: string;
  color: string;
  active: boolean;
  sort_order: number;
};

const fallbackVehicles: VehicleOption[] = [
  { id: "stepvan", name: "Stepvan", color: "#2563eb", active: true, sort_order: 1 },
  { id: "service", name: "Service Truck", color: "#facc15", active: true, sort_order: 2 },
  { id: "sprinter", name: "Sprinter", color: "#10b981", active: true, sort_order: 3 },
];

type Props = {
  value: string;
  onChange: (value: string) => void;
  style?: React.CSSProperties;
};

export default function VehicleSelect({ value, onChange, style }: Props) {
  const [vehicles, setVehicles] = useState<VehicleOption[]>(fallbackVehicles);

  useEffect(() => {
    async function loadVehicles() {
      const { data, error } = await supabase
        .from("vehicles")
        .select("id,name,color,active,sort_order")
        .eq("active", true)
        .order("sort_order", { ascending: true });

      if (error || !data || data.length === 0) {
        setVehicles(fallbackVehicles);
        return;
      }

      setVehicles(data as VehicleOption[]);
    }

    loadVehicles();
  }, []);

  return (
    <select
      name="vehicle_id"
      value={value || "stepvan"}
      onChange={(e) => onChange(e.target.value)}
      style={style}
    >
      {vehicles.map((vehicle) => (
        <option key={vehicle.id} value={vehicle.id}>
          {vehicle.name}
        </option>
      ))}
    </select>
  );
}