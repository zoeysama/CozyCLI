import { useRef, useState } from 'react';
import { FileUp, Trash2, Upload } from 'lucide-react';

import { Button, Input, LLMProviderLogo } from '@/shared/ui';
import type { LLMProvider } from '@/shared/types';
import { useWorkbench } from '@/modules/workbench/context/WorkbenchContext';
import { AvatarCircle } from '@/modules/workbench/ChatAvatar';
import { parseAvatarUserscript, prepareAvatarImage } from '@/modules/workbench/utils/avatarImages';
import { CHAT_AVATAR_KEYS, type ChatAvatarKey, type ChatAvatarStyle } from '@/modules/workbench/utils/workbenchSettings';

const LABELS: Record<ChatAvatarKey, string> = {
  claude: 'Claude',
  codex: 'Codex',
  opencode: 'OpenCode',
  cursor: 'Cursor',
  user: '我',
};

function Slider({ label, value, min, max, onChange }: {
  label: string; value: number; min: number; max: number; onChange: (value: number) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-xs text-muted-foreground">
      <span className="w-8 flex-shrink-0">{label}</span>
      <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} className="min-w-0 flex-1" />
      <span className="w-9 flex-shrink-0 text-right tabular-nums">{value}</span>
    </label>
  );
}

/**
 * Rendered by the settings dialog: per-avatar image upload, framing and
 * display name, plus importing the "CloudCLI Chat Avatars" userscript.
 */
export default function ChatAvatarSettings({ Switch }: {
  Switch: (props: { checked: boolean; onChange: (next: boolean) => void; label: string }) => JSX.Element;
}) {
  const workbench = useWorkbench();
  // The avatar whose framing controls are expanded.
  const [editing, setEditing] = useState<ChatAvatarKey | null>(null);
  // Result line of the last upload or import.
  const [status, setStatus] = useState('');
  const uploadTarget = useRef<ChatAvatarKey | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const scriptInput = useRef<HTMLInputElement>(null);
  if (!workbench) return null;

  const { chatAvatars } = workbench.settings;
  const setStyle = (key: ChatAvatarKey, patch: Partial<ChatAvatarStyle>) =>
    workbench.saveSettings({ chatAvatars: { styles: { [key]: patch } } });

  const onImage = async (file: File | undefined) => {
    const key = uploadTarget.current;
    if (!file || !key) return;
    try {
      await workbench.setAvatarImage(key, await prepareAvatarImage(file));
      setStatus(`已更新 ${LABELS[key]} 的头像`);
    } catch (error) {
      setStatus(`上传失败：${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const onScript = async (file: File | undefined) => {
    if (!file) return;
    try {
      const imported = parseAvatarUserscript(await file.text());
      const keys = Object.keys(imported.images) as ChatAvatarKey[];
      if (keys.length === 0) throw new Error('脚本里没有找到头像图片');
      for (const key of keys) await workbench.setAvatarImage(key, await prepareAvatarImage(imported.images[key]!));
      workbench.saveSettings({ chatAvatars: { enabled: true, styles: imported.styles } });
      setStatus(`已导入：${keys.map((key) => LABELS[key]).join('、')}`);
    } catch (error) {
      setStatus(`导入失败：${error instanceof Error ? error.message : String(error)}`);
    }
  };

  return (
    <>
      <div className="flex items-center justify-between gap-4 py-1.5">
        <p className="text-sm text-foreground">使用自定义头像</p>
        <Switch checked={chatAvatars.enabled} label="使用自定义头像" onChange={(value) => workbench.saveSettings({ chatAvatars: { enabled: value } })} />
      </div>
      <div className="py-1.5">
        <Slider label="大小" value={chatAvatars.size} min={24} max={64} onChange={(size) => workbench.saveSettings({ chatAvatars: { size } })} />
      </div>

      {CHAT_AVATAR_KEYS.map((key) => {
        const image = workbench.avatarImages[key];
        const style = chatAvatars.styles[key];
        return (
          <div key={key} className="py-2">
            <div className="flex items-center gap-3">
              {image
                ? <AvatarCircle image={image} style={style} size={36} />
                : (
                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-dashed border-border text-xs text-muted-foreground">
                    {key === 'user' ? 'U' : <LLMProviderLogo provider={key as LLMProvider} className="h-5 w-5" />}
                  </div>
                )}
              <div className="min-w-0 flex-1">
                <p className="text-sm text-foreground">{LABELS[key]}</p>
                {key !== 'user' && (
                  <Input
                    className="mt-1 h-7 text-xs"
                    placeholder="显示名称（留空用默认）"
                    defaultValue={style.name}
                    onBlur={(e) => { if (e.target.value !== style.name) setStyle(key, { name: e.target.value }); }}
                  />
                )}
              </div>
              <div className="flex flex-shrink-0 items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => { uploadTarget.current = key; fileInput.current?.click(); }}
                >
                  <Upload className="mr-1 h-3 w-3" />{image ? '更换' : '上传'}
                </Button>
                {image && (
                  <>
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setEditing(editing === key ? null : key)}>
                      调整
                    </Button>
                    <button
                      type="button"
                      title="删除头像"
                      onClick={() => { void workbench.setAvatarImage(key, null); }}
                      className="rounded p-1 text-muted-foreground hover:bg-red-500/10 hover:text-red-500"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}
              </div>
            </div>
            {editing === key && image && (
              <div className="mt-2 space-y-1.5 pl-12">
                <Slider label="缩放" value={style.zoom} min={50} max={300} onChange={(zoom) => setStyle(key, { zoom })} />
                <Slider label="水平" value={style.posX} min={0} max={100} onChange={(posX) => setStyle(key, { posX })} />
                <Slider label="垂直" value={style.posY} min={0} max={100} onChange={(posY) => setStyle(key, { posY })} />
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input type="checkbox" checked={style.whiteBackground} onChange={(e) => setStyle(key, { whiteBackground: e.target.checked })} />
                  白色底（透明图片用）
                </label>
              </div>
            )}
          </div>
        );
      })}

      <div className="flex flex-wrap items-center gap-2 py-2">
        <Button variant="outline" size="sm" onClick={() => scriptInput.current?.click()}>
          <FileUp className="mr-1 h-3.5 w-3.5" />从油猴脚本导入
        </Button>
        {status && <span className="text-xs text-muted-foreground">{status}</span>}
      </div>

      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => { void onImage(e.target.files?.[0]); e.target.value = ''; }}
      />
      <input
        ref={scriptInput}
        type="file"
        accept=".js,.txt,text/javascript"
        className="hidden"
        onChange={(e) => { void onScript(e.target.files?.[0]); e.target.value = ''; }}
      />
    </>
  );
}
