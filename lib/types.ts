export type JobStatus = {
  complete: boolean;
  ordered: boolean;
  scheduled: boolean;
  billed: boolean;
  paid: boolean;
};

export type Job = {
  id: string;
  created_at: string;
  customer_name: string;
  tire: string | null;
  tire_size: string | null;
  quantity: number | null;
  vehicle: string | null;
  position: string | null;
  scheduled_at: string | null;
  contact_name: string | null;
  phone: string | null;
  address: string | null;
  email: string | null;
  total: number | null;
  notes: string | null;
} & JobStatus;

export type DashboardStats = {
  dueToday: number;
  dueThisWeek: number;
  unscheduled: number;
  unpaid: number;
};
