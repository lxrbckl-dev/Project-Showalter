import fs from 'fs/promises';
import path from 'path';

export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

export default async function Icon() {
  const buf = await fs.readFile(path.join(process.cwd(), 'public', 'logo_secondary.png'));
  return new Response(buf, {
    headers: { 'Content-Type': 'image/png' },
  });
}
