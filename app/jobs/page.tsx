"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import AppHeader from "@/components/AppHeader";

type Job = {
  id: string | number;
  customer?: string | null;
  phone?: string | null;
  vehicle?: string | null;
  unit_number?: string | null;
  address?: string | null;
  notes?: string | null;
  tires?: string | null;
  size?: string | null;
  qty?: string | number | null;
  scheduled?: string | null;
  complete?: boolean | null;
  vehicle_id?: string | null;
  service_type?: string | null;
  po_number?: string | null;
  billing_name?: string | null;
  job_total?: string | number | null;
  payment_status?: string | null;
  invoice_number?: string | null;
  job_status?: string | null;
  archived?: boolean | null;
};

type Vehicle = {
  id: string;
  name: string;
  color: string;
  active: boolean;
  sort_order: number;
};

const NY_TIMEZONE = "America/New_York";

const fallbackVehicles: Vehicle[] = [
  { id: "stepvan", name: "Stepvan", color: "#2563eb", active: true, sort_order: 1 },
  { id: "service", name: "Service Truck", color: "#facc15", active: true, sort_order: 2 },
  { id: "sprinter", name: "Sprinter", color: "#10b981", active: true, sort_order: 3 },
];

function parseJobDate(input?: string | null) {
  if (!input) return null;
  const value = input.trim();
  if (!value) return null;

  const hasTimezone = value.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(value);

  if (hasTimezone) {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }

  const d = new Date(value.replace(" ", "T"));
  return isNaN(d.getTime()) ? null : d;
}

function getNYDateKey(input?: string | null) {
  const date = parseJobDate(input);
  if (!date) return "";

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: NY_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((p) => p.type === "year")?.value ?? "";
  const month = parts.find((p) => p.type === "month")?.value ?? "";
  const day = parts.find((p) => p.type === "day")?.value ?? "";

  return `${year}-${month}-${day}`;
}

function addDaysToDateKey(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const utcDate = new Date(Date.UTC(year, month - 1, day));
  utcDate.setUTCDate(utcDate.getUTCDate() + days);

  return `${utcDate.getUTCFullYear()}-${String(utcDate.getUTCMonth() + 1).padStart(
    2,
    "0"
  )}-${String(utcDate.getUTCDate()).padStart(2, "0")}`;
}

function getStartOfWeek(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const dayOfWeek = date.getUTCDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  return addDaysToDateKey(dateKey, mondayOffset);
}

