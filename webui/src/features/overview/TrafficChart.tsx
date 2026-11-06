/*
 * SPDX-FileCopyrightText: 2026 devfazla <frchowdhury480@gmail.com>
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltipContent, RechartsTooltip, getChartColor } from '@/components/ui/chart';
import { formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';
import { RATE_SERIES } from './metrics';
import type { RatePoint } from './useOverviewMetrics';

interface TrafficChartProps {
  points: RatePoint[];
}

export function TrafficChart({ points }: TrafficChartProps) {
  const { t } = useTranslation();
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());

  const data = useMemo(() => points.map((point) => ({ label: point.label, ...point.values })), [points]);
  const visible = RATE_SERIES.filter((series) => !hidden.has(series.key));

  const toggle = (key: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('overview.trafficTitle', 'Mail flow')}</CardTitle>
        <CardDescription>
          {t('overview.trafficDescription', 'Events per minute, measured between refreshes of the metrics endpoint.')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {RATE_SERIES.map((series) => (
            <button
              key={series.key}
              type="button"
              aria-pressed={!hidden.has(series.key)}
              onClick={() => toggle(series.key)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border border-input px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
                hidden.has(series.key) && 'opacity-45',
              )}
            >
              <span
                aria-hidden="true"
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: getChartColor(series.color) }}
              />
              {t(`overview.series.${series.key}`, series.key)}
            </button>
          ))}
        </div>

        {data.length < 2 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {t('overview.trafficWaiting', 'Collecting a second sample to plot rates.')}
          </p>
        ) : (
          <ChartContainer className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={24} />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value: number) => formatNumber(value)}
                />
                <RechartsTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value) => `${formatNumber(value, { maximumFractionDigits: 2 })}/min`}
                    />
                  }
                />
                {visible.map((series) => (
                  <Area
                    key={series.key}
                    type="monotone"
                    dataKey={series.key}
                    name={t(`overview.series.${series.key}`, series.key)}
                    stroke={getChartColor(series.color)}
                    fill={getChartColor(series.color)}
                    fillOpacity={0.12}
                    strokeWidth={1.75}
                    connectNulls
                    isAnimationActive={false}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
