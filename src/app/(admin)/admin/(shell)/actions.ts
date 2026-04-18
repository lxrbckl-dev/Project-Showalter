'use server';

/**
 * Server actions bound to forms rendered in the admin shell.
 */

import { redirect } from 'next/navigation';
import { signOut } from '@/features/auth/auth';

export async function logoutAction(): Promise<void> {
  await signOut();
  redirect('/admin/login');
}
