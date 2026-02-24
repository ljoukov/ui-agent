import assert from "node:assert/strict";
import { constants } from "node:fs";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { generateText, runAgentLoop } from "@ljoukov/llm";

const AGENT_MODEL = "chatgpt-gpt-5.3-codex";
const JUDGE_MODEL = "gpt-5.2";

test(
	"agent reads TASK.md and writes a greeting to output.txt",
	{ timeout: 180_000 },
	async () => {
		const workspaceDir = await mkdtemp(path.join(os.tmpdir(), "ui-agent-int-"));
		const taskPath = path.join(workspaceDir, "TASK.md");
		const outputPath = path.join(workspaceDir, "output.txt");

		const taskText = [
			"# TASK",
			"",
			"Read this file and follow it exactly.",
			'Write one friendly greeting to the user into "output.txt" in this same directory.',
			'Your greeting must contain the word "hello".',
		].join("\n");

		try {
			await writeFile(taskPath, taskText, "utf8");

			await runAgentLoop({
				model: AGENT_MODEL,
				input: [
					{
						role: "developer",
						content: "You are a task execution agent. Follow file instructions exactly.",
					},
					{
						role: "user",
						content: "Read TASK.md in the current workspace and complete the task.",
					},
				],
				filesystemTool: {
					profile: "auto",
					options: {
						cwd: workspaceDir,
					},
				},
				maxSteps: 12,
			});

			await access(outputPath, constants.F_OK);
			const outputText = (await readFile(outputPath, "utf8")).trim();
			assert.notEqual(outputText, "", "output.txt was created but is empty");

			const judgePrompt = [
				"You grade whether text contains a greeting directed at the user.",
				'Return exactly one word: PASS or FAIL. No punctuation. No explanation.',
				"A passing answer should clearly greet the user (for example with hello/hi/hey/greetings).",
				"",
				`Text to grade:\n${outputText}`,
			].join("\n");

			const judge = await generateText({
				model: JUDGE_MODEL,
				input: judgePrompt,
			});

			const verdict = judge.text.trim().toUpperCase();
			assert.equal(
				verdict,
				"PASS",
				`Expected judge verdict PASS, received "${judge.text.trim()}" for output.txt: ${outputText}`,
			);
		} finally {
			await rm(workspaceDir, { recursive: true, force: true });
		}
	},
);
