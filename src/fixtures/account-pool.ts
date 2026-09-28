import fs from "node:fs";
import path from "node:path";
import type { TestInfo, WorkerInfo } from "@playwright/test";
import logger from "src/utils/logger";

/** One entry of the shared account pool (see data/accounts.sample.json). */
export interface Account {
	username: string;
	password: string;
}

/**
 * Shared plumbing for every "pick an account from a pool" fixture.
 *
 * Tests that log in cannot all share ONE account: they mutate account-level
 * state — on DemoBlaze, the cart — and two workers on the same
 * account will read each other's changes. A pool with one account per
 * concurrent worker removes that entirely, and is far cheaper than creating a
 * fresh account per test.
 *
 * Fixtures that CREATE an account per test (via an API) do not belong here:
 * there is no pool to pick from and no shared state to reset.
 */

/**
 * A globally-unique account index across concurrently-running Playwright
 * PROCESSES, not just workers within one.
 *
 * `testInfo.parallelIndex` resets to 0 in every separate `npx playwright test`
 * process, so two concurrent shards' worker 0 both resolve to the same pooled
 * account and collide. Folding in `process.env.SHARD` (1-based, matching CI's
 * own matrix numbering) keeps the shards' ranges disjoint.
 *
 * ⚠️ Whatever your CI does, the pool must hold at least
 * `shards x workers` accounts, or the modulo in pickAccountFromPool() wraps
 * two live workers onto one account. If a fixture also reserves an entry for
 * itself, the pool needs one more on top.
 */
export function resolveShardedIndex(testInfo: TestInfo | WorkerInfo): number {
	const rawShard = process.env.SHARD;
	if (rawShard === undefined || rawShard === "") {
		return testInfo.parallelIndex;
	}
	const shard = Number(rawShard);
	if (Number.isNaN(shard)) {
		logger.warn(
			`Account assignment: SHARD="${rawShard}" isn't a number — falling back to worker parallelIndex ${testInfo.parallelIndex}.`,
		);
		return testInfo.parallelIndex;
	}
	return (shard - 1) * testInfo.config.workers + testInfo.parallelIndex;
}

/**
 * The account this worker owns, and a loud warning when the pool is too small
 * to give it one of its own.
 *
 * The warning is not decoration: a wrapped index is the single most common
 * cause of "passes locally, fails in CI" in a suite like this, and it
 * presents as unrelated assertion failures rather than as a pool problem.
 */
export function pickAccountFromPool(
	pool: Account[],
	index: number,
	poolLabel = "Account",
): Account {
	if (pool.length === 0) {
		throw new Error(
			`${poolLabel} pool is empty — see data/accounts.sample.json for the expected shape.`,
		);
	}
	const accountIndex = index % pool.length;
	if (index >= pool.length) {
		logger.warn(
			`${poolLabel} assignment: index ${index} exceeds the pool size (${pool.length}) — this worker shares an account with another currently-active one, risking state collisions.`,
		);
	}
	const account = pool[accountIndex];
	logger.info(
		`${poolLabel} assignment: pool[${accountIndex}] (${account.username}) -> index ${index}`,
	);
	return account;
}

const ACCOUNTS_FILE = path.resolve("data/accounts.json");

/**
 * Loads one named pool from `data/accounts.json`, or returns `undefined` when
 * that file does not exist.
 *
 * That file holds REAL credentials and is gitignored. When present (copied
 * from `data/accounts.sample.json` locally, or restored from the
 * `TEST_ACCOUNTS_JSON` secret in CI) its accounts are used. When absent, the
 * caller registers a throwaway account per worker instead (see
 * src/fixtures/shop-fixtures.ts) — so a fresh clone runs with zero setup, and
 * the sample file's `REPLACE_ME` placeholders are never sent to a login form.
 */
export function loadAccountPool(poolName: string): Account[] | undefined {
	if (!fs.existsSync(ACCOUNTS_FILE)) {
		return undefined;
	}
	const pools = JSON.parse(fs.readFileSync(ACCOUNTS_FILE, "utf-8")) as Record<
		string,
		Account[]
	>;
	const pool = pools[poolName];
	if (!pool || pool.length === 0) {
		throw new Error(
			`Account pool "${poolName}" is missing or empty in data/accounts.json — see data/accounts.sample.json for the expected shape.`,
		);
	}
	return pool;
}
