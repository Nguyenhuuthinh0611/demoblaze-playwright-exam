import { test as base, chromium, webkit } from "@playwright/test";
import type { TestInfo } from "@playwright/test";
import { getBaseUrl } from "configs/url";
import { config } from "dotenv";
import BasePage from "src/base/base-page";
import logger from "src/utils/logger";
config();

const BROWSER_TYPES = { chromium, webkit } as const;

/**
 * Reads the engine straight from the project's own `use.defaultBrowserType`
 * — every `devices[...]` preset (desktop AND mobile, e.g. `devices["iPhone
 * 15"]` → `"webkit"`) sets this explicitly, so it's the same source Playwright
 * itself uses. More robust than matching on the project's `name` (which broke
 * the moment a project was renamed, or would silently mis-route a mobile
 * project — e.g. an iPhone preset — to Chromium by falling through the "no
 * match" default).
 *
 * Note Microsoft Edge has no distinct value here — Playwright reports
 * `defaultBrowserType: "chromium"` for it too (`devices["Desktop Edge"]`
 * sets that, same as Desktop Chrome); what actually picks Edge over plain
 * Chromium is the separate `channel: "msedge"` forwarded straight through in
 * launchBasePage() below, not this engine-family switch.
 *
 * The suite runs Chromium and WebKit only; any other value (including
 * `"firefox"`, which Playwright's own type still allows) falls back to
 * Chromium, same as `undefined`.
 */
function getBrowserType(
	defaultBrowserType?: "chromium" | "firefox" | "webkit",
) {
	return (
		BROWSER_TYPES[defaultBrowserType as keyof typeof BROWSER_TYPES] ?? chromium
	);
}

// Sandbox flags apply everywhere Chromium (or a Chromium-channel browser
// like Edge) runs, headless CI/Docker included; `--start-maximized` only
// makes sense for a headed run with a real screen to maximize onto —
// passing it in headless mode is a no-op at best, per upstream
// Playwright/Chromium behavior in CI environments.
const CHROMIUM_SANDBOX_ARGS = ["--no-sandbox", "--disable-setuid-sandbox"];
const CHROMIUM_MAXIMIZE_ARG = "--start-maximized";

// WebKit has no equivalent to --start-maximized recognized by
// Playwright, and its default window position has been observed offset from
// the monitor's origin AND drifting further with each new launch (Windows'
// own window-cascade placement) — with no API to correct it (window.moveTo()
// is blocked for the main browser window, and Playwright exposes no
// window-position option for any engine). Shrinking the target size well
// below the full monitor resolution is the only mitigation available; it
// cannot guarantee the window's origin the way Chromium/Edge's native
// `--start-maximized` mode does, so some residual risk of drifting onto a
// second display remains for WebKit specifically after enough consecutive
// runs.
const WEBKIT_SAFETY_MARGIN = { width: 350, height: 300 };

// Headless (CI/Docker) has no physical screen for --start-maximized/-kiosk
// to size against — both are no-ops there, and leaving `viewport: null` in
// that case would let each engine fall back to its own ambiguous headless
// default instead of a known, fixed size. A real-world pitfall: relying on
// "maximize" in headless CI silently produces an undersized/inconsistent
// viewport, causing elements to be clipped or laid out differently than in
// local headed runs. A fixed viewport sidesteps that entirely — same value
// for every engine, headless or not, overridable via SCREEN_SIZE.
const DEFAULT_HEADLESS_VIEWPORT = { width: 1920, height: 1080 };

let cachedRealScreenSize: Promise<{ width: number; height: number }> | null =
	null;

/**
 * WebKit can't be trusted to report its own real screen size on every
 * environment — it's been observed returning physical pixels with
 * `devicePixelRatio` stuck at 1 on a HiDPI Windows machine (reporting e.g.
 * 2880×1704 instead of the real 1440×852), which would resize its window to
 * 4x the visible area. Chromium's own `window.screen` values are the ones
 * proven correct (they match its `--start-maximized` window exactly), so a
 * short-lived headed Chromium is launched purely to ask the OS for the real
 * usable resolution — once per worker process, cached, and reused for every
 * WebKit launch after. Only ever called for a headed WebKit run (see
 * resolveViewport()) — never invoked in headless mode, where there's no real
 * screen to probe for, and never needed for Chromium/Edge, which size
 * themselves via `--start-maximized` directly.
 */
