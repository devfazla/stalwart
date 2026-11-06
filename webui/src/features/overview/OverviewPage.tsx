/*
 * SPDX-FileCopyrightText: 2026 devfazla <frchowdhury480@gmail.com>
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Activity, AlertTriangle, Globe, Plug, RefreshCw, Server, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LoadingFallback } from '@/components/common/LoadingFallback';
import { formatCompactNumber, formatSize } from '@/lib/format';
import { GAUGES, sumOf } from './metrics';
import { REFRESH_EVERY_SECONDS, useOverviewMetrics } from './useOverviewMetrics';
import { TrafficChart } from './TrafficChart';
import { ActivityCard, TrustCard } from './ActivityCard';

const ICONS = { accounts: Users, domains: Globe, connections: Plug, memory: Server } as const;
const OFF = 'off';

function StatCard({ gaugeKey, value }: { gaugeKey: string; value: number | null }) {
  const { t } = useTranslation();
  const Icon = ICONS[gaugeKey as keyof typeof ICONS] ?? Activity;
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-highlight">
          <Icon aria-hidden="true" className="h-4 w-4 text-highlight-foreground" />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-xs text-muted-foreground">
            {t(`overview.gauge.${gaugeKey}`, gaugeKey)}
          </span>
          <span className="block text-xl font-semibold tabular-nums">
            {value === null
              ? '\u2013'
              : gaugeKey === 'memory'
                ? formatSize(value, { compact: true })
                : formatCompactNumber(value)}
          </span>
        </span>
      </CardContent>
    </Card>
  );
}

function SetupNote({ problem }: { problem: 'disabled' | 'protected' | 'unreachable' }) {
  const { t } = useTranslation();
  const copy = {
    disabled: {
      title: t('overview.metricsDisabledTitle', 'Metrics endpoint is off'),
      body: t(
        'overview.metricsDisabledBody',
        'Open Settings, then Metrics, and set the Prometheus endpoint to Enabled. This page reads the same text export that an external Prometheus scraper would.',
      ),
    },
    protected: {
      title: t('overview.metricsProtectedTitle', 'Metrics endpoint needs credentials'),
      body: t(
        'overview.metricsProtectedBody',
        'The endpoint is protected with HTTP Basic auth, which a browser session cannot reuse. Clear the username and secret to let the console read it, or point an external Prometheus at it and keep this page off.',
      ),
    },
    unreachable: {
      title: t('overview.metricsUnreachableTitle', 'Metrics endpoint did not answer'),
      body: t(
        'overview.metricsUnreachableBody',
        'The console could not reach the metrics endpoint on this server. Check that this browser can still reach the API, then refresh.',
      ),
    },
  }[problem];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle aria-hidden="true" className="h-4 w-4 text-warning" />
          {copy.title}
        </CardTitle>
        <CardDescription>{copy.body}</CardDescription>
      </CardHeader>
    </Card>
  );
}

export function OverviewPage() {
  const { t } = useTranslation();
  const [refresh, setRefresh] = useState<number | null>(30);
  const metrics = useOverviewMetrics(refresh);

  return (
    <div className="space-y-3.5 pt-6">
      <div className="flex flex-wrap items-end gap-3 px-1 pb-1 pt-3">
        <div className="min-w-0 space-y-1">
          <h1 className="page-title">{t('overview.title', 'Overview')}</h1>
          <p className="text-sm text-muted-foreground">
            {t('overview.subtitle', 'What the server has been doing, straight from its own metrics export.')}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {metrics.updatedAt && (
            <span className="text-xs text-muted-foreground">
              {t('overview.updated', 'Updated {{time}}', { time: new Date(metrics.updatedAt).toLocaleTimeString() })}
            </span>
          )}
          <Select
            value={refresh === null ? OFF : String(refresh)}
            onValueChange={(v) => setRefresh(v === OFF ? null : Number(v))}
          >
            <SelectTrigger variant="pill" className="w-[110px]" aria-label={t('overview.refreshLabel', 'Refresh')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {REFRESH_EVERY_SECONDS.map((seconds) => (
                <SelectItem key={seconds} value={String(seconds)}>
                  {t('overview.everySeconds', 'Every {{seconds}}s', { seconds })}
                </SelectItem>
              ))}
              <SelectItem value={OFF}>{t('overview.refreshOff', 'Manual')}</SelectItem>
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label={t('overview.refreshNow', 'Refresh now')}
            disabled={metrics.isFetching}
            onClick={() => void metrics.refetch()}
          >
            <RefreshCw className={metrics.isFetching ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
          </Button>
        </div>
      </div>

      {metrics.isLoading ? (
        <LoadingFallback />
      ) : metrics.problem ? (
        <SetupNote problem={metrics.problem} />
      ) : (
        metrics.values && (
          <>
            <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
              {GAUGES.map((gauge) => (
                <StatCard key={gauge.key} gaugeKey={gauge.key} value={sumOf(metrics.values, gauge.names)} />
              ))}
            </div>
            <TrafficChart points={metrics.points} />
            <div className="grid gap-3.5 lg:grid-cols-2">
              <ActivityCard values={metrics.values} />
              <TrustCard values={metrics.values} />
            </div>
            {!metrics.hasHistory && (
              <p className="px-1 text-xs text-muted-foreground">
                {t(
                  'overview.idleHint',
                  'Servers only export a metric once it has a value, so an idle install shows mostly dashes. That is expected.',
                )}
              </p>
            )}
          </>
        )
      )}
    </div>
  );
}
