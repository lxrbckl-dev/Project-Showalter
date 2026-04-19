import fs from 'fs/promises';
import path from 'path';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default async function AppleIcon() {
  const buf = await fs.readFile(path.join(process.cwd(), 'public', 'logo_primary.png'));
  return new Response(buf, {
    headers: { 'Content-Type': 'image/png' },
  });
}
