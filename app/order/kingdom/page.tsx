"use client";

import {
  FormEvent,
  useEffect,
  useMemo,
  useState,
} from "react";
import { supabase } from "@/lib/supabase";

type OrderForm = {
  contact_name: string;
  contact_number: string;
  address: string;
  requested_date: string;
  requested_time: string;
  job_number: string;
  mo_number: string;
  qty: string;
  tire_size: string;
  tire_product_number: string;
  notes: string;
};

type ScheduledJob = {
  id: string | number;
  scheduled: string | null;
  vehicle_id: string | null;
  complete: boolean | null;
  archived?: boolean | null;
};

type AppointmentTime = {
  value: string;
  label: string;
};

const NY_TIMEZONE = "America/New_York";
const APPOINTMENT_LENGTH_MINUTES = 90;

const ELIGIBLE_VEHICLES = ["stepvan", "sprinter"];

const APPOINTMENT_TIMES: AppointmentTime[] = [
  { value: "08:00", label: "8:00 AM" },
  { value: "09:30", label: "9:30 AM" },
  { value: "11:00", label: "11:00 AM" },
  { value: "12:30", label: "12:30 PM" },
  { value: "14:00", label: "2:00 PM" },
  { value: "15:30", label: "3:30 PM" },
];

const initialForm: OrderForm = {
  contact_name: "",
  contact_number: "",
  address: "",
  requested_date: "",
  requested_time: "",
  job_number: "",
  mo_number: "",
  qty: "",
  tire_size: "",
  tire_product_number: "",
  notes: "",
};

function getTodayDate() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: NY_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const getPart = (type: string) =>
    parts.find((part) => part.type === type)?.value || "";

  return `${getPart("year")}-${getPart("month")}-${getPart("day")}`;
}

