import Image from 'next/image';

/**
 * Footer — decorative closing sign-off with the diamond secondary logo.
 */
export function Footer() {
  return (
    <footer className="flex items-center justify-center border-t border-gray-200 bg-gray-100 px-6 py-3 text-sm text-gray-500">
      <Image
        src="/logo_secondary.png"
        alt=""
        width={130}
        height={130}
        className="h-auto w-auto max-w-[130px]"
      />
    </footer>
  );
}
