import { useState } from 'react';
import { Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/shared/ui';
import { cn } from '@/shared/utils';
import { useWorkbench } from '@/modules/workbench/context/WorkbenchContext';
import {
  WORKBENCH_COLOR_KEYS,
  WORKBENCH_PALETTE,
  defaultColorFor,
  toColorKey,
  type WorkbenchColorKey,
} from '@/modules/workbench/utils/workbenchPalette';

type ProjectIdentityDialogProps = {
  projectId: string;
  projectName: string;
  onClose: () => void;
};

/** Rendered by WorkbenchDialogs to pick one project's color. */
export default function ProjectIdentityDialog({ projectId, projectName, onClose }: ProjectIdentityDialogProps) {
  const workbench = useWorkbench();
  const { t } = useTranslation('workbench');
  const storedColor = toColorKey(workbench?.projectIdentities[projectId]?.color);
  const generatedColor = defaultColorFor(projectId);
  // The color being edited; null means "use the generated one".
  const [color, setColor] = useState<WorkbenchColorKey | null>(storedColor);

  if (!workbench) return null;
  const previewColor = color ?? generatedColor;

  const save = () => {
    workbench.setProjectIdentity(projectId, { color, badge: null });
    onClose();
  };

  return (
    <div className="space-y-4 p-5">
      <div className="min-w-0">
        <h3 className="text-sm font-semibold text-foreground">{t('projectIdentity.title')}</h3>
        <p className={cn('truncate text-sm font-medium', WORKBENCH_PALETTE[previewColor].text)} title={projectName}>
          {projectName}
        </p>
      </div>

      <div className="grid grid-cols-6 gap-2">
        {WORKBENCH_COLOR_KEYS.map((key) => {
          const isActive = previewColor === key;
          return (
            <button
              key={key}
              type="button"
              title={t(WORKBENCH_PALETTE[key].label) + (key === generatedColor ? t('projectIdentity.auto') : '')}
              aria-label={t(WORKBENCH_PALETTE[key].label)}
              aria-pressed={isActive}
              onClick={() => setColor(key)}
              className={cn(
                'flex h-8 items-center justify-center rounded-md transition-transform hover:scale-105',
                WORKBENCH_PALETTE[key].solid,
                isActive && 'ring-2 ring-ring ring-offset-2 ring-offset-background',
              )}
            >
              {isActive && <Check className="h-3.5 w-3.5" />}
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between pt-1">
        <Button variant="ghost" size="sm" onClick={() => setColor(null)} disabled={color === null}>{t('projectIdentity.resetAuto')}</Button>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>{t('common.cancel')}</Button>
          <Button size="sm" onClick={save}>{t('common.save')}</Button>
        </div>
      </div>
    </div>
  );
}
