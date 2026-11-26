import type { ChatAvatarKey, ChatAvatarStyle } from '@/modules/workbench/utils/workbenchSettings';

/** Longest side of a stored avatar; the circle is at most 64 px, so 256 leaves room for zooming in. */
const MAX_AVATAR_SIDE = 256;

/** Downsizes an image (File or data URL) to a small webp data URL for storage. */
export async function prepareAvatarImage(source: Blob | string): Promise<string> {
  const url = typeof source === 'string' ? source : URL.createObjectURL(source);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('无法读取这张图片'));
      element.src = url;
    });
    const scale = Math.min(1, MAX_AVATAR_SIDE / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('浏览器不支持 canvas');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const webp = canvas.toDataURL('image/webp', 0.9);
    // Safari before 14 cannot encode webp and silently returns png.
    return webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/png');
  } finally {
    if (typeof source !== 'string') URL.revokeObjectURL(url);
  }
}

/** What an imported "CloudCLI Chat Avatars" userscript provides. */
export type ImportedAvatars = {
  images: Partial<Record<ChatAvatarKey, string>>;
  styles: Partial<Record<ChatAvatarKey, Partial<ChatAvatarStyle>>>;
};

const ARIA_TO_KEY: Record<string, ChatAvatarKey> = { Claude: 'claude', Codex: 'codex', OpenCode: 'opencode', Cursor: 'cursor' };
const USER_SELECTOR = '.chat-message.user > div > div:last-child';

/** "35% 20%" / "center 20%" → {posX, posY}. */
function readPosition(value: string): { posX?: number; posY?: number } {
  const words: Record<string, number> = { left: 0, top: 0, center: 50, right: 100, bottom: 100 };
  const parts = value.trim().split(/\s+/).map((part) => (part in words ? words[part] : parseFloat(part)));
  return {
    ...(Number.isFinite(parts[0]) ? { posX: parts[0] } : {}),
    ...(Number.isFinite(parts[1]) ? { posY: parts[1] } : {}),
  };
}

/**
 * Reads the avatar images, names and framing out of the userscript this
 * feature replaces, so its setup carries over without re-uploading anything.
 * Later rules win, as they did in the page.
 */
export function parseAvatarUserscript(source: string): ImportedAvatars {
  const result: ImportedAvatars = { images: {}, styles: {} };
  const rulePattern = /([^{}]+)\{([^{}]*)\}/g;
  let match: RegExpExecArray | null;
  while ((match = rulePattern.exec(source)) !== null) {
    const selector = match[1];
    const body = match[2];
    const aria = selector.match(/aria-label="(\w+)"/);
    const key: ChatAvatarKey | undefined = selector.includes(USER_SELECTOR) ? 'user' : aria ? ARIA_TO_KEY[aria[1]] : undefined;
    if (!key) continue;
    const style = (result.styles[key] ??= {});

    const image = body.match(/background-image:\s*url\(["']?(data:image\/[^"')]+)["']?\)/);
    if (image) result.images[key] = image[1];

    const content = body.match(/content:\s*"([^"]*)"/);
    if (content && selector.includes('::after')) style.name = content[1];

    const size = body.match(/background-size:\s*([\d.]+)%/);
    if (size) style.zoom = parseFloat(size[1]);
    else if (/background-size:\s*cover/.test(body)) style.zoom = 100;

    const position = body.match(/background-position:\s*([^;!]+)/);
    if (position) Object.assign(style, readPosition(position[1]));

    if (/background-color:\s*#fff/i.test(body)) style.whiteBackground = true;
  }
  return result;
}
