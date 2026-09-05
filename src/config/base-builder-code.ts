/**
 * Base Builder Code Configuration
 * Standard ERC-8021 attribution suffix for Base transactions.
 */

export const BASE_BUILDER_CODE = {
  code: "bc_f3sf2iiu",
  encoded: "0x62635f66337366326969750b0080218021802180218021802180218021" as `0x${string}`,
} as const;

export const BASE_BUILDER_DATA_SUFFIX = BASE_BUILDER_CODE.encoded;

/**
 * Appends the Base Builder Code ERC-8021 suffix to transaction calldata if not already present.
 */
export function appendBaseBuilderSuffix(calldata: string | `0x${string}`): `0x${string}` {
  if (!calldata) return BASE_BUILDER_CODE.encoded;
  const hex = calldata.startsWith("0x") ? calldata : `0x${calldata}`;
  const suffix = BASE_BUILDER_CODE.encoded.slice(2);
  // Avoid duplicate appending
  if (hex.toLowerCase().endsWith(suffix.toLowerCase())) {
    return hex as `0x${string}`;
  }
  return `${hex}${suffix}` as `0x${string}`;
}
