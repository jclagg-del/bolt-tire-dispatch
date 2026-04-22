import { Job } from '@/lib/types';
import { formatMoney } from '@/lib/utils';

export function WeeklyBoard({ week }: { week: Record<string, Job[]> }) {
  const days = Object.entries(week);

  return (
    <div className="grid gap-4 xl:grid-cols-7">
      {days.map(([day, jobs]) => (
        <section key={day} className="card min-h-[320px] p-4">
          <div className="mb-4 border-b border-line pb-3">
            <p className="text-sm font-medium text-slate-200">
              {new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'short', day: 'numeric' }).format(new Date(day))}
            </p>
            <p className="text-xs text-slate-400">{jobs.length} open job{jobs.length === 1 ? '' : 's'}</p>
          </div>
          <div className="space-y-3">
            {jobs.length ? (
              jobs.map((job) => (
                <div key={job.id} className="rounded-xl border border-line bg-slate-950/30 p-3 text-sm">
                  <div className="font-medium">{job.customer_name}</div>
                  <div className="text-slate-400">{job.vehicle || 'Vehicle not set'}</div>
                  <div className="mt-2">{job.scheduled_at ? new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(new Date(job.scheduled_at)) : 'Unscheduled'}</div>
                  <div className="mt-1 text-slate-300">{job.address || 'Address missing'}</div>
                  <div className="mt-2 text-slate-400">{job.tire || 'Tire'} {job.tire_size ? `• ${job.tire_size}` : ''}</div>
                  <div className="mt-1 text-slate-400">{formatMoney(job.total)}</div>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-500">No open jobs.</p>
            )}
          </div>
        </section>
      ))}
    </div>
  );
}
