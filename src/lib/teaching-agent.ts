import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";

import type { AgentFilesystem } from "@ljoukov/llm";
import { runAgentLoop } from "@ljoukov/llm";

export const DEFAULT_TEACHING_AGENT_MODEL = "chatgpt-gpt-5.3-codex";
export const DEFAULT_TEACHING_AGENT_REASONING = "xhigh" as const;

export const TEACHING_SESSION_FILES = {
	problem: "problem.md",
	controlPrompt: "controls/prompt.md",
	controlStudentAttempt: "controls/student-attempt.md",
	controlTeacherDirections: "controls/teacher-directions.md",
	stateTeacherMemory: "state/teacher-memory.md",
	stateTurn: "state/turn.json",
} as const;

export type TeachingControlBinding = {
	readonly controlId: "prompt" | "studentAttempt" | "teacherDirections";
	readonly file: string;
	readonly owner: "host" | "student" | "agent";
	readonly description: string;
};

export const TEACHING_CONTROL_BINDINGS: readonly TeachingControlBinding[] = [
	{
		controlId: "prompt",
		file: TEACHING_SESSION_FILES.controlPrompt,
		owner: "host",
		description: "Gray top panel shown to student. Generic motivation only, no hints.",
	},
	{
		controlId: "studentAttempt",
		file: TEACHING_SESSION_FILES.controlStudentAttempt,
		owner: "student",
		description: "Editable student attempt text (normal tone).",
	},
	{
		controlId: "teacherDirections",
		file: TEACHING_SESSION_FILES.controlTeacherDirections,
		owner: "agent",
		description: "Gray Socratic guidance panel updated by the teaching agent.",
	},
];

export type TeachingSessionInit = {
	readonly problemStatement: string;
	readonly prompt: string;
	readonly initialTeacherDirections?: string;
};

export type TeachingSessionState = {
	readonly problemStatement: string;
	readonly prompt: string;
	readonly studentAttempt: string;
	readonly teacherDirections: string;
	readonly turn: number;
};

export type TeachingAgentSessionOptions = {
	readonly cwd: string;
	readonly fs?: AgentFilesystem;
	readonly model?: string;
	readonly reasoningEffort?: "low" | "medium" | "high" | "xhigh";
	readonly maxSteps?: number;
	readonly turnTimeoutMs?: number;
};

const DEFAULT_INITIAL_DIRECTIONS =
	"Write your first attempt in the student box. I will suggest directions without giving away the final proof.";

const DEFAULT_MAX_STEPS = 10;
const DEFAULT_TURN_TIMEOUT_MS = 120_000;

function withGray(value: string): string {
	return `\x1b[90m${value}\x1b[0m`;
}

function stripTrailing(value: string): string {
	return value.replace(/\s+$/u, "");
}

function parseTurnJson(raw: string): number {
	try {
		const parsed = JSON.parse(raw) as { turn?: unknown };
		if (typeof parsed.turn === "number" && Number.isFinite(parsed.turn) && parsed.turn >= 0) {
			return Math.floor(parsed.turn);
		}
		return 0;
	} catch {
		return 0;
	}
}

export class TeachingAgentSession {
	private readonly cwd: string;
	private readonly fsBackend?: AgentFilesystem;
	private readonly model: string;
	private readonly reasoningEffort: "low" | "medium" | "high" | "xhigh";
	private readonly maxSteps: number;
	private readonly turnTimeoutMs: number;

	constructor(options: TeachingAgentSessionOptions) {
		this.cwd = path.resolve(options.cwd);
		this.fsBackend = options.fs;
		this.model = options.model ?? DEFAULT_TEACHING_AGENT_MODEL;
		this.reasoningEffort = options.reasoningEffort ?? DEFAULT_TEACHING_AGENT_REASONING;
		this.maxSteps = options.maxSteps ?? DEFAULT_MAX_STEPS;
		this.turnTimeoutMs = options.turnTimeoutMs ?? DEFAULT_TURN_TIMEOUT_MS;
	}

	async initialize(input: TeachingSessionInit): Promise<void> {
		await this.ensureDirectory("controls");
		await this.ensureDirectory("state");

		await this.writeTextFile(TEACHING_SESSION_FILES.problem, `${stripTrailing(input.problemStatement)}\n`);
		await this.writeTextFile(TEACHING_SESSION_FILES.controlPrompt, `${stripTrailing(input.prompt)}\n`);
		await this.writeTextFile(TEACHING_SESSION_FILES.controlStudentAttempt, "");
		await this.writeTextFile(
			TEACHING_SESSION_FILES.controlTeacherDirections,
			`${stripTrailing(input.initialTeacherDirections ?? DEFAULT_INITIAL_DIRECTIONS)}\n`,
		);
		await this.writeTextFile(
			TEACHING_SESSION_FILES.stateTeacherMemory,
			[
				"# Teacher Memory",
				"",
				"- Keep feedback Socratic and non-revealing.",
				"- Ask targeted prompts tied to the student's current attempt.",
			].join("\n"),
		);
		await this.writeTextFile(TEACHING_SESSION_FILES.stateTurn, JSON.stringify({ turn: 0 }, null, 2) + "\n");
	}

