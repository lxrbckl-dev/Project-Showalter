'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { submitReview } from '@/features/reviews/submit';

/**
 * Customer review form — Phase 9.
 *
 * Client component driving /review/<token>. Three fields:
 *   - rating      : required 1..5 (star picker)
 *   - reviewText  : optional freeform
 *   - photos      : optional multi-file upload, capped per site_config
 *
 * Submits via the `submitReview(token, FormData)` server action. On success
 * the server refreshes its cache, and we call `router.refresh()` so the
 * server component re-queries and flips to the "Thanks!" terminal view.
 */
export function ReviewForm({
  token,
  maxPhotos,
  maxBytes,
}: {
  token: string;
  maxPhotos: number;
  maxBytes: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [text, setText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);

  const maxMb = (maxBytes / 1_048_576).toFixed(1);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>): void {
    const chosen = Array.from(e.target.files ?? []);
    if (chosen.length > maxPhotos) {
      setError(`Too many photos — max ${maxPhotos} allowed.`);
      setFiles(chosen.slice(0, maxPhotos));
      return;
    }
    setError(null);
    setFiles(chosen);
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    if (rating < 1 || rating > 5) {
      setError('Please pick a star rating (1–5).');
      return;
    }
    setError(null);

    const fd = new FormData();
    fd.set('rating', String(rating));
    fd.set('reviewText', text);
    for (const f of files) fd.append('photos', f);

    startTransition(async () => {
      const result = await submitReview(token, fd);
      if (result.ok) {
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-6"
      data-testid="review-form"
    >
      <fieldset>
        <legend className="mb-2 block text-sm font-medium text-green-200">
          Rating
        </legend>
        <div
          className="flex gap-1"
          role="radiogroup"
          aria-label="Star rating"
          data-testid="review-stars"
        >
          {[1, 2, 3, 4, 5].map((star) => {
            const active = star <= (hover || rating);
            return (
              <button
                key={star}
                type="button"
                aria-checked={rating === star}
                aria-label={`${star} star${star === 1 ? '' : 's'}`}
                role="radio"
                data-testid={`star-${star}`}
                data-active={active ? 'true' : 'false'}
                onClick={() => setRating(star)}
                onMouseEnter={() => setHover(star)}
                onMouseLeave={() => setHover(0)}
                className={`text-4xl transition ${
                  active ? 'text-yellow-400' : 'text-gray-600'
                } hover:scale-110 focus:outline-none focus:ring-2 focus:ring-green-400`}
              >
                {active ? '★' : '☆'}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div>
        <label
          htmlFor="reviewText"
          className="mb-2 block text-sm font-medium text-green-200"
        >
          Your review (optional)
        </label>
        <textarea
          id="reviewText"
          name="reviewText"
          data-testid="review-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={5}
          maxLength={2000}
          className="w-full rounded-md border border-green-800 bg-gray-900 px-3 py-2 text-white focus:border-green-400 focus:outline-none"
          placeholder="How was the job? What stood out?"
        />
      </div>

      <div>
        <label
          htmlFor="photos"
          className="mb-2 block text-sm font-medium text-green-200"
        >
          Photos (optional, up to {maxPhotos}, {maxMb} MB each)
        </label>
        <input
          id="photos"
          name="photos"
          type="file"
          data-testid="review-photos"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
          multiple
          onChange={handleFileChange}
          className="block w-full text-sm text-gray-300 file:mr-4 file:rounded-md file:border-0 file:bg-green-700 file:px-4 file:py-2 file:text-white hover:file:bg-green-600"
        />
        {files.length > 0 && (
          <ul className="mt-2 text-xs text-gray-400">
            {files.map((f) => (
              <li key={f.name}>
                {f.name} ({(f.size / 1024).toFixed(1)} KB)
              </li>
            ))}
          </ul>
        )}
      </div>

      {error && (
        <p
          role="alert"
          data-testid="review-error"
          className="rounded-md border border-red-700 bg-red-950 p-3 text-sm text-red-200"
        >
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        data-testid="review-submit"
        className="rounded-md bg-green-600 px-6 py-3 text-base font-semibold text-white shadow-lg transition hover:bg-green-500 focus:outline-none focus:ring-2 focus:ring-green-400 disabled:opacity-60"
      >
        {isPending ? 'Submitting…' : 'Submit review'}
      </button>
    </form>
  );
}