function addDaysToDateKey(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split("-").map(Number);

  const date = new Date(
    Date.UTC(year, month - 1, day)
  );

  date.setUTCDate(date.getUTCDate() + days);

  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function parseJobDate(value?: string | null) {
  if (!value) return null;

  const cleanValue = value.trim();

  if (!cleanValue) return null;

  const hasTimezone =
    cleanValue.endsWith("Z") ||
    /[+-]\d{2}:\d{2}$/.test(cleanValue);

  const date = hasTimezone
    ? new Date(cleanValue)
    : new Date(cleanValue.replace(" ", "T"));

  return Number.isNaN(date.getTime()) ? null : date;
}

function getNYDateAndMinutes(value: string) {
  const date = parseJobDate(value);

  if (!date) return null;

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: NY_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const getPart = (type: string) =>
    parts.find((part) => part.type === type)?.value || "";

  const hourValue = Number(getPart("hour"));
  const minuteValue = Number(getPart("minute"));

  return {
    dateKey: `${getPart("year")}-${getPart("month")}-${getPart(
      "day"
    )}`,
    minutes:
      (hourValue === 24 ? 0 : hourValue) * 60 + minuteValue,
  };
}

function timeValueToMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function rangesOverlap(
  firstStart: number,
  firstEnd: number,
  secondStart: number,
  secondEnd: number
) {
  return firstStart < secondEnd && secondStart < firstEnd;
}

export default function KingdomOrderPage() {
  const [form, setForm] =
    useState<OrderForm>(initialForm);

  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const [availabilityLoading, setAvailabilityLoading] =
    useState(false);

  const [availabilityError, setAvailabilityError] =
    useState("");

  const [availableTimes, setAvailableTimes] =
    useState<AppointmentTime[]>([]);

  const [errorMessage, setErrorMessage] = useState("");

  const today = useMemo(() => getTodayDate(), []);

  useEffect(() => {
    const loadAvailability = async () => {
      if (!form.requested_date) {
        setAvailableTimes([]);
        setAvailabilityError("");
        return;
      }

      setAvailabilityLoading(true);
      setAvailabilityError("");

      /*
       * We intentionally query a wider date range, then convert
       * each scheduled job into New York time before comparing it
       * with the selected date. This avoids timezone edge cases.
       */
      const dayBefore = addDaysToDateKey(
        form.requested_date,
        -1
      );

      const dayAfter = addDaysToDateKey(
        form.requested_date,
        2
      );

      const { data, error } = await supabase
        .from("jobs")
        .select(`
          id,
          scheduled,
          vehicle_id,
          complete,
          archived
        `)
        .in("vehicle_id", ELIGIBLE_VEHICLES)
        .eq("complete", false)
        .gte("scheduled", `${dayBefore}T00:00:00`)
        .lt("scheduled", `${dayAfter}T00:00:00`);

      setAvailabilityLoading(false);

      if (error) {
        setAvailableTimes([]);
        setAvailabilityError(
          `Available times could not be loaded. ${error.message}`
        );
        return;
      }

      const scheduledJobs = (
        (data || []) as ScheduledJob[]
      ).filter((job) => {
        if (!job.scheduled) return false;
        if (job.complete) return false;
        if (job.archived) return false;

        return ELIGIBLE_VEHICLES.includes(
          job.vehicle_id || ""
        );
      });

      const openTimes = APPOINTMENT_TIMES.filter(
        (appointment) => {
          const slotStart = timeValueToMinutes(
            appointment.value
          );

          const slotEnd =
            slotStart + APPOINTMENT_LENGTH_MINUTES;

          const busyVehicles = new Set<string>();

          scheduledJobs.forEach((job) => {
            if (!job.scheduled || !job.vehicle_id) return;

            const jobTime = getNYDateAndMinutes(
              job.scheduled
            );

            if (!jobTime) return;

            if (
              jobTime.dateKey !== form.requested_date
            ) {
              return;
            }

            const jobStart = jobTime.minutes;
            const jobEnd =
              jobStart + APPOINTMENT_LENGTH_MINUTES;

            if (
              rangesOverlap(
                slotStart,
                slotEnd,
                jobStart,
                jobEnd
              )
            ) {
              busyVehicles.add(job.vehicle_id);
            }
          });

          /*
           * Keep the time visible when at least one eligible
           * vehicle remains available. Hide it only when both
           * Stepvan and Sprinter are occupied.
           */
          return busyVehicles.size < ELIGIBLE_VEHICLES.length;
        }
      );

      setAvailableTimes(openTimes);

      setForm((current) => {
        if (
          current.requested_time &&
          !openTimes.some(
            (time) =>
              time.value === current.requested_time
          )
        ) {
          return {
            ...current,
            requested_time: "",
          };
        }

        return current;
      });
    };

    loadAvailability();
  }, [form.requested_date]);

  const handleChange = (
    event: React.ChangeEvent<
      | HTMLInputElement
      | HTMLTextAreaElement
      | HTMLSelectElement
    >
  ) => {
    const { name, value } = event.target;

    setForm((current) => ({
      ...current,
      [name]: value,
      ...(name === "requested_date"
        ? { requested_time: "" }
        : {}),
    }));

    setErrorMessage("");
  };

  const validateForm = () => {
    if (!form.contact_name.trim()) {
      return "Please enter the contact name.";
    }

    if (!form.contact_number.trim()) {
      return "Please enter a contact number.";
    }

    if (!form.address.trim()) {
      return "Please enter the service address.";
    }

    if (!form.requested_date) {
      return "Please select a requested service date.";
    }

    if (!form.requested_time) {
      return "Please select an available service time.";
    }

    if (
      !availableTimes.some(
        (time) =>
          time.value === form.requested_time
      )
    ) {
      return "That appointment time is no longer available. Please choose another time.";
    }

    if (!form.qty || Number(form.qty) < 1) {
      return "Please enter the number of tires.";
    }

    if (!form.tire_size.trim()) {
      return "Please enter the tire size.";
    }

    return "";
  };

  const verifySelectedTimeIsStillAvailable =
    async () => {
      const dayBefore = addDaysToDateKey(
        form.requested_date,
        -1
      );

      const dayAfter = addDaysToDateKey(
        form.requested_date,
        2
      );

      const { data, error } = await supabase
        .from("jobs")
        .select(`
          id,
          scheduled,
          vehicle_id,
          complete,
          archived
        `)
        .in("vehicle_id", ELIGIBLE_VEHICLES)
        .eq("complete", false)
        .gte("scheduled", `${dayBefore}T00:00:00`)
        .lt("scheduled", `${dayAfter}T00:00:00`);

      if (error) {
        return {
          available: false,
          error: error.message,
        };
      }

      const selectedStart = timeValueToMinutes(
        form.requested_time
      );

      const selectedEnd =
        selectedStart + APPOINTMENT_LENGTH_MINUTES;

      const busyVehicles = new Set<string>();

      ((data || []) as ScheduledJob[]).forEach(
        (job) => {
          if (
            !job.scheduled ||
            !job.vehicle_id ||
            job.complete ||
            job.archived
          ) {
            return;
          }

          if (
            !ELIGIBLE_VEHICLES.includes(
              job.vehicle_id
            )
          ) {
            return;
          }

          const jobTime = getNYDateAndMinutes(
            job.scheduled
          );

          if (
            !jobTime ||
            jobTime.dateKey !== form.requested_date
          ) {
            return;
          }

          const jobStart = jobTime.minutes;
          const jobEnd =
            jobStart + APPOINTMENT_LENGTH_MINUTES;

          if (
            rangesOverlap(
              selectedStart,
              selectedEnd,
              jobStart,
              jobEnd
            )
          ) {
            busyVehicles.add(job.vehicle_id);
          }
        }
      );

      return {
        available:
          busyVehicles.size <
          ELIGIBLE_VEHICLES.length,
        error: "",
      };
    };

  const handleSubmit = async (
    event: FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();

    if (submitting) return;

    const validationError = validateForm();

    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    setSubmitting(true);
    setErrorMessage("");

    /*
     * Check availability again immediately before inserting.
     * This helps prevent a request from using a slot that became
     * unavailable after the customer opened the page.
     */
    const availabilityCheck =
      await verifySelectedTimeIsStillAvailable();

    if (!availabilityCheck.available) {
      setSubmitting(false);

      setForm((current) => ({
        ...current,
        requested_time: "",
      }));

      setErrorMessage(
        availabilityCheck.error
          ? `We could not verify availability. ${availabilityCheck.error}`
          : "That appointment time was just filled. Please select another available time."
      );

      return;
    }

    const { error } = await supabase
      .from("customer_orders")
      .insert({
        customer: "Kingdom Support Services",
        contact_name: form.contact_name.trim(),
        contact_number:
          form.contact_number.trim(),
        address: form.address.trim(),
        requested_date: form.requested_date,
        requested_time: form.requested_time,
        job_number:
          form.job_number.trim() || null,
        mo_number: form.mo_number.trim() || null,
        qty: Number(form.qty),
        tire_size: form.tire_size.trim(),
        tire_product_number:
          form.tire_product_number.trim() || null,
        notes: form.notes.trim() || null,
        order_status: "new",
        tires_ordered: false,
      });

    setSubmitting(false);

    if (error) {
      setErrorMessage(
        `We could not submit the request. ${error.message}`
      );
      return;
    }

    setSubmitted(true);
    setForm(initialForm);
    setAvailableTimes([]);
  };

  const startAnotherRequest = () => {
    setSubmitted(false);
    setErrorMessage("");
    setAvailabilityError("");
    setAvailableTimes([]);
    setForm(initialForm);
  };

  return (
    <main style={pageShell}>
      <header style={header}>
        <div style={headerInner}>
          <img
            src="/bolt-logo.png"
            alt="Bolt Tire"
            style={logo}
          />

          <div style={headerText}>
            <strong style={brandName}>
              Bolt Tire
            </strong>

            <span style={brandSubtitle}>
              Mobile Tire Service
            </span>
          </div>
        </div>
      </header>

      <div style={pageContent}>
        {submitted ? (
          <section style={successCard}>
            <div style={successIcon}>✓</div>

            <div style={eyebrow}>
              Kingdom Support Services
            </div>

            <h1 style={successTitle}>
              Request Received
            </h1>

            <p style={successText}>
              Your tire service request has been sent
              to Bolt Tire.
            </p>

            <p style={successText}>
              We will review the requested date, time,
              and tire information before confirming
              the appointment.
            </p>

            <button
              type="button"
              onClick={startAnotherRequest}
              style={secondaryButton}
            >
              Submit Another Request
            </button>
          </section>
        ) : (
          <>
            <section style={heroCard}>
              <div style={eyebrow}>
                Customer Service Portal
              </div>

              <h1 style={title}>
                Kingdom Support Services
              </h1>

              <h2 style={portalTitle}>
                Request Tire Service
              </h2>

              <p style={subtitle}>
                Enter the service and tire information
                below. Bolt Tire will review your
                request and confirm the appointment.
              </p>
            </section>

            <form
              onSubmit={handleSubmit}
              style={formCard}
            >
              <section style={formSection}>
                <div style={sectionHeading}>
                  Contact Information
                </div>

                <label style={label}>
                  Contact Name
                  <span style={required}> *</span>
                </label>

                <input
                  type="text"
                  name="contact_name"
                  value={form.contact_name}
                  onChange={handleChange}
                  style={input}
                  placeholder="Full name"
                  autoComplete="name"
                />

                <label style={label}>
                  Contact Number
                  <span style={required}> *</span>
                </label>

                <input
                  type="tel"
                  name="contact_number"
                  value={form.contact_number}
                  onChange={handleChange}
                  style={input}
                  placeholder="Phone number"
                  inputMode="tel"
                  autoComplete="tel"
                />

                <label style={label}>
                  Service Address
                  <span style={required}> *</span>
                </label>

                <input
                  type="text"
                  name="address"
                  value={form.address}
                  onChange={handleChange}
                  style={input}
                  placeholder="Street, city, state, and ZIP"
                  autoComplete="street-address"
                />
              </section>

              <section style={formSection}>
                <div style={sectionHeading}>
                  Requested Appointment
                </div>

                <p style={sectionHelp}>
                  Choose a preferred date. Only
                  appointment times that are currently
                  available will appear.
                </p>

                <label style={label}>
                  Requested Date
                  <span style={required}> *</span>
                </label>

                <input
                  type="date"
                  name="requested_date"
                  value={form.requested_date}
                  onChange={handleChange}
                  min={today}
                  style={input}
                />

                <label style={label}>
                  Requested Time
                  <span style={required}> *</span>
                </label>

                <select
                  name="requested_time"
                  value={form.requested_time}
                  onChange={handleChange}
                  style={input}
                  disabled={
                    !form.requested_date ||
                    availabilityLoading ||
                    availableTimes.length === 0
                  }
                >
                  <option value="">
                    {!form.requested_date
                      ? "Select a date first"
                      : availabilityLoading
                        ? "Checking available times..."
                        : availableTimes.length === 0
                          ? "No times available"
                          : "Choose an available time"}
                  </option>

                  {availableTimes.map((time) => (
                    <option
                      key={time.value}
                      value={time.value}
                    >
                      {time.label}
                    </option>
                  ))}
                </select>

                {availabilityLoading && (
                  <div style={availabilityMessage}>
                    Checking the Bolt Tire schedule...
                  </div>
                )}

                {!availabilityLoading &&
                  form.requested_date &&
                  availableTimes.length === 0 &&
                  !availabilityError && (
                    <div style={noAvailabilityBox}>
                      No appointment times are currently
                      available on this date. Please
                      choose another date.
                    </div>
                  )}

                {availabilityError && (
                  <div style={errorBox}>
                    {availabilityError}
                  </div>
                )}
              </section>

              <section style={formSection}>
                <div style={sectionHeading}>
                  Work Order Information
                </div>

                <label style={label}>
                  Job Number
                </label>

                <input
                  type="text"
                  name="job_number"
                  value={form.job_number}
                  onChange={handleChange}
                  style={input}
                  placeholder="Job or work-order number"
                />

                <label style={label}>
                  MO Number
                </label>

                <input
                  type="text"
                  name="mo_number"
                  value={form.mo_number}
                  onChange={handleChange}
                  style={input}
                  placeholder="MO number"
                />
              </section>

              <section style={formSection}>
                <div style={sectionHeading}>
                  Tire Information
                </div>

                <label style={label}>
                  Number of Tires
                  <span style={required}> *</span>
                </label>

                <input
                  type="number"
                  name="qty"
                  value={form.qty}
                  onChange={handleChange}
                  style={input}
                  placeholder="Quantity"
                  inputMode="numeric"
                  min={1}
                  max={100}
                />

                <label style={label}>
                  Tire Size
                  <span style={required}> *</span>
                </label>

                <input
                  type="text"
                  name="tire_size"
                  value={form.tire_size}
                  onChange={handleChange}
                  style={input}
                  placeholder="Example: 11R22.5"
                  autoCapitalize="characters"
                />

                <label style={label}>
                  Tire Product Number
                </label>

                <input
                  type="text"
                  name="tire_product_number"
                  value={form.tire_product_number}
                  onChange={handleChange}
                  style={input}
                  placeholder="Product or item number"
                />
              </section>

              <section style={formSection}>
                <div style={sectionHeading}>
                  Additional Information
                </div>

                <label style={label}>Notes</label>

                <textarea
                  name="notes"
                  value={form.notes}
                  onChange={handleChange}
                  style={textarea}
                  placeholder="Vehicle, unit number, special instructions, or other details"
                />
              </section>

              {errorMessage && (
                <div style={errorBox}>
                  {errorMessage}
                </div>
              )}

              <button
                type="submit"
                disabled={
                  submitting ||
                  availabilityLoading ||
                  !form.requested_time
                }
                style={{
                  ...submitButton,
                  ...(submitting ||
                  availabilityLoading ||
                  !form.requested_time
                    ? disabledButton
                    : {}),
                }}
              >
                {submitting
                  ? "Submitting Request..."
                  : "Submit Service Request"}
              </button>

              <p style={footerNote}>
                Submitting this form sends a service
                request. Your appointment is not
                confirmed until Bolt Tire approves it.
              </p>
            </form>
          </>
        )}
      </div>
    </main>
  );
}

const pageShell: React.CSSProperties = {
  minHeight: "100vh",
  background: "#f8fafc",
  color: "#111827",
};

const header: React.CSSProperties = {
  background: "#ffffff",
  borderBottom: "1px solid #e5e7eb",
};

const headerInner: React.CSSProperties = {
  width: "100%",
  maxWidth: 820,
  margin: "0 auto",
  padding: "12px 18px",
  boxSizing: "border-box",
  display: "flex",
  alignItems: "center",
  gap: 12,
};

const logo: React.CSSProperties = {
  height: 44,
  width: "auto",
  objectFit: "contain",
};

const headerText: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  lineHeight: 1.2,
};

