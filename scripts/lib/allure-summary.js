/**
 * Shared by notify-slack.js and notify-email.js — counts each Allure test
 * case's FINAL `status` in the given results directory, so both notification
 * channels report identical pass/fail/broken/skipped numbers from a single
 * source instead of two separate copies of the same parsing logic.
 *
 * A retried test writes one `-result.json` PER ATTEMPT, all sharing the same
 * `historyId` — counting every file directly (as this used to) tallies each
 * attempt separately, inflating both the failed count (from the attempts that
 * failed before eventually passing) and the total. Grouping by `historyId`
 * and keeping only the latest attempt (by `stop`, falling back to `start`)
 * mirrors what Allure's own report UI already does for its Suites/Behaviors
 * view, so this summary's numbers match what the linked report shows.
 */
const fs = require("node:fs");
const path = require("node:path");

/**
 * Reads counts from ALLURE_COUNTS ("passed,failed,broken,skipped"), or
 * returns null when it is absent or malformed.
 *
 * The notification job builds its allure-results/ from downloaded artifacts,
 * and those do not arrive when the account's Actions storage quota is
 * exhausted — the very case the test jobs work around by publishing their
 * own reports directly. Without this the message still sends but reports
 * 0/0/0/0, which reads as "nothing ran" rather than "the counts could not be
 * collected". The test jobs know their own numbers and pass them through.
 */
function parseCountsEnv(raw) {
	if (!raw) return null;
	const parts = raw.split(",").map((part) => Number(part.trim()));
	if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) {
		console.warn(
			`ALLURE_COUNTS="${raw}" is not "passed,failed,broken,skipped" — falling back to the results directory.`,
		);
		return null;
	}
	const [passed, failed, broken, skipped] = parts;
	return { passed, failed, broken, skipped, unknown: 0 };
}

function countAllureResults(dir) {
	const fromEnv = parseCountsEnv(process.env.ALLURE_COUNTS);
	if (fromEnv) return fromEnv;

	const counts = { passed: 0, failed: 0, broken: 0, skipped: 0, unknown: 0 };
	if (!fs.existsSync(dir)) return counts;

	const latestByHistoryId = new Map();
	for (const file of fs.readdirSync(dir)) {
		if (!file.endsWith("-result.json")) continue;
		let data;
		try {
			data = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
		} catch {
			counts.unknown += 1;
			continue;
		}
		// No historyId (shouldn't happen for allure-playwright results, but
		// keep this from silently dropping a result) — treat as its own
		// unique "group" via the filename so it's still counted once.
		const key = data.historyId ?? file;
		const timestamp = data.stop ?? data.start ?? 0;
		const existing = latestByHistoryId.get(key);
		if (!existing || timestamp >= existing.timestamp) {
			latestByHistoryId.set(key, { data, timestamp });
		}
	}

	for (const { data } of latestByHistoryId.values()) {
		const status = data.status in counts ? data.status : "unknown";
		counts[status] += 1;
	}
	return counts;
}

module.exports = { countAllureResults };
