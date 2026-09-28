/**
 * Emails a test-run summary via SendGrid's SMTP relay. Run from CI only (see
 * .github/workflows/playwright.yml's report job) after Allure results have
 * been downloaded/merged into ./allure-results — same pass/fail/broken/
 * skipped counts as notify-slack.js (shared via lib/allure-summary.js), with
 * a summary-only body and no report attachment.
 *
 * SendGrid rather than Gmail SMTP: Google Workspace accounts can have App
 * Passwords disabled outright, with no way to re-enable them from the user
 * side. SendGrid's free tier needs only a single verified sender address —
 * no DNS or custom-domain setup, unlike Mailgun's sandbox restriction.
 * Swap in any transport nodemailer supports if your org has one.
 *
 * Required env vars: SENDGRID_API_KEY, SENDGRID_FROM_EMAIL (must be a
 * Sender-Verified address in the SendGrid account), NOTIFY_EMAIL_TO
 * (comma-separated), TEST_RESULT ("success"|"failure"|"cancelled" — the
 * upstream test job's own result).
 * Optional: ALLURE_REPORT_URL (omitted from the message if not set).
 * GITHUB_* vars are provided automatically by Actions.
 */
const path = require("node:path");
const nodemailer = require("nodemailer");
const { countAllureResults } = require("./lib/allure-summary");

async function main() {
	const sendgridApiKey = process.env.SENDGRID_API_KEY;
	const fromEmail = process.env.SENDGRID_FROM_EMAIL;
	const recipients = process.env.NOTIFY_EMAIL_TO;
	if (!sendgridApiKey || !fromEmail || !recipients) {
		console.log(
			"SENDGRID_API_KEY/SENDGRID_FROM_EMAIL/NOTIFY_EMAIL_TO not set — skipping email notification.",
		);
		return;
	}

	const testResult = process.env.TEST_RESULT || "unknown";
	const statusEmoji =
		testResult === "success" ? "✅" : testResult === "failure" ? "❌" : "⚠️";

	const counts = countAllureResults(path.join(process.cwd(), "allure-results"));

	const repo = process.env.GITHUB_REPOSITORY || "";
	const runId = process.env.GITHUB_RUN_ID || "";
	const serverUrl = process.env.GITHUB_SERVER_URL || "https://github.com";
	const runUrl =
		repo && runId ? `${serverUrl}/${repo}/actions/runs/${runId}` : "";
	const branch = process.env.GITHUB_REF_NAME || "unknown";
	const actor = process.env.GITHUB_ACTOR || "unknown";
	const allureReportUrl = process.env.ALLURE_REPORT_URL || "";

	const textLines = [
		`${statusEmoji} Playwright Tests — branch ${branch}, triggered by ${actor}`,
		"",
		`Passed:  ${counts.passed}`,
		`Failed:  ${counts.failed}`,
		`Broken:  ${counts.broken}`,
		`Skipped: ${counts.skipped}`,
		"",
	];
	if (allureReportUrl) textLines.push(`Allure report: ${allureReportUrl}`);
	if (runUrl) textLines.push(`GitHub Actions run: ${runUrl}`);

	const htmlRows = [
		["Passed", counts.passed],
		["Failed", counts.failed],
		["Broken", counts.broken],
		["Skipped", counts.skipped],
	]
		.map(([label, count]) => `<tr><td>${label}</td><td>${count}</td></tr>`)
		.join("");
	const htmlLinks = [
		allureReportUrl &&
			`<p><a href="${allureReportUrl}">View Allure report</a></p>`,
		runUrl && `<p><a href="${runUrl}">View GitHub Actions run</a></p>`,
	]
		.filter(Boolean)
		.join("");
	const html = `
		<h2>${statusEmoji} Playwright Tests — branch ${branch}</h2>
		<p>Triggered by ${actor}</p>
		<table border="1" cellpadding="6" cellspacing="0">${htmlRows}</table>
		${htmlLinks}
	`;

	const transporter = nodemailer.createTransport({
		host: "smtp.sendgrid.net",
		port: 587,
		auth: { user: "apikey", pass: sendgridApiKey },
	});

	await transporter.sendMail({
		from: fromEmail,
		to: recipients,
		subject: `${statusEmoji} Playwright Tests (${branch}) — ${testResult}`,
		text: textLines.join("\n"),
		html,
	});

	console.log("Email notification sent.");
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