const brandName: React.CSSProperties = {
  fontSize: 17,
  color: "#111827",
};

const brandSubtitle: React.CSSProperties = {
  marginTop: 2,
  fontSize: 12,
  color: "#6b7280",
};

const pageContent: React.CSSProperties = {
  width: "100%",
  maxWidth: 820,
  margin: "0 auto",
  padding: "22px 16px 48px",
  boxSizing: "border-box",
};

const heroCard: React.CSSProperties = {
  padding: "22px 20px",
  marginBottom: 16,
  borderRadius: 18,
  border: "1px solid #e5e7eb",
  background: "#ffffff",
  boxShadow:
    "0 3px 12px rgba(15, 23, 42, 0.06)",
};

const eyebrow: React.CSSProperties = {
  marginBottom: 7,
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: 0.6,
  textTransform: "uppercase",
  color: "#2563eb",
};

const title: React.CSSProperties = {
  margin: 0,
  fontSize: 30,
  lineHeight: 1.15,
  color: "#111827",
};

const portalTitle: React.CSSProperties = {
  margin: "8px 0 0",
  fontSize: 20,
  color: "#374151",
};

const subtitle: React.CSSProperties = {
  maxWidth: 650,
  margin: "12px 0 0",
  fontSize: 15,
  lineHeight: 1.6,
  color: "#4b5563",
};

