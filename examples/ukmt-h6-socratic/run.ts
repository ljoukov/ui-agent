import path from "node:path";
import { mkdir, rm, writeFile } from "node:fs/promises";

import {
	DEFAULT_TEACHING_AGENT_MODEL,
	DEFAULT_TEACHING_AGENT_REASONING,
	TEACHING_CONTROL_BINDINGS,
	TeachingAgentSession,
} from "../../src/lib/index.ts";

const PROBLEM_STATEMENT = `A vegetable patch is a square grid of n by n uncleared cells with n >= 3 and n odd.
Mo the mole is in the centre cell and digs it up to clear it.

Mo then digs up cells one at a time according to the following rule.
Mo can dig up an uncleared cell that is both adjacent horizontally or vertically to a cleared cell and in the middle of a line of three uncleared cells in the vegetable patch.

After digging up M squares, Mo can dig no further.
Find in terms of n the smallest M for which this can happen and prove there is no smaller value.`;

const PROMPT_TEXT = [
	"Start by exploring what the move rule forces locally around a newly cleared square.",
	"Write observations from small odd grids first, then look for an invariant or bottleneck.",
	"Focus on structure, not the final expression yet.",
].join("\n");

const SIMULATED_ATTEMPTS = [
	[
		"I started with n = 3 and n = 5 sketches.",
		"I suspect parity matters because the centre is one colour on a checkerboard.",
		"I am not sure how the 'middle of three uncleared cells' condition limits future moves.",
	].join("\n"),
];

function stripAnsi(value: string): string {
	return value.replace(/\x1b\[[0-9;]*m/gu, "");
}

async function main(): Promise<void> {
	const workspaceRoot = path.resolve("examples/ukmt-h6-socratic/runtime-workspace");
	await rm(workspaceRoot, { recursive: true, force: true });
	await mkdir(workspaceRoot, { recursive: true });

	const session = new TeachingAgentSession({
		cwd: workspaceRoot,
	});

	await session.initialize({
		problemStatement: PROBLEM_STATEMENT,
		prompt: PROMPT_TEXT,
	});

	const transcript: string[] = [];
	transcript.push(`Model: ${DEFAULT_TEACHING_AGENT_MODEL}`);
	transcript.push(`Reasoning effort: ${DEFAULT_TEACHING_AGENT_REASONING}`);
	transcript.push("");
	transcript.push("Control bindings:");
	for (const binding of TEACHING_CONTROL_BINDINGS) {
		transcript.push(`- ${binding.controlId} -> ${binding.file} (${binding.owner})`);
	}
	transcript.push("");

	console.log(`Model: ${DEFAULT_TEACHING_AGENT_MODEL}`);
	console.log(`Reasoning effort: ${DEFAULT_TEACHING_AGENT_REASONING}`);
	console.log("");
	console.log("Control bindings:");
	for (const binding of TEACHING_CONTROL_BINDINGS) {
		console.log(`- ${binding.controlId} -> ${binding.file} (${binding.owner})`);
	}

	let textView = await session.renderTextView({ color: true });
	console.log("\n=== Initial Textview ===\n");
	console.log(textView);
	transcript.push("=== Initial Textview ===");
	transcript.push(stripAnsi(textView));
	transcript.push("");

	for (let index = 0; index < SIMULATED_ATTEMPTS.length; index += 1) {
		const turnNumber = index + 1;
		const studentAttempt = SIMULATED_ATTEMPTS[index];
		await session.setStudentAttempt(studentAttempt);
		await session.runTeacherTurn();
		textView = await session.renderTextView({ color: true });

		console.log(`\n=== Turn ${turnNumber} ===\n`);
		console.log(textView);

		transcript.push(`=== Turn ${turnNumber} ===`);
		transcript.push(stripAnsi(textView));
		transcript.push("");
	}

	const transcriptPath = path.resolve(workspaceRoot, "transcript.txt");
	await writeFile(transcriptPath, `${transcript.join("\n")}\n`, "utf8");
	console.log(`\nSaved transcript: ${transcriptPath}`);
}

await main();
