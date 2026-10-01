import type { Paginated } from "@/lib/types";

const PAGE_SIZE = 100;
const MAX_PAGES = 20;

/** Fetches paginated API results until all items are loaded (API max limit is 100 per page). */
export async function fetchAllPages<T>(
  fetchPage: (page: number, limit: number) => Promise<Paginated<T>>,
): Promise<T[]> {
  const items: T[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const res = await fetchPage(page, PAGE_SIZE);
    items.push(...res.items);
    if (res.items.length < PAGE_SIZE || items.length >= res.total) break;
  }
  return items;
}
