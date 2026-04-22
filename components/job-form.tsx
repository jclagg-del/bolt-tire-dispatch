'use client';

import { useState } from 'react';

const defaultValues = {
  customer_name: '',
  tire: '',
  tire_size: '',
  quantity: 1,
  vehicle: '',
  position: '',
  scheduled_at: '',
  contact_name: '',
  phone: '',
  address: '',
  email: '',
  total: '',
  notes: '',
};

export function JobForm() {
  const [values, setValues] = useState(defaultValues);
  const [saved, setSaved] = useState(false);

  function update(name: string, value: string) {
    setSaved(false);
    setValues((current) => ({ ...current, [name]: value }));
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    await fetch('/api/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...values,
        quantity: Number(values.quantity),
        total: values.total ? Number(values.total) : null,
        ordered: true,
        scheduled: Boolean(values.scheduled_at),
        complete: false,
        billed: false,
        paid: false,
      }),
    });

    setSaved(true);
    setValues(defaultValues);
  }

  return (
    <form onSubmit={onSubmit} className="card grid gap-4 p-6 md:grid-cols-2">
      <label>
        Customer
        <input value={values.customer_name} onChange={(e) => update('customer_name', e.target.value)} required />
      </label>
      <label>
        Vehicle
        <input value={values.vehicle} onChange={(e) => update('vehicle', e.target.value)} />
      </label>
      <label>
        Tire
        <input value={values.tire} onChange={(e) => update('tire', e.target.value)} />
      </label>
      <label>
        Size
        <input value={values.tire_size} onChange={(e) => update('tire_size', e.target.value)} />
      </label>
      <label>
        Quantity
        <input type="number" min="1" value={values.quantity} onChange={(e) => update('quantity', e.target.value)} />
      </label>
      <label>
        Position
        <input value={values.position} onChange={(e) => update('position', e.target.value)} />
      </label>
      <label>
        Scheduled time
        <input type="datetime-local" value={values.scheduled_at} onChange={(e) => update('scheduled_at', e.target.value)} />
      </label>
      <label>
        Total
        <input type="number" step="0.01" value={values.total} onChange={(e) => update('total', e.target.value)} />
      </label>
      <label>
        Contact
        <input value={values.contact_name} onChange={(e) => update('contact_name', e.target.value)} />
      </label>
      <label>
        Phone
        <input value={values.phone} onChange={(e) => update('phone', e.target.value)} />
      </label>
      <label className="md:col-span-2">
        Address
        <input value={values.address} onChange={(e) => update('address', e.target.value)} />
      </label>
      <label className="md:col-span-2">
        Email
        <input value={values.email} onChange={(e) => update('email', e.target.value)} />
      </label>
      <label className="md:col-span-2">
        Notes
        <textarea rows={4} value={values.notes} onChange={(e) => update('notes', e.target.value)} />
      </label>
      <div className="md:col-span-2 flex items-center gap-3">
        <button className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white" type="submit">
          Save job
        </button>
        {saved ? <span className="text-sm text-green-400">Saved. Hook this to Supabase and it becomes live.</span> : null}
      </div>
    </form>
  );
}
