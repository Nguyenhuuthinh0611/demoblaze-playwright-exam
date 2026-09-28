import * as fs from "node:fs";
import * as log4js from "log4js";
import type { Logger } from "log4js";

const CONFIG_PATH = "configs/log4js.config.json";

// Custom layout: prefixes each log line with the caller's module path instead of a timestamp.
// Registered as a named log4js layout type so appenders can reference it via `layout: { type: MODULE_PATH_LAYOUT }`.
const MODULE_PATH_LAYOUT = "modulePath";
log4js.addLayout(MODULE_PATH_LAYOUT, () => (logEvent) => {
	const stackTrace = new Error().stack;
	const lines = stackTrace?.split("\n").slice(1) ?? [];
	// Only real source frames end in a `file:line:column` reference — native/anonymous
	// frames (e.g. "Array.forEach (<anonymous>)") never match and are skipped automatically.
	const callerLine = lines.find(
		(line) =>
			!line.includes("logger.ts") &&
			!line.includes("node_modules") &&
			/:\d+:\d+\)?$/.test(line.trim()),
	);
	const modulePath = callerLine?.trim().replace("at ", "") || "";

	return `[${modulePath}] ${logEvent.level.levelStr} - ${logEvent.data.join(" ")}`;
});

// Configure log4js using a JSON configuration file.
if (fs.existsSync(CONFIG_PATH)) {
	const configContent = fs.readFileSync(CONFIG_PATH, "utf-8");
	const parsedConfig = JSON.parse(configContent);

	// Wire the module-path layout into every appender defined in the JSON config.
	for (const appenderName of Object.keys(parsedConfig.appenders ?? {})) {
		parsedConfig.appenders[appenderName].layout = { type: MODULE_PATH_LAYOUT };
	}

	log4js.configure(parsedConfig);
} else {
	// Fallback configuration if the JSON file is not available.
	log4js.configure({
		appenders: {
			console: { type: "console", layout: { type: MODULE_PATH_LAYOUT } },
			file: {
				type: "file",
				filename: "logs/test.log",
				layout: { type: MODULE_PATH_LAYOUT },
			},
		},
		categories: {
			default: {
				appenders: ["file", "console"],
				level: process.env.LOG_LEVEL || "all",
			},
		},
	});
}

const logger: Logger = log4js.getLogger();
export default logger;
