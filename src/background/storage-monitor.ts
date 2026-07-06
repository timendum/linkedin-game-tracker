/**
 * Storage Monitor Module
 *
 * Monitors storage quota usage and alerts the user when nearing limits.
 * Returns a warning when usage exceeds 80% of the available quota,
 * suggesting the user export their data.
 */

import { browserAPI } from "../lib/browser.ts";

/** Threshold percentage above which a storage warning is triggered */
const STORAGE_WARNING_THRESHOLD = 80;

export interface StorageUsageResult {
  warning: boolean;
  percentage: number;
}

export class StorageMonitor {
  /**
   * Checks current storage usage against the quota threshold.
   * Returns `{ warning: true, percentage }` if and only if usage exceeds 80%.
   */
  async checkUsage(): Promise<StorageUsageResult> {
    const used = await browserAPI.storage.getBytesInUse();
    const total = browserAPI.storage.QUOTA_BYTES;
    const percentage = total > 0 ? Math.round((used / total) * 10000) / 100 : 0;

    return {
      warning: percentage > STORAGE_WARNING_THRESHOLD,
      percentage,
    };
  }

  /**
   * Hook called after each storage write operation.
   * Checks usage and triggers a notification if the threshold is exceeded.
   */
  async onStorageWrite(): Promise<void> {
    const { warning, percentage } = await this.checkUsage();

    if (warning) {
      await browserAPI.notifications.create("storage-warning", {
        type: "basic",
        title: "Storage Nearly Full",
        message: `Storage is ${percentage}% full. Consider exporting your data to free up space.`,
        iconUrl: "icons/icon48.png",
      });
    }
  }
}