function formatDateTimeNY(input?: string | null) {
  const date = parseJobDate(input);
  if (!date) return "";

  return new Intl.DateTimeFormat("en-US", {
    timeZone: NY_TIMEZONE,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatMoney(value?: string | number | null) {
  if (value === null || value === undefined || value === "") return "";
  const num = Number(value);
  if (Number.isNaN(num)) return "";
  return `$${num.toFixed(2)}`;
}

function getTextColor(background: string) {
  const hex = background.replace("#", "");
  if (hex.length !== 6) return "white";

  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;

  return brightness > 150 ? "#111827" : "white";
}

export default function JobsPage() {
  return (
    <div style={shell}>
      <AppHeader />
      <Suspense fallback={<JobsPageLoading />}>
        <JobsPageContent />
      </Suspense>
    </div>
  );
}

function JobsPageLoading() {
  return (
    <div style={page}>
      <div style={heroCard}>
        <div style={heroTop}>
          <div>
            <div style={eyebrow}>Jobs</div>
            <h1 style={title}>All Jobs</h1>
            <p style={subtitle}>Loading jobs...</p>
          </div>
        </div>
      </div>

      <div style={loadingBox}>Loading jobs...</div>
    </div>
  );
}

function JobsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const customerFilter = searchParams.get("customer") || "";
  const todayKey = useMemo(() => getNYDateKey(new Date().toISOString()), []);

  const [jobs, setJobs] = useState<Job[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>(fallbackVehicles);
  const [loading, setLoading] = useState(true);

  const [searchText, setSearchText] = useState(customerFilter);
  const [vehicleFilter, setVehicleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [serviceFilter, setServiceFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");
  const [startDateFilter, setStartDateFilter] = useState("");
  const [endDateFilter, setEndDateFilter] = useState("");

  const fetchVehicles = async () => {
    const { data, error } = await supabase
      .from("vehicles")
      .select("id,name,color,active,sort_order")
      .eq("active", true)
      .order("sort_order", { ascending: true });

    if (error || !data || data.length === 0) {
      setVehicles(fallbackVehicles);
      return;
    }

    setVehicles(data as Vehicle[]);
  };

  const fetchJobs = async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from("jobs")
      .select(`
        id,
        customer,
        phone,
        vehicle,
        unit_number,
        address,
        notes,
        tires,
        size,
        qty,
        scheduled,
        complete,
        vehicle_id,
        service_type,
        po_number,
        billing_name,
        job_total,
        payment_status,
        invoice_number,
        job_status,
        archived
      `)
      .eq("archived", false);

    if (error) {
      console.error("Error fetching jobs:", error.message);
      setJobs([]);
      setLoading(false);
      return;
    }

    setJobs((data as Job[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchVehicles();
    fetchJobs();
  }, []);

  const vehicleMap = useMemo(() => {
    const map: Record<string, Vehicle> = {};
    vehicles.forEach((vehicle) => {
      map[vehicle.id] = vehicle;
    });
    return map;
  }, [vehicles]);

  const serviceTypes = useMemo(() => {
    const set = new Set<string>();

    jobs.forEach((job) => {
      if (job.service_type) set.add(job.service_type);
    });

    return Array.from(set).sort();
  }, [jobs]);

  const applyQuickDate = (value: string) => {
    setDateFilter(value);

    if (value === "today") {
      setStartDateFilter(todayKey);
      setEndDateFilter(todayKey);
      return;
    }

    if (value === "tomorrow") {
      const tomorrow = addDaysToDateKey(todayKey, 1);
      setStartDateFilter(tomorrow);
      setEndDateFilter(tomorrow);
      return;
    }

    if (value === "this_week") {
      const start = getStartOfWeek(todayKey);
      setStartDateFilter(start);
      setEndDateFilter(addDaysToDateKey(start, 6));
      return;
    }

    if (value === "next_week") {
      const start = addDaysToDateKey(getStartOfWeek(todayKey), 7);
      setStartDateFilter(start);
      setEndDateFilter(addDaysToDateKey(start, 6));
      return;
    }

    if (value === "all" || value === "upcoming" || value === "past" || value === "unscheduled") {
      setStartDateFilter("");
      setEndDateFilter("");
    }
  };

  const filteredJobs = useMemo(() => {
    let result = [...jobs];

    const search = searchText.trim().toLowerCase();

    if (search) {
      result = result.filter((job) => {
        const haystack = [
          job.customer,
          job.phone,
          job.vehicle,
          job.unit_number,
          job.address,
          job.notes,
          job.tires,
          job.size,
          job.service_type,
          job.po_number,
          job.billing_name,
          job.invoice_number,
          job.job_status,
          job.payment_status,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return haystack.includes(search);
      });
    }

    if (vehicleFilter !== "all") {
      result = result.filter((job) => (job.vehicle_id || "") === vehicleFilter);
    }

    if (statusFilter !== "all") {
      result = result.filter((job) => {
        const status = job.job_status || (job.complete ? "completed" : "scheduled");
        return status === statusFilter;
      });
    }

    if (paymentFilter !== "all") {
      result = result.filter((job) => (job.payment_status || "unpaid") === paymentFilter);
    }

    if (serviceFilter !== "all") {
      result = result.filter((job) => (job.service_type || "") === serviceFilter);
    }

    if (dateFilter === "upcoming") {
      result = result.filter((job) => getNYDateKey(job.scheduled) > todayKey);
    }

    if (dateFilter === "past") {
      result = result.filter((job) => {
        const jobDateKey = getNYDateKey(job.scheduled);
        return !!jobDateKey && jobDateKey < todayKey;
      });
    }

    if (dateFilter === "unscheduled") {
      result = result.filter((job) => !job.scheduled);
    }

    if (startDateFilter) {
      result = result.filter((job) => {
        const jobDateKey = getNYDateKey(job.scheduled);
        return !!jobDateKey && jobDateKey >= startDateFilter;
      });
    }

    if (endDateFilter) {
      result = result.filter((job) => {
        const jobDateKey = getNYDateKey(job.scheduled);
        return !!jobDateKey && jobDateKey <= endDateFilter;
      });
    }

    return result.sort((a, b) => (b.scheduled || "").localeCompare(a.scheduled || ""));
  }, [
    jobs,
    searchText,
    vehicleFilter,
    statusFilter,
    paymentFilter,
    serviceFilter,
    dateFilter,
    startDateFilter,
    endDateFilter,
    todayKey,
  ]);

  const clearFilters = () => {
    setSearchText("");
    setVehicleFilter("all");
    setStatusFilter("all");
    setPaymentFilter("all");
    setServiceFilter("all");
    setDateFilter("all");
    setStartDateFilter("");
    setEndDateFilter("");
    router.push("/jobs");
  };

  return (
    <div style={page}>
      <div style={heroCard}>
        <div style={heroTop}>
          <div>
            <div style={eyebrow}>Jobs</div>
            <h1 style={title}>All Jobs</h1>
            <p style={subtitle}>Search, filter, open, and manage every job in one place.</p>
          </div>

          <Link href="/jobs/new" style={{ textDecoration: "none" }}>
            <button type="button" style={blueButton}>
              ➕ Add Job
            </button>
          </Link>
        </div>
      </div>

      <div style={filterCard}>
        <input
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          style={searchInput}
          placeholder="Search customer, vehicle, address, PO, invoice, notes..."
        />

        <div style={quickDateRow}>
          <button type="button" style={quickDateButton} onClick={() => applyQuickDate("today")}>
            Today
          </button>
          <button type="button" style={quickDateButton} onClick={() => applyQuickDate("tomorrow")}>
            Tomorrow
          </button>
          <button type="button" style={quickDateButton} onClick={() => applyQuickDate("this_week")}>
            This Week
          </button>
          <button type="button" style={quickDateButton} onClick={() => applyQuickDate("next_week")}>
            Next Week
          </button>
          <button type="button" style={quickDateButton} onClick={() => setPaymentFilter("unpaid")}>
            Unpaid
          </button>
        </div>

        <div style={filterGrid}>
          <select
            value={dateFilter}
            onChange={(e) => applyQuickDate(e.target.value)}
            style={filterInput}
          >
            <option value="all">All Dates</option>
            <option value="today">Today</option>
            <option value="tomorrow">Tomorrow</option>
            <option value="this_week">This Week</option>
            <option value="next_week">Next Week</option>
            <option value="upcoming">Upcoming</option>
            <option value="past">Past</option>
            <option value="unscheduled">Unscheduled</option>
          </select>

          <input
            type="date"
            value={startDateFilter}
            onChange={(e) => {
              setStartDateFilter(e.target.value);
              setDateFilter("custom");
            }}
            style={filterInput}
            title="Start Date"
          />

          <input
            type="date"
            value={endDateFilter}
            onChange={(e) => {
              setEndDateFilter(e.target.value);
              setDateFilter("custom");
            }}
            style={filterInput}
            title="End Date"
          />

          <select
            value={vehicleFilter}
            onChange={(e) => setVehicleFilter(e.target.value)}
            style={filterInput}
          >
            <option value="all">All Vehicles</option>
            {vehicles.map((vehicle) => (
              <option key={vehicle.id} value={vehicle.id}>
                {vehicle.name}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={filterInput}
          >
            <option value="all">All Statuses</option>
            <option value="scheduled">Scheduled</option>
            <option value="en_route">En Route</option>
            <option value="on_site">On Site</option>
            <option value="completed">Completed</option>
            <option value="billed">Billed</option>
            <option value="paid">Paid</option>
          </select>

          <select
            value={paymentFilter}
            onChange={(e) => setPaymentFilter(e.target.value)}
            style={filterInput}
          >
            <option value="all">All Payments</option>
            <option value="unpaid">Unpaid</option>
            <option value="partial">Partial</option>
            <option value="paid">Paid</option>
          </select>

          <select
            value={serviceFilter}
            onChange={(e) => setServiceFilter(e.target.value)}
            style={filterInput}
          >
            <option value="all">All Services</option>
            {serviceTypes.map((service) => (
              <option key={service} value={service}>
                {service}
              </option>
            ))}
          </select>

          <button type="button" style={clearBtn} onClick={clearFilters}>
            Clear Filters
          </button>
        </div>

        <div style={resultCount}>
          Showing {filteredJobs.length} of {jobs.length} jobs
        </div>
      </div>

      {loading ? (
        <div style={loadingBox}>Loading jobs...</div>
      ) : filteredJobs.length === 0 ? (
        <div style={emptyBox}>No jobs found.</div>
      ) : (
        filteredJobs.map((job) => {
          const tireText = [job.qty, job.tires, job.size].filter(Boolean).join(" • ");
          const unitOrVehicle = job.unit_number || job.vehicle || "";
          const total = formatMoney(job.job_total);
          const vehicle = vehicleMap[job.vehicle_id || ""];
          const vehicleBg = vehicle?.color || "#9ca3af";
          const vehicleText = getTextColor(vehicleBg);
          const vehicleName = vehicle?.name || job.vehicle_id || "Unassigned";

          return (
            <div
              key={job.id}
              style={card}
              onClick={() => router.push(`/jobs/${job.id}`)}
            >
              <div style={cardTop}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={customer}>{job.customer || "Unnamed Job"}</div>

                  {unitOrVehicle ? <div style={sub}>🚗 {unitOrVehicle}</div> : null}
                  {job.address ? <div style={sub}>📍 {job.address}</div> : null}
                  {job.phone ? <div style={sub}>📞 {job.phone}</div> : null}
                  {job.service_type ? <div style={sub}>🔧 {job.service_type}</div> : null}
                  {job.po_number ? <div style={sub}>📄 PO: {job.po_number}</div> : null}
                  {job.billing_name ? <div style={sub}>💵 Bill To: {job.billing_name}</div> : null}
                  {tireText ? <div style={sub}>🛞 {tireText}</div> : null}
                  {job.notes ? <div style={notes}>📝 {job.notes}</div> : null}
                  {job.scheduled ? (
                    <div style={time}>🕒 {formatDateTimeNY(job.scheduled)}</div>
                  ) : (
                    <div style={time}>🕒 Unscheduled</div>
                  )}
                </div>

                <div style={rightSide}>
                  <div
                    style={{
                      ...tag,
                      background: vehicleBg,
                      color: vehicleText,
                    }}
                  >
                    {vehicleName}
                  </div>

                  <div style={infoTag}>
                    {job.job_status || (job.complete ? "completed" : "scheduled")}
                  </div>

                  <div style={infoTag}>{job.payment_status || "unpaid"}</div>

                  {total ? <div style={moneyTag}>{total}</div> : null}

                  {job.invoice_number ? (
                    <div style={infoTag}>Inv: {job.invoice_number}</div>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

const shell: React.CSSProperties = {
  background: "#f8fafc",
  minHeight: "100vh",
};

const page: React.CSSProperties = {
  padding: 20,
  maxWidth: 1000,
  margin: "0 auto",
};

const heroCard: React.CSSProperties = {
  background: "white",
  border: "1px solid #e5e7eb",
  borderRadius: 18,
  padding: 18,
  marginBottom: 16,
  boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
};

const heroTop: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 16,
  flexWrap: "wrap",
};

const eyebrow: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  textTransform: "uppercase",
  color: "#6b7280",
  marginBottom: 6,
};

const title: React.CSSProperties = {
  margin: 0,
  fontSize: 30,
  color: "#111827",
};

const subtitle: React.CSSProperties = {
  marginTop: 8,
  color: "#4b5563",
  fontSize: 15,
};

const baseButton: React.CSSProperties = {
  padding: "11px 14px",
  border: "none",
  borderRadius: 10,
  color: "white",
  cursor: "pointer",
  fontWeight: 700,
  WebkitAppearance: "none",
  appearance: "none",
};

const blueButton: React.CSSProperties = {
  ...baseButton,
  background: "#2563eb",
};

const filterCard: React.CSSProperties = {
  background: "white",
  border: "1px solid #e5e7eb",
  padding: 14,
  borderRadius: 16,
  marginBottom: 14,
  boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
};

const searchInput: React.CSSProperties = {
  display: "block",
  width: "100%",
  padding: 12,
  borderRadius: 10,
  border: "1px solid #d1d5db",
  boxSizing: "border-box",
  fontSize: 16,
  marginBottom: 10,
};

const quickDateRow: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  marginBottom: 10,
};

const quickDateButton: React.CSSProperties = {
  padding: "9px 11px",
  borderRadius: 999,
  border: "1px solid #d1d5db",
  background: "#f9fafb",
  color: "#111827",
  cursor: "pointer",
  fontWeight: 700,
  fontSize: 13,
};

const filterGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: 10,
};

const filterInput: React.CSSProperties = {
  width: "100%",
  padding: 11,
  borderRadius: 10,
  border: "1px solid #d1d5db",
  background: "white",
  fontSize: 14,
  boxSizing: "border-box",
};

const clearBtn: React.CSSProperties = {
  background: "#111827",
  color: "white",
  border: "none",
  borderRadius: 10,
  padding: "11px 12px",
  cursor: "pointer",
  fontWeight: 700,
};

const resultCount: React.CSSProperties = {
  marginTop: 10,
  fontSize: 13,
  color: "#6b7280",
  fontWeight: 700,
};

const loadingBox: React.CSSProperties = {
  padding: 14,
  borderRadius: 12,
  background: "white",
  border: "1px solid #e5e7eb",
  fontSize: 14,
};

const emptyBox: React.CSSProperties = {
  padding: 18,
  borderRadius: 12,
  background: "white",
  border: "1px dashed #d1d5db",
  color: "#6b7280",
};

const card: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  padding: 16,
  marginTop: 12,
  borderRadius: 16,
  background: "white",
  cursor: "pointer",
  boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
};

const cardTop: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
};

const customer: React.CSSProperties = {
  fontWeight: 800,
  fontSize: 18,
  marginBottom: 6,
  color: "#111827",
};

const sub: React.CSSProperties = {
  fontSize: 14,
  marginTop: 4,
  wordBreak: "break-word",
  color: "#374151",
};

const notes: React.CSSProperties = {
  fontSize: 13,
  marginTop: 8,
  color: "#4b5563",
  background: "#f9fafb",
  padding: 8,
  borderRadius: 8,
};

const time: React.CSSProperties = {
  fontSize: 13,
  marginTop: 8,
  color: "#374151",
};

const rightSide: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  alignItems: "flex-end",
};

const tag: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 700,
  whiteSpace: "nowrap",
};

const infoTag: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 999,
  background: "#e5e7eb",
  color: "#111827",
  fontSize: 12,
  fontWeight: 700,
  whiteSpace: "nowrap",
};

const moneyTag: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 999,
  background: "#dcfce7",
  color: "#166534",
  fontSize: 12,
  fontWeight: 700,
  whiteSpace: "nowrap",
};