import { useEffect, useState } from "react";

export const DEFAULT_PAGE_SIZE = 20;

export function useTablePaging<T>(
  rows: T[],
  options?: { limit?: number; resetKey?: string | number },
) {
  const [pageState, setPageState] = useState(1);
  const candidate = options?.limit ?? DEFAULT_PAGE_SIZE;
  const limit = Number.isFinite(candidate)
    ? Math.max(1, Math.floor(candidate))
    : DEFAULT_PAGE_SIZE;
  const resetKey = options?.resetKey;

  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(rows.length / limit));

  useEffect(() => {
    setPageState(1);
  }, [resetKey]);

  useEffect(() => {
    if (pageState > totalPages) setPageState(1);
  }, [totalPages, pageState]);

  const setPage = (next: number) => {
    const target = Number.isFinite(next) ? Math.floor(next) : 1;
    setPageState(Math.min(Math.max(1, target), totalPages));
  };

  const safePage = Math.min(pageState, totalPages);
  const pageRows = rows.slice((safePage - 1) * limit, safePage * limit);

  return {
    page: safePage,
    setPage,
    limit,
    totalPages,
    pageRows,
    total,
  };
}
