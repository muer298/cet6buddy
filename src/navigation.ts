import type { Route } from './types';

export function getRoute(): Route {
  return (window.location.hash.slice(1).split('?')[0] || 'today') as Route;
}

export function go(route: Route, params?: Record<string, string>): void {
  window.location.hash = route + (params ? `?${new URLSearchParams(params)}` : '');
}

export function routeParams() { return new URLSearchParams(window.location.hash.split('?')[1] ?? ''); }
