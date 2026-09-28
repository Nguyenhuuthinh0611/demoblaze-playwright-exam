import { mergeTests } from "@playwright/test";
import { test as baseTest } from "src/fixtures/base-fixtures";
import { test as shopTest } from "src/fixtures/shop-fixtures";

/**
 * The single `test` every spec imports:
 *
 * ```ts
 * import { test } from "src/fixtures";
 * ```
 *
 * Never import from base-fixtures.ts or an individual `<feature>-fixtures.ts`
 * directly — a spec that does only sees that one file's fixtures, and asking
 * for any other fails at runtime.
 *
 * Add each new `src/fixtures/<feature>-fixtures.ts` to the mergeTests(...)
 * call below; that is the only wiring step.
 */
export const test = mergeTests(baseTest, shopTest);
export { expect } from "@playwright/test";
export default test;
