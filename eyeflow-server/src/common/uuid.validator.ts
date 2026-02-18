import { BadRequestException } from '@nestjs/common';

/**
 * Validates if a string is a valid UUID v4
 */
export function isValidUUID(uuid: string): boolean {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

/**
 * Validates and returns UUID, throws if invalid
 */
export function validateUUID(value: any, fieldName: string = 'ID'): string {
  if (!value) {
    throw new BadRequestException(`${fieldName} is required`);
  }

  const strValue = String(value).trim();

  if (!isValidUUID(strValue)) {
    throw new BadRequestException(
      `Invalid ${fieldName} format. Expected UUID v4, got: "${strValue}"`,
    );
  }

  return strValue;
}
