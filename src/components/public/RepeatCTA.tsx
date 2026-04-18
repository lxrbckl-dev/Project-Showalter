/**
 * RepeatCTA — second "Request service" button below the services table.
 * Same #request anchor as the Hero CTA.
 */
export function RepeatCTA() {
  return (
    <section className="bg-gray-900 px-6 py-12 text-center">
      <p className="mb-4 text-lg text-gray-200">Ready to get started?</p>
      <a
        href="/book"
        className="inline-block rounded-md bg-green-600 px-8 py-3 text-base font-semibold text-white shadow-lg transition hover:bg-green-500 focus:outline-none focus:ring-2 focus:ring-green-400 focus:ring-offset-2 focus:ring-offset-gray-900"
      >
        Request service
      </a>
    </section>
  );
}
