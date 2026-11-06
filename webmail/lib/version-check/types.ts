// Update-status payload returned by an update server. The shape is fixed by
// the schema version below, not by any particular implementation.

export type UpdateSeverity = 'normal' | 'security' | 'deprecated' | 'none' | 'unknown';

export interface UpdateStatus {
  schema: 1;
  current: string;
  latest: string | null;
  updateAvailable: boolean;
  severity: UpdateSeverity;
  url: string | null;
  advisory: string | null;
  checkedAt: string;
}

export interface VersionCheckStateFile {
  endpoint: string;
  lastCheckedAt: string | null;
  lastSuccessAt: string | null;
  nextScheduledAt: string | null;
  status: UpdateStatus | null;
  /**
   * With a shared store only: the last status per running version, so
   * replicas on two versions during a rolling update each keep their own.
   */
  statuses?: Record<string, UpdateStatus>;
}

// No update server is assumed. The check stays silent until an operator
// configures one (BULWARK_UPDATE_CHECK_URL or the admin's version page), so a
// stock install makes no outbound request.
export const DEFAULT_VERSION_ENDPOINT = '';
