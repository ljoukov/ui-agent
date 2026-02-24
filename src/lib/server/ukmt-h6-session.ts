import path from "node:path";
import { rm } from "node:fs/promises";

import {
	DEFAULT_TEACHING_AGENT_MODEL,
	DEFAULT_TEACHING_AGENT_REASONING,
	TEACHING_CONTROL_BINDINGS,
	TeachingAgentSession,
	type TeachingControlBinding,
	type TeachingSessionState,
} from "../index.js";

const RUNTIME_DIR = path.resolve(process.cwd(), ".runtime/ukmt-h6-web");

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

const SIMULATED_ATTEMPTS: readonly string[] = [
	[
		"I started with n = 3 and n = 5 sketches.",
		"I suspect parity matters because the centre is one colour on a checkerboard.",
		"I am not sure how the 'middle of three uncleared cells' condition limits future moves.",
	].join("\n"),
	[
		"I now think every legal move must keep some nearby pair uncleared.",
		"Maybe I should classify a move by whether it is horizontal-middle or vertical-middle.",
		"I still cannot see a clean lower bound for when no moves remain.",
	].join("\n"),
];

export type UkmtH6ApiState = {
	readonly state: TeachingSessionState;
	readonly busy: boolean;
	readonly model: string;
	readonly reasoningEffort: "low" | "medium" | "high" | "xhigh";
	readonly controls: readonly TeachingControlBinding[];
};

let session: TeachingAgentSession | null = null;
let initialized = false;
let busy = false;
let simulatedAttemptIndex = 0;

function createSession(): TeachingAgentSession {
	return new TeachingAgentSession({
		cwd: RUNTIME_DIR,
		model: DEFAULT_TEACHING_AGENT_MODEL,
		reasoningEffort: DEFAULT_TEACHING_AGENT_REASONING,
		maxSteps: 12,
		turnTimeoutMs: 150_000,
	});
}

async function ensureInitialized(): Promise<TeachingAgentSession> {
	if (!session) {
		session = createSession();
	}
	if (!initialized) {
		await session.initialize({
			problemStatement: PROBLEM_STATEMENT,
			prompt: PROMPT_TEXT,
		});
		initialized = true;
		simulatedAttemptIndex = 0;
	}
	return session;
}

async function readApiState(): Promise<UkmtH6ApiState> {
	const active = await ensureInitialized();
	return {
		state: await active.readState(),
		busy,
		model: DEFAULT_TEACHING_AGENT_MODEL,
		reasoningEffort: DEFAULT_TEACHING_AGENT_REASONING,
		controls: TEACHING_CONTROL_BINDINGS,
	};
}

export async function getUkmtH6State(): Promise<UkmtH6ApiState> {
	return readApiState();
}

export async function resetUkmtH6Session(): Promise<UkmtH6ApiState> {
	if (busy) {
		throw new Error("Teacher is currently generating guidance. Please wait.");
	}
	await rm(RUNTIME_DIR, { recursive: true, force: true });
	session = createSession();
	initialized = false;
	return readApiState();
}

export async function setUkmtH6StudentAttempt(studentAttempt: string): Promise<UkmtH6ApiState> {
	if (busy) {
		throw new Error("Cannot edit the student attempt while teacher guidance is running.");
	}
	const active = await ensureInitialized();
	await active.setStudentAttempt(studentAttempt);
	return readApiState();
}

export async function simulateUkmtH6StudentAttempt(): Promise<UkmtH6ApiState> {
	if (busy) {
		throw new Error("Cannot simulate a student attempt while teacher guidance is running.");
	}
	const active = await ensureInitialized();
	const attempt = SIMULATED_ATTEMPTS[simulatedAttemptIndex % SIMULATED_ATTEMPTS.length];
	simulatedAttemptIndex += 1;
	await active.setStudentAttempt(attempt);
	return readApiState();
}

export async function runUkmtH6TeacherTurn(): Promise<UkmtH6ApiState> {
	if (busy) {
		throw new Error("Teacher is already working. Please wait for completion.");
	}
	const active = await ensureInitialized();
	busy = true;
	try {
		await active.runTeacherTurn();
		return await readApiState();
	} finally {
		busy = false;
	}
}
