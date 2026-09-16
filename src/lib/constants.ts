/**
 * Shared constants with no "use client"/"use server" boundary of their own,
 * so both sides can import them directly. (A `"use server"` file's exports
 * must all be async functions — a plain constant can't live there if a
 * client component needs to import it too.)
 */

/** Default cleaner fee pre-filled on auto-created turnover records. */
export const DEFAULT_CLEANING_FEE = 800;
