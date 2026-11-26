import { useEffect, useRef, useState } from 'react';
import { Check, Filter, X } from 'lucide-react';

import { cn } from '@/shared/utils';
import { useWorkbench, useWorkbenchHost } from '@/modules/workbench/context/WorkbenchContext';
import ProjectDot from '@/modules/workbench/ProjectBadge';
import { tagChipClass } from '@/modules/workbench/SessionTagChips';

/**
 * Used by the sidebar content (desktop) under the header: the filter button,
 * its popover (tags and projects, multi-select) and the active filter chips.
 */
export default function SidebarLabelFilter() {
  const workbench = useWorkbench();
  const host = useWorkbenchHost();
  // Whether the filter popover is open.
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') setIsOpen(false); };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen]);

  if (!workbench || !host || host.isMobile) return null;

  const { filter, setFilter, tagColors } = workbench;
  const tags = [...tagColors.keys()];
  const projects = host.projects;
  const activeCount = filter.tags.length + filter.projectIds.length;
  const projectName = (projectId: string) => projects.find((project) => project.projectId === projectId)?.displayName ?? projectId;

  const toggleTag = (tag: string) => setFilter({
    ...filter,
    tags: filter.tags.includes(tag) ? filter.tags.filter((item) => item !== tag) : [...filter.tags, tag],
  });
  const toggleProject = (projectId: string) => setFilter({
    ...filter,
    projectIds: filter.projectIds.includes(projectId)
      ? filter.projectIds.filter((item) => item !== projectId)
      : [...filter.projectIds, projectId],
  });

  return (
    <div ref={containerRef} className="relative hidden px-3 pb-1.5 md:block">
      <div className="flex min-w-0 items-center gap-1">
        <button
          type="button"
          aria-expanded={isOpen}
          onClick={() => setIsOpen((open) => !open)}
          className={cn(
            'flex h-6 flex-shrink-0 items-center gap-1 rounded-md px-1.5 text-[11px] transition-colors',
            activeCount > 0 ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
          )}
        >
          <Filter className="h-3 w-3" />
          {activeCount > 0 ? `筛选 ${activeCount}` : '筛选'}
        </button>

        <div className="scrollbar-hide flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          {filter.projectIds.map((projectId) => (
            <button
              key={projectId}
              type="button"
              onClick={() => toggleProject(projectId)}
              title={`移除筛选：${projectName(projectId)}`}
              className="flex h-5 flex-shrink-0 items-center gap-1 rounded bg-muted px-1 text-[10px] text-foreground hover:bg-muted/70"
            >
              <ProjectDot projectId={projectId} name={projectName(projectId)} size="xs" />
              <span className="max-w-20 truncate">{projectName(projectId)}</span>
              <X className="h-2.5 w-2.5 opacity-60" />
            </button>
          ))}
          {filter.tags.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => toggleTag(tag)}
              title={`移除筛选：${tag}`}
              className={cn('flex h-5 flex-shrink-0 items-center gap-1 rounded px-1.5 text-[10px]', tagChipClass(tagColors.get(tag)))}
            >
              <span className="max-w-20 truncate">{tag}</span>
              <X className="h-2.5 w-2.5 opacity-60" />
            </button>
          ))}
        </div>

        {activeCount > 0 && (
          <button
            type="button"
            onClick={() => setFilter({ tags: [], projectIds: [] })}
            className="flex-shrink-0 rounded px-1 text-[10px] text-muted-foreground hover:text-foreground"
          >
            清除
          </button>
        )}
      </div>

      {isOpen && (
        <div className="absolute left-3 right-3 top-full z-30 mt-1 max-h-[60vh] overflow-y-auto rounded-xl border border-border bg-popover p-2 shadow-xl">
          <p className="px-1.5 pb-1 text-[11px] font-medium text-muted-foreground">标签（任一匹配）</p>
          {tags.length === 0 ? (
            <p className="px-1.5 pb-2 text-xs text-muted-foreground">还没有标签。在会话的 ⋯ 菜单里选「标签…」添加。</p>
          ) : (
            <div className="flex flex-wrap gap-1 px-1 pb-2">
              {tags.map((tag) => {
                const isSelected = filter.tags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => toggleTag(tag)}
                    className={cn(
                      'flex items-center gap-1 rounded px-1.5 py-0.5 text-xs transition-shadow',
                      tagChipClass(tagColors.get(tag)),
                      isSelected ? 'ring-2 ring-primary/60' : 'opacity-80 hover:opacity-100',
                    )}
                  >
                    {isSelected && <Check className="h-3 w-3" />}
                    {tag}
                  </button>
                );
              })}
            </div>
          )}

          <p className="border-t border-border/60 px-1.5 pb-1 pt-2 text-[11px] font-medium text-muted-foreground">项目</p>
          <div className="space-y-px">
            {projects.map((project) => {
              const isSelected = filter.projectIds.includes(project.projectId);
              return (
                <button
                  key={project.projectId}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => toggleProject(project.projectId)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-xs',
                    isSelected ? 'bg-primary/10 text-foreground' : 'text-foreground hover:bg-accent/60',
                  )}
                >
                  <ProjectDot projectId={project.projectId} name={project.displayName} size="sm" />
                  <span className="min-w-0 flex-1 truncate">{project.displayName}</span>
                  {isSelected && <Check className="h-3.5 w-3.5 flex-shrink-0 text-primary" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
