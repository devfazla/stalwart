/*
 * SPDX-FileCopyrightText: 2020 Stalwart Labs LLC <hello@stalw.art>
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-SEL
 */

import { lazy, Suspense, type ComponentType, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useSchemaStore } from '@/stores/schemaStore';
import { usePermissionCheckers } from '@/hooks/usePermissions';
import { resolveObject } from '@/lib/schemaResolver';
import type { PermissionCheckers } from '@/lib/permissions';
import { ErrorBoundary } from '@/components/layout/ErrorBoundary';
import { DynamicList } from '@/components/lists/DynamicList';
import { DynamicForm } from '@/components/forms/DynamicForm';
import { DynamicViewPage } from '@/components/views/DynamicViewPage';
import { LoadingFallback } from '@/components/common/LoadingFallback';
import type { Schema } from '@/types/schema';

function lazyFeature<M, P>(load: () => Promise<M>, select: (module: M) => ComponentType<P>) {
  return lazy(() => load().then((module) => ({ default: select(module) })));
}

const DeliveryTracePage = lazyFeature(
  () => import('@/features/troubleshoot/DeliveryTracePage'),
  (m) => m.DeliveryTracePage,
);
const OverviewPage = lazyFeature(
  () => import('@/features/overview/OverviewPage'),
  (m) => m.OverviewPage,
);
const ActionPage = lazyFeature(
  () => import('@/features/actions/ActionPage'),
  (m) => m.ActionPage,
);

interface MainContentProps {
  viewName?: string;
  id?: string;
}

export function MainContent({ viewName, id }: MainContentProps) {
  const schema = useSchemaStore((s) => s.schema);
  const permissions = usePermissionCheckers();
  const location = useLocation();
  const { t } = useTranslation();
  return (
    <ErrorBoundary resetKey={location.pathname}>
      <Suspense fallback={<LoadingFallback />}>{renderView(t, schema, permissions, viewName, id)}</Suspense>
    </ErrorBoundary>
  );
}

function renderView(
  t: TFunction,
  schema: Schema | null,
  permissions: PermissionCheckers,
  viewName?: string,
  id?: string,
): ReactNode {
  if (!viewName) {
    return <LoadingFallback />;
  }

  if (viewName.startsWith('CustomComponent/')) {
    const componentName = viewName.slice('CustomComponent/'.length);
    if (componentName === 'Overview') {
      return <OverviewPage />;
    }
    if (componentName === 'LiveDelivery') {
      return <DeliveryTracePage />;
    }
    return (
      <div className="mt-3 rounded-2xl bg-muted p-10 text-center text-muted-foreground">
        {t('errors.unknownComponent', 'Unknown component: {{name}}', { name: componentName })}
      </div>
    );
  }

  if (!schema) {
    return <LoadingFallback />;
  }

  const resolved = resolveObject(schema, viewName);
  if (!resolved) {
    return (
      <div role="alert" className="mt-3 rounded-xl bg-destructive-soft p-4 text-center text-sm text-destructive">
        {t('errors.unknownView', 'Unknown view: {{name}}', { name: viewName })}
      </div>
    );
  }

  if (resolved.objectName === 'x:Action') {
    return <ActionPage key={viewName} viewName={viewName} />;
  }

  if (resolved.objectType.type === 'singleton') {
    return <DynamicForm key={`${viewName}/singleton`} viewName={viewName} objectId="singleton" />;
  }

  if (id === 'new') {
    return <DynamicForm key={`${viewName}/new`} viewName={viewName} objectId={null} />;
  }

  if (id) {
    if (!permissions.hasObjectPermission(resolved.permissionPrefix, 'Update')) {
      return <DynamicViewPage key={`${viewName}/${id}`} viewName={viewName} objectId={id} />;
    }
    return <DynamicForm key={`${viewName}/${id}`} viewName={viewName} objectId={id} />;
  }

  return <DynamicList key={viewName} viewName={viewName} />;
}
