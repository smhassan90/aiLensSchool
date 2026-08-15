import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class PaginationDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}

export interface PaginatedResult<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export function pageQuery<T>(find: Promise<T[]>, count: Promise<number>): Promise<[T[], number]>;
export function pageQuery<T>(
  find: (skip: number, take: number) => Promise<T[]>,
  count: () => Promise<number>,
  page: number,
  limit: number,
): Promise<[T[], number]>;
export async function pageQuery<T>(
  find: Promise<T[]> | ((skip: number, take: number) => Promise<T[]>),
  count: Promise<number> | (() => Promise<number>),
  page = 1,
  limit = 20,
): Promise<[T[], number]> {
  if (typeof find === 'function') {
    const skip = (page - 1) * limit;
    const items = await find(skip, limit);
    if (items.length < limit) {
      return [items, skip + items.length];
    }
    const total = typeof count === 'function' ? await count() : await count;
    return [items, total];
  }
  return Promise.all([find, count as Promise<number>]);
}

export function paginate<T>(
  items: T[],
  total: number,
  page: number,
  limit: number,
): PaginatedResult<T> {
  return {
    items,
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}
