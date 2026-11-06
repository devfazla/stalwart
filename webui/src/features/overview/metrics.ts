/*
 * SPDX-FileCopyrightText: 2026 devfazla <frchowdhury480@gmail.com>
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export type MetricValues = Record<string, number>;

export type MetricKind = 'gauge' | 'counter' | 'histogram';

export interface MetricSample {
  at: number;
  values: MetricValues;
}

export function parsePrometheusText(text: string): MetricValues {
  const values: MetricValues = {};
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith('#')) continue;
    const parts = trimmed.split(/\s+/);
    if (parts.length < 2) continue;
    const value = Number.parseFloat(parts[1]);
    if (Number.isFinite(value)) {
      values[parts[0]] = value;
    }
  }
  return values;
}

export function valueOf(values: MetricValues | null, name: string): number | null {
  if (!values) return null;
  const value = values[name];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function sumOf(values: MetricValues | null, names: readonly string[]): number | null {
  if (!values) return null;
  let total: number | null = null;
  for (const name of names) {
    const value = valueOf(values, name);
    if (value !== null) total = (total ?? 0) + value;
  }
  return total;
}

export function averageOf(values: MetricValues | null, sumName: string, countName: string): number | null {
  const sum = valueOf(values, sumName);
  const count = valueOf(values, countName);
  if (sum === null || count === null || count === 0) return null;
  return sum / count;
}

/**
 * Rate of a monotonically increasing counter between two scrapes, expressed per minute.
 * A name that the server never emitted counts as zero; a name that went backwards means the
 * server restarted, and the interval is dropped rather than reported as a huge negative spike.
 */
export function perMinute(current: MetricSample, previous: MetricSample, name: string): number | null {
  const now = valueOf(current.values, name) ?? 0;
  const before = valueOf(previous.values, name) ?? 0;
  if (now < before) return null;
  const elapsed = (current.at - previous.at) / 1000;
  if (elapsed <= 0) return null;
  return (now - before) * (60 / elapsed);
}

export function seriesRate(current: MetricSample, previous: MetricSample, names: readonly string[]): number | null {
  let total: number | null = null;
  for (const name of names) {
    const rate = perMinute(current, previous, name);
    if (rate !== null) total = (total ?? 0) + rate;
  }
  return total;
}

export interface GaugeCard {
  key: string;
  names: readonly string[];
  kind: MetricKind;
  format: 'count' | 'bytes' | 'duration';
}

export interface RateSeries {
  key: string;
  names: readonly string[];
  color: number;
}

export interface CounterRow {
  key: string;
  names: readonly string[];
}

export interface RatioRow {
  key: string;
  pass: string;
  fail: string;
}

// The community exporter only emits a metric once it has a non-zero value, so every lookup
// below has to tolerate a missing name rather than treating it as an error.
export const GAUGES: GaugeCard[] = [
  { key: 'accounts', names: ['stalwart_users'], kind: 'gauge', format: 'count' },
  { key: 'domains', names: ['stalwart_domains'], kind: 'gauge', format: 'count' },
  {
    key: 'connections',
    names: [
      'stalwart_smtp_active_connections',
      'stalwart_imap_active_connections',
      'stalwart_pop3_active_connections',
      'stalwart_http_active_connections',
      'stalwart_sieve_active_connections',
    ],
    kind: 'gauge',
    format: 'count',
  },
  { key: 'memory', names: ['stalwart_server_memory_bytes'], kind: 'gauge', format: 'bytes' },
];

export const RATE_SERIES: RateSeries[] = [
  { key: 'received', names: ['stalwart_message_ingest_ham_total'], color: 0 },
  { key: 'spam', names: ['stalwart_message_ingest_spam_total'], color: 1 },
  { key: 'queued', names: ['stalwart_queue_message_queued_total'], color: 2 },
  { key: 'delivered', names: ['stalwart_delivery_delivered_total'], color: 3 },
  { key: 'authFailed', names: ['stalwart_auth_failed_total'], color: 4 },
];

export const COUNTER_GROUPS: { key: string; rows: CounterRow[] }[] = [
  {
    key: 'ingest',
    rows: [
      { key: 'ham', names: ['stalwart_message_ingest_ham_total'] },
      { key: 'spam', names: ['stalwart_message_ingest_spam_total'] },
      { key: 'duplicate', names: ['stalwart_message_ingest_duplicate_total'] },
      { key: 'error', names: ['stalwart_message_ingest_error_total'] },
    ],
  },
  {
    key: 'outbound',
    rows: [
      { key: 'queued', names: ['stalwart_queue_message_queued_total'] },
      { key: 'attempted', names: ['stalwart_delivery_attempt_start_total'] },
      { key: 'delivered', names: ['stalwart_delivery_delivered_total'] },
      { key: 'completed', names: ['stalwart_delivery_completed_total'] },
      { key: 'rescheduled', names: ['stalwart_queue_rescheduled_total'] },
    ],
  },
  {
    key: 'access',
    rows: [
      { key: 'authSuccess', names: ['stalwart_auth_success_total'] },
      { key: 'authFailed', names: ['stalwart_auth_failed_total'] },
      { key: 'authLocked', names: ['stalwart_auth_too_many_attempts_total'] },
      { key: 'jmapCalls', names: ['stalwart_jmap_method_call_total'] },
    ],
  },
  {
    key: 'protocols',
    rows: [
      { key: 'smtp', names: ['stalwart_smtp_connection_start_total'] },
      { key: 'imap', names: ['stalwart_imap_connection_start_total'] },
      { key: 'pop3', names: ['stalwart_pop3_connection_start_total'] },
      { key: 'http', names: ['stalwart_http_connection_start_total'] },
    ],
  },
];

export const SECURITY_RATIOS: RatioRow[] = [
  { key: 'dkim', pass: 'stalwart_smtp_dkim_pass_total', fail: 'stalwart_smtp_dkim_fail_total' },
  { key: 'spf', pass: 'stalwart_smtp_spf_from_pass_total', fail: 'stalwart_smtp_spf_from_fail_total' },
  { key: 'dmarc', pass: 'stalwart_smtp_dmarc_pass_total', fail: 'stalwart_smtp_dmarc_fail_total' },
];

export const LATENCY_METRICS: CounterRow[] = [
  { key: 'smtp', names: ['stalwart_smtp_request_time_seconds_sum', 'stalwart_smtp_request_time_seconds_count'] },
  { key: 'imap', names: ['stalwart_imap_request_time_seconds_sum', 'stalwart_imap_request_time_seconds_count'] },
  { key: 'pop3', names: ['stalwart_pop3_request_time_seconds_sum', 'stalwart_pop3_request_time_seconds_count'] },
  { key: 'http', names: ['stalwart_http_request_time_seconds_sum', 'stalwart_http_request_time_seconds_count'] },
];

export const METRICS_ENDPOINT = '/api/metrics/prometheus';
