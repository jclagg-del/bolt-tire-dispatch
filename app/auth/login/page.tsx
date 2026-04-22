import { PageHeader } from '@/components/page-header';

export default function LoginPage() {
  return (
    <>
      <PageHeader
        eyebrow="Auth"
        title="Login"
        description="Wire this to Supabase Auth when you are ready. Password, magic link, or Google all work."
      />
      <div className="card max-w-md p-6">
        <p className="text-sm text-slate-300">This starter keeps auth lightweight so you can get the workflow right first.</p>
      </div>
    </>
  );
}