const formCard: React.CSSProperties = {
  padding: "4px 20px 22px",
  borderRadius: 18,
  border: "1px solid #e5e7eb",
  background: "#ffffff",
  boxShadow:
    "0 3px 12px rgba(15, 23, 42, 0.06)",
};

const formSection: React.CSSProperties = {
  padding: "20px 0",
  borderBottom: "1px solid #e5e7eb",
};

const sectionHeading: React.CSSProperties = {
  marginBottom: 7,
  fontSize: 16,
  fontWeight: 800,
  color: "#111827",
};

const sectionHelp: React.CSSProperties = {
  margin: "0 0 14px",
  fontSize: 13,
  lineHeight: 1.5,
  color: "#6b7280",
};

const label: React.CSSProperties = {
  display: "block",
  marginTop: 14,
  marginBottom: 6,
  fontSize: 13,
  fontWeight: 700,
  color: "#374151",
};

const required: React.CSSProperties = {
  color: "#dc2626",
};

const input: React.CSSProperties = {
  display: "block",
  width: "100%",
  boxSizing: "border-box",
  padding: "12px 13px",
  borderRadius: 10,
  border: "1px solid #d1d5db",
  background: "#ffffff",
  color: "#111827",
  fontSize: 16,
  outline: "none",
};

const textarea: React.CSSProperties = {
  ...input,
  minHeight: 120,
  resize: "vertical",
  fontFamily: "inherit",
};

