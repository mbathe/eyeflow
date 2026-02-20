/**
 * FileSystem Trigger Driver  — example driver (spec §7)
 *
 * Uses chokidar to watch a path and emit a TriggerEvent on file events.
 *
 * Supported tiers : CENTRAL, LINUX
 * Required protocol: (none — local kernel capability)
 *
 * Config shape:
 * {
 *   watchPath : string          — absolute path or glob, e.g. "/data/upload"
 *   events?   : string[]        — ['add','change','unlink','addDir','unlinkDir'] — default ['add','change']
 *   glob?     : string          — additional glob filter, e.g. "**\/*.csv"
 *   ignored?  : string | string[]
 *   depth?    : number
 *   compiledFilter? : string    — optional JS expression
 * }
 */

import { Injectable, Logger } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import * as chokidar from 'chokidar';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import {
  ITriggerDriver,
  TriggerEvent,
} from '../interfaces/trigger-driver.interface';
import { NodeTier } from '../../nodes/interfaces/node-capability.interface';

// ── Config ────────────────────────────────────────────────────────────────

interface FsDriverConfig {
  watchPath:      string;
  events?:        string[];
  glob?:          string;
  ignored?:       string | string[];
  depth?:         number;
  compiledFilter?: string;
}

const FS_EVENTS_DEFAULT = ['add', 'change'] as const;

// ── Driver ────────────────────────────────────────────────────────────────

@Injectable()
export class FileSystemTriggerDriver implements ITriggerDriver {
  readonly driverId    = 'filesystem';
  readonly displayName = 'FileSystem Watcher Trigger';
  readonly supportedTiers: NodeTier[] = [NodeTier.CENTRAL, NodeTier.LINUX];
  readonly configSchema = {
    watchPath:  { type: 'string',   required: true,  example: '/data/incoming' },
    events:     { type: 'array',    required: false, items: { type: 'string' }, default: ['add','change'] },
    glob:       { type: 'string',   required: false, example: '**/*.csv' },
    ignored:    { type: 'string',   required: false },
    depth:      { type: 'number',   required: false },
  };
  readonly requiredProtocols: string[] = [];

  private readonly logger = new Logger(FileSystemTriggerDriver.name);
  private readonly activations = new Map<string, { watcher: chokidar.FSWatcher; stop$: Subject<void> }>();

  activate(
    activationId: string,
    config: Record<string, any>,
    workflowId: string,
    version: number,
  ): Observable<TriggerEvent> {
    const cfg = config as FsDriverConfig;
    const watchEvents = cfg.events ?? [...FS_EVENTS_DEFAULT];
    const stop$ = new Subject<void>();

    const stream$ = new Observable<TriggerEvent>(observer => {
      const watchTarget = cfg.glob
        ? path.join(cfg.watchPath, cfg.glob)
        : cfg.watchPath;

      const watcher = chokidar.watch(watchTarget, {
        ignored:    cfg.ignored,
        persistent: true,
        depth:      cfg.depth,
        ignoreInitial: true,
        awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 },
      });

      const handler = (fsEvent: string) => (filePath: string, stats?: any) => {
        const payload = {
          event:    fsEvent,
          filePath,
          fileName: path.basename(filePath),
          dir:      path.dirname(filePath),
          size:     stats?.size,
          mtime:    stats?.mtimeMs,
        };

        if (cfg.compiledFilter) {
          try {
            const passes = new Function('filePath', 'fileName', 'event', 'stats',
              `return (${cfg.compiledFilter})`
            )(filePath, payload.fileName, fsEvent, stats);
            if (!passes) return;
          } catch (e: any) {
            this.logger.warn(`[FS:${activationId.slice(0, 8)}] Filter error: ${e?.message}`);
          }
        }

        const event: TriggerEvent = {
          eventId:         uuidv4(),
          occurredAt:      new Date().toISOString(),
          driverId:        this.driverId,
          workflowId,
          workflowVersion: version,
          payload,
          source:          { watchPath: cfg.watchPath, fsEvent },
        };
        observer.next(event);
      };

      for (const fsEvent of watchEvents) {
        watcher.on(fsEvent as any, handler(fsEvent));
      }

      watcher.on('error', (err: unknown) => {
        this.logger.error(`[FS:${activationId.slice(0, 8)}] Watcher error: ${(err as Error)?.message ?? err}`);
        observer.error(err);
      });

      watcher.on('ready', () => {
        this.logger.log(`[FS:${activationId.slice(0, 8)}] Watching: ${watchTarget}`);
      });

      this.activations.set(activationId, { watcher, stop$ });

      return () => {
        watcher.close().catch(() => {});
        this.activations.delete(activationId);
      };
    });

    return stream$.pipe(takeUntil(stop$));
  }

  deactivate(activationId: string): void {
    const entry = this.activations.get(activationId);
    if (!entry) return;
    entry.stop$.next();
    entry.stop$.complete();
    entry.watcher.close().catch(() => {});
    this.activations.delete(activationId);
    this.logger.log(`[FS] Deactivated: ${activationId}`);
  }

  deactivateAll(): void {
    for (const id of this.activations.keys()) this.deactivate(id);
  }

  isHealthy(): boolean {
    return true;
  }
}
