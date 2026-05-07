/**
 * Legacy redirect — earlier versions of the verification email pointed here
 * with a `?token=` query. We've since switched to a 6-digit code on the
 * /signup/verify-email page. This file remains so users with an older email
 * in their inbox don't hit a 404; we forward them to the code form.
 */

import { redirect } from "next/navigation";

interface SearchParams {
  email?: string;
}

interface PageProps {
  searchParams: Promise<SearchParams>;
}

export default async function LegacyVerifyEmailPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const target = params.email
    ? `/signup/verify-email?email=${encodeURIComponent(params.email)}`
    : "/signup/verify-email";
  redirect(target);
}
