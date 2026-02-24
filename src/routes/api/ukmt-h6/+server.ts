import { json } from "@sveltejs/kit";

import {
	getUkmtH6State,
	resetUkmtH6Session,
	runUkmtH6TeacherTurn,
	setUkmtH6StudentAttempt,
	simulateUkmtH6StudentAttempt,
} from "../../../lib/server/ukmt-h6-session.js";

type ActionRequest =
	| { readonly action: "reset" }
	| { readonly action: "set-student-attempt"; readonly studentAttempt: string }
	| { readonly action: "simulate-student-attempt" }
	| { readonly action: "run-teacher-turn" };

export async function GET() {
	try {
		return json(await getUkmtH6State());
	} catch (error) {
		const message = error instanceof Error ? error.message : "Failed to load state";
		return json({ error: message }, { status: 500 });
	}
}

export async function POST({ request }) {
	let body: ActionRequest;
	try {
		body = (await request.json()) as ActionRequest;
	} catch {
		return json({ error: "Invalid JSON payload" }, { status: 400 });
	}

	try {
		switch (body.action) {
			case "reset":
				return json(await resetUkmtH6Session());
			case "set-student-attempt":
				return json(await setUkmtH6StudentAttempt(body.studentAttempt ?? ""));
			case "simulate-student-attempt":
				return json(await simulateUkmtH6StudentAttempt());
			case "run-teacher-turn":
				return json(await runUkmtH6TeacherTurn());
			default:
				return json({ error: "Unknown action" }, { status: 400 });
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : "Request failed";
		const lowered = message.toLowerCase();
		const status = lowered.includes("already") || lowered.includes("currently") ? 409 : 500;
		return json({ error: message }, { status });
	}
}
