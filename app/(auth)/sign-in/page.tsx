import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { sendMagicLinkAction } from './actions';

export default function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col justify-center px-6">
      <h1 className="mb-2 text-2xl font-semibold">Sign in</h1>
      <p className="text-muted-foreground mb-6 text-sm">
        Enter your email and we&apos;ll send a sign-in link.
      </p>

      <SearchParamsBanner searchParams={searchParams} />

      <form action={sendMagicLinkAction} className="flex flex-col gap-3">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" required autoComplete="email" />
        <Button type="submit">Send magic link</Button>
      </form>
    </main>
  );
}

async function SearchParamsBanner({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  const sp = await searchParams;
  if (sp.sent) {
    return (
      <div
        role="status"
        className="mb-4 rounded border border-green-300 bg-green-50 p-3 text-sm text-green-900"
      >
        Magic link sent. Check your email.
      </div>
    );
  }
  if (sp.error) {
    return (
      <div
        role="alert"
        className="mb-4 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-900"
      >
        {sp.error}
      </div>
    );
  }
  return null;
}
