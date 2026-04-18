import type { ServiceRow } from '@/db/schema/services';

interface ServicesProps {
  services: ServiceRow[];
}

/**
 * Format a price from cents to display string.
 * NULL price_cents → "Contact for pricing"
 * Non-null → "$<dollars>" + price_suffix (e.g. "$40" or "$75+")
 */
function formatPrice(priceCents: number | null, priceSuffix: string): string {
  if (priceCents === null) return 'Contact for pricing';
  const dollars = Math.floor(priceCents / 100);
  return `$${dollars}${priceSuffix}`;
}

/**
 * Services section — renders a styled table of active services with prices.
 * Renders nothing if the services array is empty.
 */
export function Services({ services }: ServicesProps) {
  if (services.length === 0) {
    return (
      <section id="services" className="bg-white px-6 py-16">
        <div className="mx-auto max-w-2xl">
          <h2 className="mb-4 text-2xl font-bold tracking-tight text-gray-900">Services</h2>
          <p className="text-gray-500">No services listed yet — check back soon.</p>
        </div>
      </section>
    );
  }

  return (
    <section id="services" className="bg-white px-6 py-16">
      <div className="mx-auto max-w-2xl">
        <h2 className="mb-2 text-2xl font-bold tracking-tight text-gray-900">Services</h2>
        <p className="mb-8 text-sm italic text-gray-500">
          This is just an estimate — every job is different.
        </p>
        <div className="overflow-hidden rounded-lg border border-gray-200 shadow-sm">
          <table className="w-full text-left text-sm" aria-label="Services and pricing">
            <thead className="bg-gray-900 text-white">
              <tr>
                <th scope="col" className="px-4 py-3 font-semibold">Service</th>
                <th scope="col" className="px-4 py-3 font-semibold">Description</th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">Price</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {services.map((service, idx) => (
                <tr key={service.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="px-4 py-3 font-medium text-gray-900">{service.name}</td>
                  <td className="px-4 py-3 text-gray-600">{service.description}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-medium text-green-700">
                    {formatPrice(service.priceCents, service.priceSuffix)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