async function getRealScreenSize(): Promise<{ width: number; height: number }> {
	if (!cachedRealScreenSize) {
		cachedRealScreenSize = (async () => {
			const probeBrowser = await chromium.launch({
				headless: false,
				args: [...CHROMIUM_SANDBOX_ARGS, CHROMIUM_MAXIMIZE_ARG],
			});
			// `browser.newPage()`'s shorthand context defaults to Playwright's
			// own 1280x720 viewport (not null) — which, same as the original
			// bug, makes Chromium report `window.screen` as 1280x720 instead of
			// the real maximized-window resolution. Must be explicit here.
			// `deviceScaleFactor` must be explicitly undefined alongside
			// `viewport: null` — `chromium` here comes from `@playwright/test`,
			// which merges in playwright.config.ts's `use` defaults, and
			// leaving the key out entirely lets an inherited value slip
			// through, which Playwright rejects when paired with a null
			// viewport ("deviceScaleFactor option is not supported with null
			// viewport").
			const probeContext = await probeBrowser.newContext({
				viewport: null,
				deviceScaleFactor: undefined,
			});
			const probePage = await probeContext.newPage();
			const size = await probePage.evaluate(() => ({
				width: window.screen.availWidth,
				height: window.screen.availHeight,
			}));
			await probeBrowser.close();
			return size;
		})();
	}
	return cachedRealScreenSize;
}

/**
 * Resolves the `viewport` to launch a DESKTOP project with. Never called for
 * a mobile device project — see launchBasePage(), which uses the device
 * preset's own viewport instead.
 *
 * - `SCREEN_SIZE` env always wins, for any engine.
 * - Headless (CI): a fixed default (1920x1080) for every engine — there's no
 *   real screen for --start-maximized to size against, so a known, explicit
 *   value is used instead of leaving it ambiguous.
 * - Headed Chromium (including Edge, launched via the same `chromium`
 *   BrowserType + a `channel`): `null` — handled by `--start-maximized`
 *   instead (an explicit viewport would fight it, see the constant above).
 * - Headed WebKit: sized to the real screen (Chromium-verified) minus a
 *   safety margin, since it has no native fullscreen mode of its own.
 */
async function resolveViewport(
	browserType: typeof chromium,
): Promise<{ width: number; height: number } | null> {
	if (process.env.SCREEN_SIZE?.includes("x")) {
		const [width, height] = process.env.SCREEN_SIZE.split("x").map(Number);
		return { width, height };
	}
	const isHeadless = process.env.HEADLESS !== "0";
	if (isHeadless) {
		return DEFAULT_HEADLESS_VIEWPORT;
	}
	if (browserType === chromium) {
		return null;
	}
	const real = await getRealScreenSize();
	return {
		width: real.width - WEBKIT_SAFETY_MARGIN.width,
		height: real.height - WEBKIT_SAFETY_MARGIN.height,
	};
}

/**
 * This framework creates its own browser/context (see launchBasePage below)
 * instead of using Playwright Test's built-in `context`/`page` fixtures.
 * Trace capture still works for a manually-created context (Playwright Test
 * hooks into context creation regardless of how it happened), but video
 * recording does NOT — it's only wired up inside the built-in `context`
 * fixture. `use.video` in playwright.config.ts is otherwise silently
 * ignored, so it has to be read and applied by hand here.
 */
function normalizeVideoMode(
	video: TestInfo["project"]["use"]["video"],
): "off" | "on" | "retain-on-failure" {
	if (!video) return "off";
	const mode = typeof video === "string" ? video : video.mode;
	return mode === "on" || mode === "retain-on-failure" ? mode : "off";
}

