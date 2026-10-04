import type { Route } from './types';

export function getRoute(): Route {
  return (window.location.hash.slice(1) || 'today') as Route;
}

export function go(route: Route): void {
  window.location.hash = route;
}
