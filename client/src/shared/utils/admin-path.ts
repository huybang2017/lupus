import { useLocation } from "react-router-dom";

// The generic list/detail pages render in two contexts:
//   main area:     /r/:slug, /r/:slug/:id
//   settings area: /settings/:slug, /settings/:slug/:id
// This helper keeps every link inside the current context.
export function useAdminBase(): string {
  const { pathname } = useLocation();
  return pathname.startsWith("/settings") ? "/settings" : "";
}

export function listUrl(base: string, slug: string): string {
  return base === "/settings" ? `/settings/${slug}` : `/r/${slug}`;
}

export function detailUrl(base: string, slug: string, id: string): string {
  return base === "/settings" ? `/settings/${slug}/${id}` : `/r/${slug}/${id}`;
}
