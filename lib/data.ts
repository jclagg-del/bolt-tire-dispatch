import { demoJobs } from '@/lib/mock-data';
import { DashboardStats, Job } from '@/lib/types';
import { createClient } from '@/lib/supabase/server';
import { startOfWeek } from '@/lib/utils';

export async function getJobs(): Promise<Job[]> {
  const supabase = await createClient();
  if (!supabase) return demoJobs;

  const { data, error } = await supabase
    .from('jobs')
    .select('*')
    .order('scheduled_at', { ascending: true, nullsFirst: false });

  if (error || !data) return demoJobs;
  return data as Job[];
}

export async function getOpenScheduledJobs(): Promise<Job[]> {
  const jobs = await getJobs();
  return jobs.filter((job) => job.scheduled && !job.complete);
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const jobs = await getJobs();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weekStart = startOfWeek(today);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  return {
    dueToday: jobs.filter((job) => {
      if (!job.scheduled_at || job.complete) return false;
      const date = new Date(job.scheduled_at);
      date.setHours(0, 0, 0, 0);
      return date.getTime() === today.getTime();
    }).length,
    dueThisWeek: jobs.filter((job) => {
      if (!job.scheduled_at || job.complete) return false;
      const date = new Date(job.scheduled_at);
      return date >= weekStart && date < weekEnd;
    }).length,
    unscheduled: jobs.filter((job) => !job.scheduled && !job.complete).length,
    unpaid: jobs.filter((job) => !job.paid && job.total != null).length,
  } satisfies DashboardStats;
}

export async function getWeeklyJobs(reference = new Date()): Promise<Record<string, Job[]>> {
  const jobs = await getOpenScheduledJobs();
  const weekStart = startOfWeek(reference);
  const days = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });

  return Object.fromEntries(
    days.map((day) => {
      const dayStart = new Date(day);
      const dayEnd = new Date(day);
      dayEnd.setDate(dayEnd.getDate() + 1);
      const key = dayStart.toISOString().slice(0, 10);
      return [
        key,
        jobs.filter((job) => {
          if (!job.scheduled_at) return false;
          const at = new Date(job.scheduled_at);
          return at >= dayStart && at < dayEnd;
        }),
      ];
    }),
  );
}