	async setStudentAttempt(studentAttempt: string): Promise<void> {
		await this.writeTextFile(
			TEACHING_SESSION_FILES.controlStudentAttempt,
			`${stripTrailing(studentAttempt)}\n`,
		);
	}

	async readState(): Promise<TeachingSessionState> {
		const [problemStatement, prompt, studentAttempt, teacherDirections, rawTurn] = await Promise.all([
			this.readTextFile(TEACHING_SESSION_FILES.problem),
			this.readTextFile(TEACHING_SESSION_FILES.controlPrompt),
			this.readTextFile(TEACHING_SESSION_FILES.controlStudentAttempt),
			this.readTextFile(TEACHING_SESSION_FILES.controlTeacherDirections),
			this.readTextFile(TEACHING_SESSION_FILES.stateTurn),
		]);

		return {
			problemStatement: problemStatement.trim(),
			prompt: prompt.trim(),
			studentAttempt: studentAttempt.trim(),
			teacherDirections: teacherDirections.trim(),
			turn: parseTurnJson(rawTurn),
		};
	}

	async runTeacherTurn(): Promise<void> {
		const current = await this.readState();
		const nextTurn = current.turn + 1;
		const currentAttempt = current.studentAttempt || "(student attempt is currently blank)";
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), this.turnTimeoutMs);

		try {
			await runAgentLoop({
				model: this.model,
				openAiReasoningEffort: this.reasoningEffort,
				maxSteps: this.maxSteps,
				signal: controller.signal,
				input: [
					{
						role: "developer",
						content: [
							"You are a Socratic UKMT teaching agent.",
							"Read problem.md and controls/student-attempt.md.",
							"Then update only the following files:",
							"- controls/teacher-directions.md",
							"- state/teacher-memory.md",
							"- state/turn.json",
							"",
							"Rules:",
							"- Use apply_patch for edits when possible and keep edits minimal.",
							"- Do not reveal a full solution or final proof.",
							"- Write 3-5 short directional suggestions or questions.",
							"- Keep suggestions anchored to the student's latest attempt.",
							"- Keep tone calm, clear, and concise.",
							"- In state/turn.json set {\"turn\": <new integer>} only.",
						].join("\n"),
					},
					{
						role: "user",
						content: [
							`Current turn: ${current.turn}`,
							`Target new turn value: ${nextTurn}`,
							"",
							"Update the teaching guidance now.",
							"",
							"Latest student attempt:",
							currentAttempt,
						].join("\n"),
					},
				],
				filesystemTool: {
					profile: "auto",
					options: {
						cwd: this.cwd,
						fs: this.fsBackend,
					},
				},
			});
		} catch (error) {
			if (controller.signal.aborted) {
				throw new Error(
					`Teaching agent turn timed out after ${this.turnTimeoutMs}ms. Last student attempt was saved.`,
				);
			}
			throw error;
		} finally {
			clearTimeout(timeout);
		}
	}

	async renderTextView(options?: { readonly color?: boolean }): Promise<string> {
		const state = await this.readState();
		const color = options?.color ?? true;
		const section = (label: string, value: string, gray: boolean): string => {
			if (!gray) {
				return `${label}\n${value || "(empty)"}`;
			}
			if (!color) {
				return `${label}\n${value || "(empty)"}`;
			}
			return `${withGray(label)}\n${withGray(value || "(empty)")}`;
		};

		return [
			section("Prompt", state.prompt, true),
			"",
			section("Student Attempt", state.studentAttempt, false),
			"",
			section("Socratic Directions", state.teacherDirections, true),
		].join("\n");
	}

	private resolvePath(relativePath: string): string {
		return path.resolve(this.cwd, relativePath);
	}

	private async ensureDirectory(relativePath: string): Promise<void> {
		const target = this.resolvePath(relativePath);
		if (this.fsBackend) {
			await this.fsBackend.ensureDir(target);
			return;
		}
		await mkdir(target, { recursive: true });
	}

	private async writeTextFile(relativePath: string, content: string): Promise<void> {
		const target = this.resolvePath(relativePath);
		if (this.fsBackend) {
			await this.fsBackend.ensureDir(path.dirname(target));
			await this.fsBackend.writeTextFile(target, content);
			return;
		}
		await mkdir(path.dirname(target), { recursive: true });
		await writeFile(target, content, "utf8");
	}

	private async readTextFile(relativePath: string): Promise<string> {
		const target = this.resolvePath(relativePath);
		if (this.fsBackend) {
			try {
				return await this.fsBackend.readTextFile(target);
			} catch {
				return "";
			}
		}
		try {
			return await readFile(target, "utf8");
		} catch {
			return "";
		}
	}
}
