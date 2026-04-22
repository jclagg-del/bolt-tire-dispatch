"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";

type JobRow = {
  id: string | number;
  customer?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  scheduled?: string | null;
};

type CustomerCard = {
  customer: string;
  phone: string;
  email: string;
  address: string;
  latestScheduled: string;
  jobCount: number;
};

const NY_TIMEZONE = "America/New_York";

function parseJobDate(input?: string | null) {
  if (!input) return null;

  const value = input.trim();
  if (!value) return null;

  const hasTimezone =
    value.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(value);

  if (hasTimezone) {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }

  const localValue = value.replace(" ", "T");
  const d = new Date(localValue);

  return isNaN(d.getTime()) ? null : d;
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

function cleanPhone(phone?: string | null) {
  if (!phone) return "";
  return phone.replace(/[^\d+]/g, "");
}

function normalizeCustomerName(name?: string | null) {
  return (name || "").trim();
}

export default function CustomersPage() {
  const [rows, setRows] = useState<JobRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const router = useRouter();

  const fetchCustomers = async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from("jobs")
      .select(`
        id,
        customer,
        phone,
        email,
        address,
        scheduled
      `)
      .order("scheduled", { ascending: false });

    if (error) {
      console.error("Error fetching customers:", error.message);
      setRows([]);
      setLoading(false);
      return;
    }

    setRows((data as JobRow[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchCustomers();
  }, []);

  const customers = useMemo(() => {
    const map = new Map<string, CustomerCard>();

    for (const row of rows) {
      const customerName = normalizeCustomerName(row.customer);
      if (!customerName) continue;

      const key = customerName.toLowerCase();
      const existing = map.get(key);

      if (!existing) {
        map.set(key, {
          customer: customerName,
          phone: row.phone?.trim() || "",
          email: row.email?.trim() || "",
          address: row.address?.trim() || "",
          latestScheduled: row.scheduled || "",
          jobCount: 1,
        });
        continue;
      }

      existing.jobCount += 1;

      if (!existing.phone && row.phone) {
        existing.phone = row.phone.trim();
      }

      if (!existing.email && row.email) {
        existing.email = row.email.trim();
      }

      if (!existing.address && row.address) {
        existing.address = row.address.trim();
      }

      const existingDate = parseJobDate(existing.latestScheduled);
      const rowDate = parseJobDate(row.scheduled);

      if (
        rowDate &&
        (!existingDate || rowDate.getTime() > existingDate.getTime())
      ) {
        existing.latestScheduled = row.scheduled || existing.latestScheduled;

        if (row.phone?.trim()) existing.phone = row.phone.trim();
        if (row.email?.trim()) existing.email = row.email.trim();
        if (row.address?.trim()) existing.address = row.address.trim();
      }
    }

    return Array.from(map.values()).sort((a, b) =>
      a.customer.localeCompare(b.customer)
    );
  }, [rows]);

  const filteredCustomers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return customers;

    return customers.filter((c) => {
      return (
        c.customer.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        c.address.toLowerCase().includes(q)
      );
    });
  }, [customers, search]);

  return (
    <div style={shell}>
      <AppHeader />

      <div style={page}>
        <div style={heroCard}>
          <div style={heroTop}>
            <div>
              <div style={eyebrow}>Customers</div>
              <h1 style={title}>Customer Directory</h1>
              <p style={subtitle}>
                Quick access to customer contact info and recent job activity.
              </p>
            </div>
          </div>

          <div style={toolbar}>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search customer, phone, email, or address"
              style={searchInput}
            />
          </div>
        </div>

        {loading ? (
          <div style={loadingBox}>Loading customers...</div>
        ) : filteredCustomers.length === 0 ? (
          <div style={emptyBox}>No customers found.</div>
        ) : (
          <div style={grid}>
            {filteredCustomers.map((customer) => {
              const phoneHref = cleanPhone(customer.phone);
              const canCall = !!phoneHref;
              const canText = !!phoneHref;
              const canEmail = !!customer.email;

              return (
                <div key={customer.customer} style={card}>
                  <div style={cardTop}>
                    <div>
                      <div style={customerName}>{customer.customer}</div>
                      <div style={jobCount}>
                        {customer.jobCount} job{customer.jobCount === 1 ? "" : "s"}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        router.push(
                          `/jobs?customer=${encodeURIComponent(customer.customer)}`
                        )
                      }
                      style={openJobsButton}
                    >
                      Open Jobs
                    </button>
                  </div>

                  {customer.phone ? (
                    <div style={infoLine}>📞 {customer.phone}</div>
                  ) : (
                    <div style={infoLineMuted}>📞 No phone on file</div>
                  )}

                  {customer.email ? (
                    <div style={infoLine}>✉️ {customer.email}</div>
                  ) : (
                    <div style={infoLineMuted}>✉️ No email on file</div>
                  )}

                  {customer.address ? (
                    <div style={infoLine}>📍 {customer.address}</div>
                  ) : (
                    <div style={infoLineMuted}>📍 No address on file</div>
                  )}

                  {customer.latestScheduled ? (
                    <div style={infoLineMuted}>
                      Last job: {formatDateTimeNY(customer.latestScheduled)}
                    </div>
                  ) : null}

                  <div style={buttonRow}>
                    {canCall ? (
                      <a href={`tel:${phoneHref}`} style={callButton}>
                        Call
                      </a>
                    ) : (
                      <span style={disabledButton}>Call</span>
                    )}

                    {canText ? (
                      <a href={`sms:${phoneHref}`} style={textButton}>
                        Text
                      </a>
                    ) : (
                      <span style={disabledButton}>Text</span>
                    )}

                    {canEmail ? (
                      <a
                        href={`mailto:${customer.email}`}
                        style={emailButton}
                      >
                        Email
                      </a>
                    ) : (
                      <span style={disabledButton}>Email</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

const shell: React.CSSProperties = {
  background: "#f8fafc",
  minHeight: "100vh",
};

const page: React.CSSProperties = {
  padding: 20,
  maxWidth: 1100,
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

const toolbar: React.CSSProperties = {
  marginTop: 16,
};

const searchInput: React.CSSProperties = {
  width: "100%",
  padding: 12,
  borderRadius: 10,
  border: "1px solid #d1d5db",
  fontSize: 16,
  boxSizing: "border-box",
  background: "#fff",
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

const grid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
  gap: 14,
};

const card: React.CSSProperties = {
  background: "white",
  border: "1px solid #e5e7eb",
  borderRadius: 16,
  padding: 16,
  boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
};

const cardTop: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
  marginBottom: 12,
};

const customerName: React.CSSProperties = {
  fontWeight: 800,
  fontSize: 20,
  color: "#111827",
};

const jobCount: React.CSSProperties = {
  marginTop: 4,
  fontSize: 13,
  color: "#6b7280",
};

const infoLine: React.CSSProperties = {
  fontSize: 14,
  marginTop: 6,
  color: "#111827",
  wordBreak: "break-word",
};

const infoLineMuted: React.CSSProperties = {
  fontSize: 13,
  marginTop: 6,
  color: "#6b7280",
  wordBreak: "break-word",
};

const buttonRow: React.CSSProperties = {
  display: "flex",
  gap: 8,
  marginTop: 14,
  flexWrap: "wrap",
};

const actionBase: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  textDecoration: "none",
  fontWeight: 700,
  fontSize: 14,
  border: "none",
  cursor: "pointer",
};

const callButton: React.CSSProperties = {
  ...actionBase,
  background: "#2563eb",
  color: "white",
};

const textButton: React.CSSProperties = {
  ...actionBase,
  background: "#7c3aed",
  color: "white",
};

const emailButton: React.CSSProperties = {
  ...actionBase,
  background: "#16a34a",
  color: "white",
};

const disabledButton: React.CSSProperties = {
  ...actionBase,
  background: "#d1d5db",
  color: "#666",
  cursor: "default",
};

const openJobsButton: React.CSSProperties = {
  ...actionBase,
  background: "#111827",
  color: "white",
};