import { useMemo, useState } from 'react';
import { Check, Plus, Tag, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button, Input } from '@/shared/ui';
import { cn } from '@/shared/utils';
import { useWorkbench } from '@/modules/workbench/context/WorkbenchContext';
import { tagChipClass } from '@/modules/workbench/SessionTagChips';
import { WORKBENCH_COLOR_KEYS, WORKBENCH_PALETTE } from '@/modules/workbench/utils/workbenchPalette';

const MAX_TAGS = 8;
const MAX_TAG_CHARACTERS = 24;

type SessionTagsDialogProps = {
  sessionId: string;
  sessionName: string;
  onClose: () => void;
};

/** Rendered by WorkbenchDialogs to pick, create and color the tags of one session. */
export default function SessionTagsDialog({ sessionId, sessionName, onClose }: SessionTagsDialogProps) {
  const workbench = useWorkbench();
  const { t } = useTranslation('workbench');
  // The session's tag set being edited, committed on save.
  const [selected, setSelected] = useState<string[]>(() => workbench?.sessionTags[sessionId] ?? []);
  // Text of the new-tag field; doubles as a search over existing tags.
  const [draft, setDraft] = useState('');
  // The tag whose color row is expanded, or null.
  const [coloring, setColoring] = useState<string | null>(null);

  const allTags = useMemo(() => {
    const known = workbench ? [...workbench.tagColors.keys()] : [];
    // Tags created in this dialog but not saved yet still need a row.
    return [...known, ...selected.filter((tag) => !known.includes(tag))];
  }, [selected, workbench]);

  if (!workbench) return null;

  const query = draft.trim();
  const visibleTags = query ? allTags.filter((tag) => tag.toLowerCase().includes(query.toLowerCase())) : allTags;
  const canCreate = query.length > 0
    && [...query].length <= MAX_TAG_CHARACTERS
    && !allTags.includes(query)
    && selected.length < MAX_TAGS;

  const toggle = (tag: string) => {
    setSelected((current) => (current.includes(tag)
      ? current.filter((item) => item !== tag)
      : current.length >= MAX_TAGS ? current : [...current, tag]));
  };

  const createFromDraft = () => {
    if (!canCreate) {
      if (query && allTags.includes(query) && !selected.includes(query)) toggle(query);
      return;
    }
    setSelected((current) => [...current, query]);
    setDraft('');
  };

  const save = () => {
    workbench.setSessionTags(sessionId, selected);
    onClose();
  };

  return (
    <div className="space-y-4 p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-muted">
          <Tag className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground">{t('sessionTags.title')}</h3>
          <p className="truncate text-xs text-muted-foreground" title={sessionName}>{sessionName}</p>
        </div>
      </div>

      <div className="flex gap-2">
        <Input
          value={draft}
          placeholder={t('sessionTags.search')}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); createFromDraft(); } }}
          autoFocus
        />
        <Button variant="outline" size="sm" className="h-9 flex-shrink-0" onClick={createFromDraft} disabled={!canCreate}>
          <Plus className="mr-1 h-3.5 w-3.5" />{t('sessionTags.create')}
        </Button>
      </div>

      <div className="max-h-64 space-y-1 overflow-y-auto">
        {visibleTags.length === 0 && (
          <p className="py-4 text-center text-xs text-muted-foreground">
            {allTags.length === 0 ? t('sessionTags.empty') : t('sessionTags.noMatch')}
          </p>
        )}
        {visibleTags.map((tag) => {
          const isSelected = selected.includes(tag);
          const color = workbench.tagColors.get(tag) ?? null;
          const isKnown = workbench.tagColors.has(tag);
          return (
            <div key={tag} className="rounded-md">
              <div className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent/50">
                <button
                  type="button"
                  onClick={() => toggle(tag)}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  aria-pressed={isSelected}
                >
                  <span className={cn(
                    'flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border',
                    isSelected ? 'border-primary bg-primary text-primary-foreground' : 'border-border',
                  )}>
                    {isSelected && <Check className="h-3 w-3" />}
                  </span>
                  <span className={cn('truncate rounded px-1.5 py-0.5 text-xs', tagChipClass(color))}>{tag}</span>
                </button>
                {isKnown && (
                  <>
                    <button
                      type="button"
                      title={t('sessionTags.colorTitle')}
                      onClick={() => setColoring(coloring === tag ? null : tag)}
                      className="rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      {t('common.color')}
                    </button>
                    <button
                      type="button"
                      title={t('sessionTags.deleteTitle')}
                      onClick={() => {
                        if (!window.confirm(t('sessionTags.deleteConfirm', { tag }))) return;
                        workbench.deleteTag(tag);
                        setSelected((current) => current.filter((item) => item !== tag));
                      }}
                      className="rounded p-1 text-muted-foreground hover:bg-red-500/10 hover:text-red-500"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </>
                )}
              </div>
              {coloring === tag && (
                <div className="flex flex-wrap gap-1.5 px-8 pb-2 pt-1">
                  <button
                    type="button"
                    title={t('sessionTags.noColor')}
                    onClick={() => { workbench.setTagColor(tag, null); setColoring(null); }}
                    className={cn('h-5 w-5 rounded border border-border bg-muted', !color && 'ring-2 ring-ring ring-offset-1 ring-offset-background')}
                  />
                  {WORKBENCH_COLOR_KEYS.map((key) => (
                    <button
                      key={key}
                      type="button"
                      title={t(WORKBENCH_PALETTE[key].label)}
                      onClick={() => { workbench.setTagColor(tag, key); setColoring(null); }}
                      className={cn('h-5 w-5 rounded', WORKBENCH_PALETTE[key].solid, color === key && 'ring-2 ring-ring ring-offset-1 ring-offset-background')}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between pt-1">
        <span className="text-xs text-muted-foreground">{t('sessionTags.selected', { count: selected.length, max: MAX_TAGS })}</span>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>{t('common.cancel')}</Button>
          <Button size="sm" onClick={save}>{t('common.save')}</Button>
        </div>
      </div>
    </div>
  );
}
