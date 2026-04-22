import { Job } from '@/lib/types';
import { formatDateTime, formatMoney } from '@/lib/utils';

export function JobCard({ job }: { job: Job }) {
  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-lg font-semibold">{job.customer_name}</p>
          <p className="text-sm text-slate-400">{job.vehicle || 'Vehicle not set'}</p>
        </div>
        <div className="text-right text-sm text-slate-300">
          <div>{formatDateTime(job.scheduled_at)}</div>
          <div className="mt-1">{formatMoney(job.total)}</div>
        </div>
      </div>
      <div className="mt-4 grid gap-2 text-sm text-slate-300 md:grid-cols-2">
        <div>
          <span className="text-slate-500">Tires: </span>
          {job.tire || '—'} {job.tire_size ? `(${job.tire_size})` : ''}
        </div>
        <div>
          <span className="text-slate-500">Qty: </span>
          {job.quantity ?? '—'}
        </div>
        <div>
          <span className="text-slate-500">Contact: </span>
          {job.contact_name || '—'} {job.phone ? `• ${job.phone}` : ''}
        </div>
        <div>
          <span className="text-slate-500">Address: </span>
          {job.address || '—'}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <span className="badge">{job.ordered ? 'Ordered' : 'Not ordered'}</span>
        <span className="badge">{job.scheduled ? 'Scheduled' : 'Unscheduled'}</span>
        <span className="badge">{job.complete ? 'Complete' : 'Open'}</span>
        <span className="badge">{job.billed ? 'Billed' : 'Unbilled'}</span>
        <span className="badge">{job.paid ? 'Paid' : 'Unpaid'}</span>
      </div>
      {job.notes ? <p className="mt-3 text-sm text-slate-300">Note: {job.notes}</p> : null}
    </div>
  );
}
