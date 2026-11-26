import type { ReactNode } from 'react';

import { cn } from '@/shared/utils';
import { useWorkbench } from '@/modules/workbench/context/WorkbenchContext';
import { CHAT_AVATAR_KEYS, type ChatAvatarKey, type ChatAvatarStyle } from '@/modules/workbench/utils/workbenchSettings';

function toAvatarKey(value: string | undefined): ChatAvatarKey | null {
  return value && (CHAT_AVATAR_KEYS as string[]).includes(value) ? value as ChatAvatarKey : null;
}

/** The framed avatar circle; also used by the settings preview. */
export function AvatarCircle({ image, style, size, className }: {
  image: string;
  style: ChatAvatarStyle;
  size: number;
  className?: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={cn('flex-shrink-0 overflow-hidden rounded-full border border-[rgba(140,140,160,0.25)]', className)}
      style={{
        width: size,
        height: size,
        backgroundImage: `url("${image}")`,
        backgroundRepeat: 'no-repeat',
        backgroundSize: `${style.zoom}% auto`,
        backgroundPosition: `${style.posX}% ${style.posY}%`,
        backgroundColor: style.whiteBackground ? '#ffffff' : undefined,
      }}
    />
  );
}

/**
 * Used by the chat transcript in place of the provider logo and the user's
 * "U" bubble. Renders `fallback` (the upstream avatar) when avatars are off,
 * no image was uploaded for this key, or outside the workbench.
 */
export default function ChatAvatar({ avatarKey, fallback, className }: {
  avatarKey: string | undefined;
  fallback: ReactNode;
  className?: string;
}) {
  const workbench = useWorkbench();
  const key = toAvatarKey(avatarKey);
  const image = key ? workbench?.avatarImages[key] : undefined;
  const settings = workbench?.settings.chatAvatars;
  if (!workbench?.isReady || !settings?.enabled || !key || !image) return <>{fallback}</>;
  return <AvatarCircle image={image} style={settings.styles[key]} size={settings.size} className={className} />;
}

/** Used by the chat transcript: the custom name for a provider's messages, or the given default. */
export function useChatDisplayName(provider: string | undefined, fallback: string): string {
  const workbench = useWorkbench();
  const key = toAvatarKey(provider);
  const settings = workbench?.settings.chatAvatars;
  if (!key || !settings?.enabled) return fallback;
  return settings.styles[key].name.trim() || fallback;
}
