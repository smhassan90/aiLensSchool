import { TransformFnParams } from 'class-transformer';

/** Treat blank strings as missing for optional DTO fields (class-validator @IsOptional). */
export function emptyStringToUndefined({ value }: TransformFnParams) {
  if (value === '' || value === null) return undefined;
  return value;
}
