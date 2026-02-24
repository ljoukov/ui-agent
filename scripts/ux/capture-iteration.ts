import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";

import { chromium, devices, type Page } from "playwright";

type CaptureOptions = {
	iteration: number;
	url: string;
};

type ApiPollState = {
	state?: {
		turn?: number;
	};
	busy?: boolean;
};

function parseOptions(argv: readonly string[]): CaptureOptions {
	let iteration = 1;
	let url = "http://127.0.0.1:4173";

	for (const arg of argv) {
		if (arg.startsWith("--iteration=")) {
			const raw = Number.parseInt(arg.slice("--iteration=".length), 10);
			if (Number.isFinite(raw) && raw > 0) {
				iteration = raw;
			}
		}
		if (arg.startsWith("--url=")) {
			url = arg.slice("--url=".length);
		}
	}

	return { iteration, url };
}

async function captureDesktopScreenshots(
	page: Page,
	url: string,
	outputDir: string,
): Promise<void> {
	await page.goto(url, { waitUntil: "networkidle" });
	await page.waitForSelector('[data-testid="app-ready"][data-ready="true"]', { timeout: 45_000 });
	await page.getByTestId("reset-session").click();
	await page.waitForTimeout(250);
	await page.getByTestId("reset-session").click().catch(() => {});
	await page.waitForTimeout(900);

	await page.screenshot({
		path: path.join(outputDir, "step-1-initial-desktop.png"),
		fullPage: true,
	});

	await page.getByTestId("simulate-attempt").click();
	await page.waitForTimeout(900);
	await page.screenshot({
		path: path.join(outputDir, "step-2-simulated-attempt-desktop.png"),
		fullPage: true,
	});

	const previousTurnText = await page.getByTestId("turn-value").innerText();
	const previousTurn = Number.parseInt(previousTurnText, 10);

	await page.getByTestId("run-teacher").click();
	await waitForTeacherCompletion(url, Number.isFinite(previousTurn) ? previousTurn : 0);
	await page.reload({ waitUntil: "networkidle" });
	await page.waitForSelector('[data-testid="app-ready"][data-ready="true"]', { timeout: 45_000 });

	await page.waitForTimeout(700);
	await page.screenshot({
		path: path.join(outputDir, "step-3-agent-feedback-desktop.png"),
		fullPage: true,
	});
}

async function waitForTeacherCompletion(baseUrl: string, previousTurn: number): Promise<void> {
	const deadline = Date.now() + 230_000;
	const apiUrl = new URL("/api/ukmt-h6", baseUrl).toString();
	let sawBusy = false;

	while (Date.now() < deadline) {
		const response = await fetch(apiUrl);
		if (response.ok) {
			const payload = (await response.json()) as ApiPollState;
			const turn = payload.state?.turn;
			if (typeof turn === "number" && Number.isFinite(turn) && turn > previousTurn) {
				return;
			}
			if (payload.busy === true) {
				sawBusy = true;
			}
			if (sawBusy && payload.busy === false) {
				return;
			}
		}
		await new Promise((resolve) => {
			setTimeout(resolve, 1500);
		});
	}

	throw new Error("Timed out waiting for teacher completion");
}

async function captureMobileScreenshot(
	url: string,
	outputDir: string,
): Promise<void> {
	const browser = await chromium.launch();
	const context = await browser.newContext({
		...devices["iPhone 13"],
	});
	const page = await context.newPage();
	await page.goto(url, { waitUntil: "networkidle" });
	await page.waitForSelector('[data-testid="app-ready"][data-ready="true"]', { timeout: 45_000 });
	await page.screenshot({
		path: path.join(outputDir, "step-4-mobile-final.png"),
		fullPage: true,
	});
	await context.close();
	await browser.close();
}

async function main(): Promise<void> {
	const options = parseOptions(process.argv.slice(2));
	const iterationDir = path.resolve("artifacts/ux-iterations", `iteration-${options.iteration}`);
	const outputDir = path.join(iterationDir, "screenshots");
	await mkdir(outputDir, { recursive: true });

	const browser = await chromium.launch();
	const context = await browser.newContext({
		viewport: { width: 1440, height: 1900 },
	});
	const page = await context.newPage();

	try {
		await captureDesktopScreenshots(page, options.url, outputDir);
		await captureMobileScreenshot(options.url, outputDir);
		await writeFile(
			path.join(iterationDir, "capture-manifest.json"),
			JSON.stringify(
				{
					iteration: options.iteration,
					url: options.url,
					screenshots: [
						"step-1-initial-desktop.png",
						"step-2-simulated-attempt-desktop.png",
						"step-3-agent-feedback-desktop.png",
						"step-4-mobile-final.png",
					],
				},
				null,
				2,
			) + "\n",
			"utf8",
		);
	} finally {
		await context.close();
		await browser.close();
	}
}

await main();
