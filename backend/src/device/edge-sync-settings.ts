export type EdgeSyncSettings = {
  punchTimeMode: 'school_local' | 'utc';
  preferUdp: boolean;
  connectionTimeoutSec: number;
  userSyncIntervalSec: number;
  batchSize: number;
  /** How often the edge agent re-fetches portal settings (seconds). */
  configRefreshIntervalSec: number;
};

export const DEFAULT_EDGE_SYNC_SETTINGS: EdgeSyncSettings = {
  punchTimeMode: 'school_local',
  preferUdp: false,
  connectionTimeoutSec: 30,
  userSyncIntervalSec: 600,
  batchSize: 25,
  configRefreshIntervalSec: 120,
};

export function readEdgeSyncFromMetadata(metadata: unknown): EdgeSyncSettings {
  const raw =
    metadata && typeof metadata === 'object' && !Array.isArray(metadata)
      ? (metadata as Record<string, unknown>).edgeSync
      : undefined;
  const edge =
    raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};

  const punchTimeMode = edge.punchTimeMode === 'utc' ? 'utc' : 'school_local';
  const preferUdp = edge.preferUdp === true;
  const connectionTimeoutSec =
    typeof edge.connectionTimeoutSec === 'number' && edge.connectionTimeoutSec > 0
      ? Math.floor(edge.connectionTimeoutSec)
      : DEFAULT_EDGE_SYNC_SETTINGS.connectionTimeoutSec;
  const userSyncIntervalSec =
    typeof edge.userSyncIntervalSec === 'number' && edge.userSyncIntervalSec > 0
      ? Math.floor(edge.userSyncIntervalSec)
      : DEFAULT_EDGE_SYNC_SETTINGS.userSyncIntervalSec;
  const batchSize =
    typeof edge.batchSize === 'number' && edge.batchSize > 0
      ? Math.floor(edge.batchSize)
      : DEFAULT_EDGE_SYNC_SETTINGS.batchSize;
  const configRefreshIntervalSec =
    typeof edge.configRefreshIntervalSec === 'number' && edge.configRefreshIntervalSec >= 30
      ? Math.floor(edge.configRefreshIntervalSec)
      : DEFAULT_EDGE_SYNC_SETTINGS.configRefreshIntervalSec;

  return {
    punchTimeMode,
    preferUdp,
    connectionTimeoutSec,
    userSyncIntervalSec,
    batchSize,
    configRefreshIntervalSec,
  };
}

export function mergeEdgeSyncIntoMetadata(
  metadata: unknown,
  edgeSync: EdgeSyncSettings,
): Record<string, unknown> {
  const base =
    metadata && typeof metadata === 'object' && !Array.isArray(metadata)
      ? { ...(metadata as Record<string, unknown>) }
      : {};
  return { ...base, edgeSync };
}