const availabilityMessage: React.CSSProperties = {
  marginTop: 9,
  color: "#2563eb",
  fontSize: 13,
  fontWeight: 600,
};

const noAvailabilityBox: React.CSSProperties = {
  marginTop: 10,
  padding: 12,
  borderRadius: 10,
  border: "1px solid #fde68a",
  background: "#fffbeb",
  color: "#92400e",
  fontSize: 13,
  fontWeight: 600,
  lineHeight: 1.5,
};

const errorBox: React.CSSProperties = {
  marginTop: 20,
  padding: 13,
  borderRadius: 10,
  border: "1px solid #fecaca",
  background: "#fef2f2",
  color: "#991b1b",
  fontSize: 14,
  fontWeight: 600,
};

const submitButton: React.CSSProperties = {
  display: "block",
  width: "100%",
  marginTop: 22,
  padding: "14px 16px",
  border: "none",
  borderRadius: 11,
  background: "#2563eb",
  color: "#ffffff",
  cursor: "pointer",
  fontSize: 16,
  fontWeight: 800,
  boxShadow:
    "0 4px 10px rgba(37, 99, 235, 0.22)",
};

const disabledButton: React.CSSProperties = {
  opacity: 0.65,
  cursor: "not-allowed",
};

const footerNote: React.CSSProperties = {
  margin: "13px 0 0",
  textAlign: "center",
  fontSize: 12,
  lineHeight: 1.5,
  color: "#6b7280",
};

const successCard: React.CSSProperties = {
  padding: "42px 24px",
  borderRadius: 18,
  border: "1px solid #bbf7d0",
  background: "#ffffff",
  textAlign: "center",
  boxShadow:
    "0 3px 12px rgba(15, 23, 42, 0.06)",
};

const successIcon: React.CSSProperties = {
  width: 64,
  height: 64,
  margin: "0 auto 18px",
  borderRadius: "50%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "#16a34a",
  color: "#ffffff",
  fontSize: 34,
  fontWeight: 900,
};

const successTitle: React.CSSProperties = {
  margin: "4px 0 14px",
  fontSize: 30,
  color: "#111827",
};

const successText: React.CSSProperties = {
  maxWidth: 540,
  margin: "8px auto",
  fontSize: 15,
  lineHeight: 1.6,
  color: "#4b5563",
};

const secondaryButton: React.CSSProperties = {
  marginTop: 22,
  padding: "12px 16px",
  borderRadius: 10,
  border: "1px solid #2563eb",
  background: "#ffffff",
  color: "#2563eb",
  cursor: "pointer",
  fontSize: 15,
  fontWeight: 800,
};