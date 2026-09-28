/**
 * Posts a test-run summary to Slack via an Incoming Webhook. Run from CI
 * only (see .github/workflows/playwright.yml's report job) after Allure
 * results have been downloaded/merged into ./allure-results — reads that
 * directory's *-result.json files for pass/fail/skip/broken counts rather
 * than re-running anything.
 *
 * Required env vars: SLACK_WEBHOOK_URL, TEST_RESULT ("success"|"failure"|
 * "cancelled" — the upstream test job's own result).
 * Optional: ALLURE_REPORT_URL (omitted from the message if not set).
 * GITHUB_* vars are provided automatically by Actions.
 */
const path = require("node:path");
const { countAllureResults } = require("./lib/allure-summary");

async function main() {
	const webhookUrl = process.env.SLACK_WEBHOOK_URL;
	if (!webhookUrl) {
		console.log("SLACK_WEBHOOK_URL not set — skipping Slack notification.");
		return;
	}

	const testResult = process.env.TEST_RESULT || "unknown";
	const statusEmoji =
		testResult === "success" ? "✅" : testResult === "failure" ? "❌" : "⚠️";

	// countAllureResults() honours an ALLURE_COUNTS override itself — see
	// its own note in scripts/lib/allure-summary.js. Keeping that logic in
	// the shared library rather than here is what lets notify-email.js get
	// the same behaviour without a second copy.
	const counts = countAllureResults(path.join(process.cwd(), "allure-results"));

	const repo = process.env.GITHUB_REPOSITORY || "";
	const runId = process.env.GITHUB_RUN_ID || "";
	const serverUrl = process.env.GITHUB_SERVER_URL || "https://github.com";
	const runUrl =
		repo && runId ? `${serverUrl}/${repo}/actions/runs/${runId}` : "";
	const branch = process.env.GITHUB_REF_NAME || "unknown";
	const actor = process.env.GITHUB_ACTOR || "unknown";
	const allureReportUrl = process.env.ALLURE_REPORT_URL || "";

	// Plain-text fallback — shown in mobile push notifications/previews where
	// Slack doesn't render `blocks`, so this must carry the same info on its
	// own rather than just duplicating the header block's text.
	const fallbackText = [
		`${statusEmoji} Playwright Tests — branch ${branch}, triggered by ${actor}`,
		`Passed: ${counts.passed}  Failed: ${counts.failed}  Broken: ${counts.broken}  Skipped: ${counts.skipped}`,
	].join("\n");

	const blocks = [
		{
			type: "header",
			text: {
				type: "plain_text",
				text: `${statusEmoji} Playwright Test Report`,
				emoji: true,
			},
		},
		{
			type: "section",
			text: {
				type: "mrkdwn",
				text: `*Branch:* \`${branch}\`   *Triggered by:* ${actor}`,
			},
		},
		{
			type: "section",
			fields: [
				{ type: "mrkdwn", text: `✅ *Passed*\n${counts.passed}` },
				{ type: "mrkdwn", text: `❌ *Failed*\n${counts.failed}` },
				{ type: "mrkdwn", text: `🔧 *Broken*\n${counts.broken}` },
				{ type: "mrkdwn", text: `⏭️ *Skipped*\n${counts.skipped}` },
			],
		},
	];

	const links = [];
	if (allureReportUrl) {
		links.push(`📊 <${allureReportUrl}|View Allure Report>`);
	} else {
		// Used to be silently dropped, which is why a missing report link read
		// as "Slack is broken" rather than "the deploy that produces the URL
		// didn't hand one back". Say so in both the CI log and the message.
		console.warn(
			"ALLURE_REPORT_URL is empty — no report link will appear in Slack. " +
				"Check the 'Deploy to Cloudflare Pages' step: the URL comes from its " +
				"`url` output (via steps.cloudflare-deploy.outputs.url), so an empty " +
				"value means that step failed, was skipped, or produced no output. " +
				"vars.ALLURE_SERVER_HOST overrides it when set.",
		);
		links.push("📊 _Allure report link unavailable — see the run's artifacts_");
	}
	if (runUrl) links.push(`🔗 <${runUrl}|View GitHub Actions Run>`);
	if (links.length > 0) {
		blocks.push({ type: "divider" });
		blocks.push({
			type: "context",
			elements: [{ type: "mrkdwn", text: links.join("     ") }],
		});
	}

	const payload = {
		text: fallbackText,
		blocks,
	};

	const response = await fetch(webhookUrl, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(payload),
	});

	if (!response.ok) {
		throw new Error(
			`Slack webhook responded with ${response.status}: ${await response.text()}`,
		);
	}
	console.log("Slack notification sent.");
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
