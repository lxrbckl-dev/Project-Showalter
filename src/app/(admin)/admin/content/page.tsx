/**
 * Admin Content page — Phase 3A.
 *
 * Multi-tab editor for all non-service site_config fields plus the six
 * message templates. Server component that fetches the current config and
 * passes it to the client-side form components.
 *
 * Tabs:
 *   - Contact      — phone, email, tiktok_url, bio, hero_image_path (read-only)
 *   - SMS fallback — sms_template
 *   - Templates    — six message template bodies with variable-reference hints
 *   - Settings     — booking knobs, photo caps, stats toggles, timezone
 */

import { redirect } from 'next/navigation';
import { auth } from '@/features/auth/auth';
import { getSiteConfig } from '@/features/site-config/queries';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ContactForm } from '@/components/admin/content/ContactForm';
import { HeroImageForm } from '@/components/admin/content/HeroImageForm';
import { SmsForm } from '@/components/admin/content/SmsForm';
import { TemplatesForm } from '@/components/admin/content/TemplatesForm';
import { SettingsForm } from '@/components/admin/content/SettingsForm';

export const metadata = { title: 'Content — Showalter Admin' };

export default async function AdminContentPage() {
  const session = await auth();
  if (!session) redirect('/admin/login');

  const config = await getSiteConfig();

  if (!config) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Content</h1>
        <p className="text-sm text-[hsl(var(--muted-foreground))]">
          Site config not found. Run migrations and seed the database.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-2xl font-semibold tracking-tight">Content</h1>
        <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
          Manage your contact details, message templates, and site settings.
        </p>
      </section>

      <Tabs defaultValue="contact">
        <TabsList className="mb-6">
          <TabsTrigger value="contact">Contact</TabsTrigger>
          <TabsTrigger value="sms">SMS fallback</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="contact" data-testid="tab-contact">
          <ContactForm config={config} />
          <div className="mt-8 border-t border-[hsl(var(--border))] pt-8">
            <HeroImageForm heroImagePath={config.heroImagePath ?? null} />
          </div>
        </TabsContent>

        <TabsContent value="sms" data-testid="tab-sms">
          <SmsForm config={config} />
        </TabsContent>

        <TabsContent value="templates" data-testid="tab-templates">
          <TemplatesForm config={config} />
        </TabsContent>

        <TabsContent value="settings" data-testid="tab-settings">
          <SettingsForm config={config} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
