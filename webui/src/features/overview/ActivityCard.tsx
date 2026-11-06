/*
 * SPDX-FileCopyrightText: 2026 devfazla <frchowdhury480@gmail.com>
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  averageOf,
  COUNTER_GROUPS,
  LATENCY_METRICS,
  SECURITY_RATIOS,
  sumOf,
  valueOf,
  type MetricValues,
} from './metrics';

const DASH = '\u2013';

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-3 py-1.5">
      <span className="truncate text-sm text-muted-foreground">{label}</span>
      <span className="ml-auto shrink-0 font-mono text-sm tabular-nums">{value}</span>
    </div>
  );
}

export function ActivityCard({ values }: { values: MetricValues }) {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('overview.activityTitle', 'Since the server started')}</CardTitle>
        <CardDescription>
          {t('overview.activityDescription', 'Cumulative counters since the server process started.')}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-x-6 sm:grid-cols-2">
        {COUNTER_GROUPS.map((group) => (
          <div key={group.key} className="py-1.5">
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t(`overview.group.${group.key}`, group.key)}
            </h3>
            {group.rows.map((row) => (
              <Row
                key={row.key}
                label={t(`overview.counter.${row.key}`, row.key)}
                value={formatCount(sumOf(values, row.names), t)}
              />
            ))}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function formatCount(value: number | null, t: ReturnType<typeof useTranslation>['t']): string {
  if (value === null) return DASH;
  return t('overview.count', '{{value}}', { value: value.toLocaleString() });
}

export function TrustCard({ values }: { values: MetricValues }) {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('overview.trustTitle', 'Authentication and latency')}</CardTitle>
        <CardDescription>
          {t('overview.trustDescription', 'Sender authentication outcomes and average protocol request times.')}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-x-6 sm:grid-cols-2">
        <div className="py-1.5">
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t('overview.security', 'Inbound sender checks')}
          </h3>
          {SECURITY_RATIOS.map((ratio) => {
            const pass = valueOf(values, ratio.pass) ?? 0;
            const fail = valueOf(values, ratio.fail) ?? 0;
            const total = pass + fail;
            return (
              <Row
                key={ratio.key}
                label={t(`overview.ratio.${ratio.key}`, ratio.key)}
                value={
                  total === 0
                    ? DASH
                    : `${((pass / total) * 100).toFixed(1)}% (${pass.toLocaleString()}/${total.toLocaleString()})`
                }
              />
            );
          })}
        </div>
        <div className="py-1.5">
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t('overview.latency', 'Average request time')}
          </h3>
          {LATENCY_METRICS.map((metric) => {
            const seconds = averageOf(values, metric.names[0], metric.names[1]);
            return (
              <Row
                key={metric.key}
                label={t(`overview.protocol.${metric.key}`, metric.key)}
                value={seconds === null ? DASH : `${(seconds * 1000).toFixed(1)} ms`}
              />
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
