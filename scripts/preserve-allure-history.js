/**
 * Copies the previous report's history/ folder back into allure-results/
 * before regenerating. Allure builds its trend graphs (and each test's
 * pass/fail history across runs) by reading allure-results/history/ at
 * generate time — without carrying it forward, `allure generate --clean`
 * wipes it every run, so each new report looks like the very first run
 * instead of showing a trend across past runs.
 */
const fs = require("node:fs");
const path = require("node:path");

const prevHistory = path.join(process.cwd(), "allure-report", "history");
const resultsHistory = path.join(process.cwd(), "allure-results", "history");

if (fs.existsSync(prevHistory)) {
	fs.rmSync(resultsHistory, { recursive: true, force: true });
	fs.cpSync(prevHistory, resultsHistory, { recursive: true });
	console.log(
		"Restored previous Allure history — trend will include past runs.",
	);
} else {
	console.log(
		"No previous Allure history found — this run starts a new trend.",
	);
}
