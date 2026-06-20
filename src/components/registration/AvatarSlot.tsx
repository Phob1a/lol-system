'use client';

/**
 * AvatarSlot — client-side avatar / team-logo image picker.
 *
 * Mirrors the `AvatarSlot` component from the NEXUS prototype (screens2.jsx).
 * Stores the selected image as a data URL; there is no `avatarUrl` field on
 * the Registration Prisma model, so the preview is CLIENT-ONLY — the image
 * is NOT sent to the server. Wire to a backend when an upload field is added.
 *
 * Usage:
 *   <AvatarSlot url={avatarUrl} onPick={setAvatarUrl} size={56} />
 */

import { useRef } from 'react';

export interface AvatarSlotProps {
  /** Current preview URL (data URL or null for empty state). */
  url: string | null;
  /** Callback fired with a FileReader data-URL string when the user picks a file. */
  onPick: (dataUrl: string) => void;
  /** Side length of the avatar square in px. Defaults to 56. */
  size?: number;
}

export function AvatarSlot({ url, onPick, size = 56 }: AvatarSlotProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result;
      if (typeof result === 'string') onPick(result);
    };
    reader.readAsDataURL(file);
    // Reset so the same file can be re-selected after clearing
    e.target.value = '';
  }

  return (
    <span style={{ position: 'relative', flex: 'none' }}>
      <button
        type="button"
        title="上传头像 / 战队 Logo"
        onClick={() => inputRef.current?.click()}
        style={{
          width: size,
          height: size,
          padding: 0,
          cursor: 'pointer',
          border: '1px solid rgb(var(--accent-n) / 0.5)',
          background: url
            ? 'transparent'
            : 'linear-gradient(135deg, rgb(var(--accent-n) / 0.2), rgb(var(--panel-2)))',
          display: 'grid',
          placeItems: 'center',
          overflow: 'hidden',
          borderRadius: 'var(--radius-nexus)',
          flexShrink: 0,
          transition: 'border-color 0.15s',
        }}
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element -- src is a data URL; next/image does not support data URLs
          <img
            src={url}
            alt="头像预览"
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <span
            className="font-mono"
            style={{
              fontSize: 9,
              color: 'rgb(var(--accent-n))',
              textAlign: 'center',
              lineHeight: 1.3,
              userSelect: 'none',
            }}
          >
            上传
            <br />
            头像
          </span>
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleChange}
      />
    </span>
  );
}

export default AvatarSlot;
