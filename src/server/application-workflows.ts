export type ApplicationWorkflow = 'reasignacion' | 'reenganche';

export function resolveWorkflowChanges(
  workflow: ApplicationWorkflow,
  { enabled = true, projectChanged = false }: { enabled?: boolean; projectChanged?: boolean } = {}
) {
  return {
    isReassigned: enabled,
    status: enabled ? workflow : undefined,
    restartTechnicalStage: enabled && workflow === 'reenganche' && projectChanged,
  };
}