// Windows/macOS/Linux all disallow these characters in filenames; a test
// title like "LOGIN-001: Signs in with valid credentials" can have a `:`
// in it, which
// Windows rejects outright.
function sanitizeForFileName(title: string): string {
	return title.replace(/[<>:"/\\|?*]+/g, "_").trim();
}

async function launchBasePage(testInfo: TestInfo) {
	const projectUse = testInfo.project.use;
	const browserType = getBrowserType(projectUse.defaultBrowserType);
	const videoMode = normalizeVideoMode(projectUse.video);

	// `devices["iPhone 15"]`-style presets set `isMobile` explicitly; desktop
	// presets (`devices["Desktop Chrome"]`, etc.) leave it unset. This is the
	// switch between "drive a real, physical-screen-sized desktop window" and
	// "emulate a specific phone/tablet viewport" — the two are mutually
	// exclusive (an explicit device viewport is the whole point of mobile
	// emulation; forcing a desktop fullscreen window on top of it would
	// silently discard the emulated size, same conflict as --start-maximized
	// fighting a manual viewport for Chromium).
	const isMobileDevice = Boolean(projectUse.isMobile);
	const isHeadless = process.env.HEADLESS !== "0";
	logger.info(
		`Base fixture setup (project: ${testInfo.project.name}${isMobileDevice ? ", mobile device emulation" : ""})`,
	);

	const viewport = isMobileDevice
		? projectUse.viewport ?? null
		: await resolveViewport(browserType);

	// `recordVideo.size` must match the page's actual rendered size, or
	// Playwright crops the recording to that size from the top-left corner
	// instead of scaling it — looks like the page is "zoomed in" with fields
	// cut off. `viewport` is `null` for headed Chromium/Edge (maximized via
	// `--start-maximized`, see CHROMIUM_MAXIMIZE_ARG above), so the real
	// window size has to be probed the same way WebKit's sizing already does
	// rather than falling back to a hardcoded guess.
	const recordVideoSize =
		videoMode === "off" ? undefined : viewport ?? (await getRealScreenSize());

	const browser = await browserType.launch({
		headless: isHeadless,
		// Forwards the project's `channel` (e.g. "msedge") straight through —
		// without this, a project like "Microsoft Edge" would silently launch
		// plain Chromium instead of the actual installed Edge binary, since
		// `defaultBrowserType` alone only picks the engine family, not which
		// channel/build of it to run.
		channel: projectUse.channel,
		args: isMobileDevice
			? undefined
			: browserType === chromium
				? [
						...CHROMIUM_SANDBOX_ARGS,
						...(isHeadless ? [] : [CHROMIUM_MAXIMIZE_ARG]),
					]
				: undefined,
		slowMo: process.env.SLOW_MO ? Number(process.env.SLOW_MO) : 0,
	});
	const context = await browser.newContext({
		baseURL: getBaseUrl(),
		httpCredentials:
			process.env.BASIC_AUTH_USERNAME && process.env.BASIC_AUTH_PASSWORD
				? {
						username: process.env.BASIC_AUTH_USERNAME,
						password: process.env.BASIC_AUTH_PASSWORD,
					}
				: undefined,
		viewport,
		deviceScaleFactor: isMobileDevice
			? projectUse.deviceScaleFactor
			: undefined,
		isMobile: isMobileDevice ? projectUse.isMobile : undefined,
		hasTouch: isMobileDevice ? projectUse.hasTouch : undefined,
		userAgent: isMobileDevice ? projectUse.userAgent : undefined,
		recordVideo:
			videoMode === "off"
				? undefined
				: { dir: testInfo.outputPath(), size: recordVideoSize },
	});
	const page = await context.newPage();
	const basePage = new BasePage(page, testInfo);
	return {
		basePage,
		teardown: async () => {
			logger.info("Base fixture teardown");
			// Grace period before destroying the browser — lets any
			// in-flight async work from the test's last action (a pending
			// screenshot/trace capture, a fire-and-forget analytics call,
			// etc.) finish instead of being cut off mid-flight. Left as a
			// flat wait rather than a smart wait: there's no single DOM
			// condition to poll for here (the test is already over, and
			// what's still in flight varies per test).
			await basePage.waitForTimeout(3000);
			const video = videoMode === "off" ? null : page.video();
			await page.close();
			await context.close();
			// Video only finishes writing once its context closes, but
			// `video.saveAs()`/`video.delete()` still need the browser
			// connection alive to fetch the artifact — must run before
			// `browser.close()` below, not after (was previously ordered after
			// `browser.close()`, which failed every time with "Target page,
			// context or browser has been closed" and left the file under
			// Playwright's own random name instead of being renamed).
			if (video) {
				const testFailed = testInfo.status !== testInfo.expectedStatus;
				const keepVideo = videoMode === "on" || testFailed;
				if (keepVideo) {
					// Named after the test case (e.g. "LOGIN-001: Signs in with
					// valid credentials.webm") instead of Playwright's own random video-<hash>.webm, so a
					// video pulled out of test-results/ for a ticket is
					// self-explanatory on its own. `saveAs` copies the recording
					// to this path; the original random-named file it copies from
					// is then cleaned up via `delete()` so only the renamed copy
					// remains.
					const namedVideoPath = testInfo.outputPath(
						`${sanitizeForFileName(testInfo.title)}.webm`,
					);
					await video.saveAs(namedVideoPath);
					await video.delete();
					await testInfo.attach("video", {
						path: namedVideoPath,
						contentType: "video/webm",
					});
				} else {
					await video.delete();
				}
			}
			await browser.close();
		},
	};
}

// `basePage` and `freshPage` behave identically — both launch their own
// brand-new browser/context/page per test and tear it down after, neither
// inheriting cookies/session/localStorage from the other or from a previous
// test. Neither name implies more isolation than the other; there is no
// session-sharing "base" environment here to be fresh *relative to*.
// `freshPage` exists purely because Playwright memoizes a fixture by its key
// within a single test — requesting `basePage` twice wouldn't give a test
// two independent browsers, only the same cached instance — so a second key
// is what lets a test that genuinely needs two isolated browsers at once
// (e.g. two concurrent users) get a second one. No current test does that;
// it's kept available for when one needs it. Both share this one
// launch/use/teardown body instead of duplicating it under two fixture keys.
async function launchAndUseBasePage(
	// biome-ignore lint/correctness/noEmptyPattern: Playwright requires the object destructuring pattern here (checked at runtime, not just by its type) — this fixture launches its own browser and doesn't depend on any of the built-in ones.
	{},
	use: (basePage: BasePage) => Promise<void>,
	testInfo: TestInfo,
) {
	const { basePage, teardown } = await launchBasePage(testInfo);
	try {
		await use(basePage);
	} finally {
		await teardown();
	}
}

export const test = base.extend<{
	basePage: BasePage;
	freshPage: BasePage;
}>({
	basePage: launchAndUseBasePage,
	freshPage: launchAndUseBasePage,
});
