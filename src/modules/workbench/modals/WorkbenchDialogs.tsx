import { useTranslation } from 'react-i18next';

import { Dialog, DialogContent, DialogTitle } from '@/shared/ui';
import type { Project } from '@/shared/types';
import ProjectIdentityDialog from '@/modules/workbench/modals/ProjectIdentityDialog';
import SessionTagsDialog from '@/modules/workbench/modals/SessionTagsDialog';
import WorkbenchSettingsDialog from '@/modules/workbench/modals/WorkbenchSettingsDialog';

/** Which workbench dialog is open, with what it edits; null when none is. */
export type WorkbenchDialogState =
  | null
  | { kind: 'project-identity'; projectId: string; projectName: string }
  | { kind: 'session-tags'; sessionId: string; sessionName: string }
  | { kind: 'settings'; section?: string };

/** Translation keys (workbench namespace) of the dialog titles. */
const TITLES = {
  'project-identity': 'projectIdentity.title',
  'session-tags': 'sessionTags.title',
  settings: 'settings.title',
} as const;

/** Rendered once by WorkbenchProvider; hosts whichever workbench dialog is open. */
export default function WorkbenchDialogs({ dialog, onClose, projects }: {
  dialog: WorkbenchDialogState;
  onClose: () => void;
  projects: Project[];
}) {
  const { t } = useTranslation('workbench');
  if (!dialog) return null;

  // A rename since the dialog was opened should show the current name.
  const projectName = dialog.kind === 'project-identity'
    ? projects.find((project) => project.projectId === dialog.projectId)?.displayName ?? dialog.projectName
    : '';

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className={dialog.kind === 'settings' ? 'max-w-lg p-0' : 'max-w-sm p-0'}>
        <DialogTitle>{t(TITLES[dialog.kind])}</DialogTitle>
        {/* Keyed so reopening for another project or session starts from fresh state. */}
        {dialog.kind === 'project-identity' && (
          <ProjectIdentityDialog key={dialog.projectId} projectId={dialog.projectId} projectName={projectName} onClose={onClose} />
        )}
        {dialog.kind === 'session-tags' && (
          <SessionTagsDialog key={dialog.sessionId} sessionId={dialog.sessionId} sessionName={dialog.sessionName} onClose={onClose} />
        )}
        {dialog.kind === 'settings' && <WorkbenchSettingsDialog onClose={onClose} section={dialog.section} />}
      </DialogContent>
    </Dialog>
  );
}
