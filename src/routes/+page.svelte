<script lang="ts">
	import { onDestroy, onMount } from "svelte";

	type TeachingState = {
		problemStatement: string;
		prompt: string;
		studentAttempt: string;
		teacherDirections: string;
		turn: number;
	};

	type ControlBinding = {
		controlId: string;
		file: string;
		owner: "host" | "student" | "agent";
		description: string;
	};

	type ApiState = {
		state: TeachingState;
		busy: boolean;
		model: string;
		reasoningEffort: string;
		controls: readonly ControlBinding[];
	};

	type ActionRequest =
		| { action: "reset" }
		| { action: "set-student-attempt"; studentAttempt: string }
		| { action: "simulate-student-attempt" }
		| { action: "run-teacher-turn" };

	type GuidanceView = {
		summary: string;
		bullets: string[];
	};

	let apiState: ApiState | null = null;
	let loading = true;
	let pendingAction = "";
	let infoMessage = "";
	let errorMessage = "";
	let draftAttempt = "";
	let lastKnownTurn = 0;
	let guidanceSection: HTMLElement | null = null;
	let resetArmed = false;
	let resetArmTimer: ReturnType<typeof setTimeout> | null = null;

	const isBusy = (): boolean => loading || pendingAction.length > 0 || apiState?.busy === true;
	const isTeacherRunning = (): boolean => pendingAction === "run-teacher-turn";

	$: runDisabledReason = (() => {
		if (loading) {
			return "Loading session...";
		}
		if (pendingAction.length > 0 || apiState?.busy === true) {
			return "Teacher is generating feedback. Please wait.";
		}
		if (draftAttempt.trim().length === 0) {
			return "Add a student attempt before running guidance.";
		}
		return "";
	})();

	$: guidanceView = (() => {
		if (!apiState) {
			return { summary: "", bullets: [] } satisfies GuidanceView;
		}
		const lines = apiState.state.teacherDirections
			.split("\n")
			.map((line) => line.trim())
			.filter((line) => line.length > 0);
		if (lines.length === 0) {
			return { summary: "No guidance yet.", bullets: [] } satisfies GuidanceView;
		}
		const [summary, ...tail] = lines;
		return {
			summary,
			bullets: tail.map((line) => line.replace(/^[-*]\s*/u, "")),
		} satisfies GuidanceView;
	})();

	$: if (apiState && apiState.state.turn > lastKnownTurn) {
		const isInitialLoad = lastKnownTurn === 0;
		lastKnownTurn = apiState.state.turn;
		if (!isInitialLoad) {
			guidanceSection?.scrollIntoView({ behavior: "smooth", block: "start" });
		}
	}

	function clearResetArm(): void {
		resetArmed = false;
		if (resetArmTimer) {
			clearTimeout(resetArmTimer);
			resetArmTimer = null;
		}
	}

	function armReset(): void {
		clearResetArm();
		resetArmed = true;
		infoMessage = "Press Reset Session again within 8 seconds to confirm.";
		resetArmTimer = setTimeout(() => {
			clearResetArm();
		}, 8000);
	}

	function applyApiState(nextState: ApiState): void {
		apiState = nextState;
		draftAttempt = nextState.state.studentAttempt;
	}

	async function requestState(): Promise<void> {
		const response = await fetch("/api/ukmt-h6");
		const data = await response.json();
		if (!response.ok) {
			throw new Error(data.error ?? "Failed to load session state");
		}
		applyApiState(data as ApiState);
	}

	async function performAction(action: ActionRequest): Promise<void> {
		pendingAction = action.action;
		infoMessage = "";
		errorMessage = "";
		clearResetArm();
		try {
			const response = await fetch("/api/ukmt-h6", {
				method: "POST",
				headers: {
					"content-type": "application/json",
				},
				body: JSON.stringify(action),
			});
			const data = await response.json();
			if (!response.ok) {
				throw new Error(data.error ?? "Action failed");
			}
			applyApiState(data as ApiState);
			if (action.action === "run-teacher-turn") {
				infoMessage = "New Socratic guidance is ready.";
			}
			if (action.action === "simulate-student-attempt") {
				infoMessage = "Loaded a simulated student attempt.";
			}
			if (action.action === "set-student-attempt") {
				infoMessage = "Student attempt saved.";
			}
			if (action.action === "reset") {
				infoMessage = "Session reset.";
			}
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : "Unexpected failure";
		} finally {
			pendingAction = "";
		}
	}

	async function handleSaveAttempt(): Promise<void> {
		await performAction({ action: "set-student-attempt", studentAttempt: draftAttempt });
	}

	async function handleSimulateAttempt(): Promise<void> {
		await performAction({ action: "simulate-student-attempt" });
	}

	async function handleRunTeacher(): Promise<void> {
		if (draftAttempt.trim().length === 0) {
			errorMessage = "Please add a student attempt before running Socratic guidance.";
			return;
		}
		await performAction({ action: "run-teacher-turn" });
	}

	async function handleResetSession(): Promise<void> {
		if (isBusy()) {
			return;
		}
		if (!resetArmed) {
			armReset();
			return;
		}
		await performAction({ action: "reset" });
	}

	onMount(async () => {
		loading = true;
		errorMessage = "";
		try {
			await requestState();
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : "Failed to initialize page";
		} finally {
			loading = false;
		}
	});

	onDestroy(() => {
		clearResetArm();
	});
</script>

<main class="app-shell" data-testid="app-ready" data-ready={!loading && apiState !== null}>
	<header class="hero">
		<p class="kicker">Interactive filesystem UI for agentic tutoring</p>
		<h1>UKMT Hamilton H6 Socratic Coach</h1>
		<p class="subhead">
			Guide a student incrementally. The agent edits file-backed controls so updates remain partial,
			reproducible, and fast.
		</p>
		{#if apiState}
			<div class="meta-row" aria-label="session metadata">
				<span class="chip">Model {apiState.model}</span>
				<span class="chip">Reasoning {apiState.reasoningEffort}</span>
				<span class="chip">Turn <strong data-testid="turn-value">{apiState.state.turn}</strong></span>
			</div>
		{/if}
	</header>

	{#if loading}
		<p class="feedback-panel">Loading teaching session...</p>
	{:else if !apiState}
		<p class="feedback-panel error">Session unavailable.</p>
	{:else}
		<section class="step-card">
			<div class="step-header">
				<p class="step-id">Step 1</p>
				<h2>Review Context</h2>
			</div>
			<div class="context-grid">
				<details class="context-panel">
					<summary>Hamilton Olympiad Problem</summary>
					<pre>{apiState.state.problemStatement}</pre>
				</details>
				<article class="context-panel prompt-panel">
					<h3>Prompt To Student</h3>
					<pre>{apiState.state.prompt}</pre>
				</article>
			</div>
		</section>

		<section class="step-card">
			<div class="step-header">
				<p class="step-id">Step 2</p>
				<h2>Write Student Attempt</h2>
			</div>
			<label class="visually-hidden" for="student-attempt">Student attempt</label>
			<textarea
				id="student-attempt"
				bind:value={draftAttempt}
				rows="9"
				placeholder="Write a student attempt, then run Socratic guidance."
			></textarea>
			<p class="assistive">{runDisabledReason || "Ready to run guidance."}</p>

			<div class="utility-actions" role="group" aria-label="student attempt helpers">
				<button
					data-testid="save-attempt"
					type="button"
					on:click={handleSaveAttempt}
					disabled={isBusy()}
				>
					Save Attempt
				</button>
				<button
					data-testid="simulate-attempt"
					type="button"
					on:click={handleSimulateAttempt}
					disabled={isBusy()}
				>
					Simulate Student
				</button>
				<button
					data-testid="reset-session"
					type="button"
					class={resetArmed ? "ghost-danger armed" : "ghost-danger"}
					on:click={handleResetSession}
					disabled={isBusy()}
				>
					{resetArmed ? "Confirm Reset" : "Reset Session"}
				</button>
			</div>

			<div class="primary-row">
				<button
					data-testid="run-teacher"
					type="button"
					class="primary-run"
					on:click={handleRunTeacher}
					disabled={isBusy() || draftAttempt.trim().length === 0}
				>
					{#if isTeacherRunning()}
						<span class="spinner button-spinner" aria-hidden="true"></span>
						Running Guidance...
					{:else}
						Run Socratic Guidance
					{/if}
				</button>
			</div>

			<div class="feedback-stack" aria-live="polite">
				{#if pendingAction}
					<p class="feedback-panel busy" data-testid="agent-status" role="status">
						<span class="spinner" aria-hidden="true"></span>
						Working on {pendingAction}...
					</p>
				{/if}
				{#if infoMessage}
					<p class="feedback-panel success" data-testid="agent-status" role="status">{infoMessage}</p>
				{/if}
				{#if errorMessage}
					<p class="feedback-panel error" role="alert">{errorMessage}</p>
				{/if}
			</div>
		</section>

		<section class="step-card guidance-step" bind:this={guidanceSection}>
			<div class="step-header">
				<p class="step-id">Step 3</p>
				<h2>Socratic Directions</h2>
			</div>
			<article class="guidance-view" data-testid="teacher-directions">
				<p class="guidance-summary">{guidanceView.summary}</p>
				{#if guidanceView.bullets.length > 0}
					<ul>
						{#each guidanceView.bullets as bullet}
							<li>{bullet}</li>
						{/each}
					</ul>
				{/if}
			</article>
		</section>

		<details class="dev-details">
			<summary>Developer Details: Filesystem Control Map</summary>
			<ul>
				{#each apiState.controls as control}
					<li>
						<strong>{control.controlId}</strong>
						<span class="arrow">-></span>
						<code>{control.file}</code>
						<span class="owner">({control.owner})</span>
					</li>
				{/each}
			</ul>
		</details>
	{/if}
</main>

<style>
	:global(body) {
		margin: 0;
		font-family: "Avenir Next", "Segoe UI", sans-serif;
		font-size: 17px;
		line-height: 1.55;
		background:
			radial-gradient(circle at 12% 6%, rgba(255, 255, 255, 0.92), transparent 34%),
			linear-gradient(162deg, #edf5fa 0%, #d8e8f3 53%, #c9dceb 100%);
		color: #0d2a39;
	}

	.app-shell {
		max-width: 1080px;
		margin: 0 auto;
		padding: 1.3rem 1rem 4.2rem;
		display: grid;
		gap: 1rem;
	}

	.hero {
		background: rgba(251, 254, 255, 0.94);
		border: 1px solid #a9c4d8;
		border-radius: 20px;
		padding: 1.2rem 1.15rem 1.08rem;
		box-shadow: 0 12px 28px rgba(16, 58, 82, 0.1);
	}

	.kicker {
		margin: 0;
		font-size: 0.84rem;
		font-weight: 820;
		text-transform: uppercase;
		letter-spacing: 0.07em;
		color: #1e4f67;
	}

	h1 {
		margin: 0.4rem 0 0;
		font-size: clamp(2.12rem, 3.8vw, 3.05rem);
		line-height: 1.08;
		color: #0f3042;
	}

	.subhead {
		margin: 0.62rem 0 0;
		font-size: 1.06rem;
		max-width: 76ch;
		color: #244f65;
	}

	.meta-row {
		margin-top: 0.95rem;
		display: flex;
		flex-wrap: wrap;
		gap: 0.6rem;
	}

	.chip {
		display: inline-flex;
		align-items: center;
		gap: 0.34rem;
		padding: 0.56rem 0.9rem;
		font-size: 0.94rem;
		font-weight: 760;
		background: #d1e5f2;
		border: 1px solid #8db6d0;
		color: #123c51;
		border-radius: 999px;
	}

	.step-card {
		background: rgba(251, 254, 255, 0.95);
		border: 1px solid #b2cadb;
		border-radius: 18px;
		padding: 1.02rem;
		box-shadow: 0 10px 24px rgba(17, 59, 81, 0.08);
	}

	.step-header {
		display: flex;
		gap: 0.7rem;
		align-items: baseline;
		margin-bottom: 0.78rem;
	}

	.step-id {
		margin: 0;
		font-size: 0.84rem;
		font-weight: 850;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: #245b74;
	}

	h2 {
		margin: 0;
		font-size: 1.38rem;
		line-height: 1.15;
		color: #0f3547;
	}

	h3 {
		margin: 0 0 0.6rem;
		font-size: 1.12rem;
		color: #144356;
	}

	.context-grid {
		display: grid;
		grid-template-columns: 1.2fr 1fr;
		gap: 0.82rem;
	}

	.context-panel {
		margin: 0;
		padding: 0.9rem;
		border-radius: 14px;
		border: 1px solid #bed5e4;
		background: #f7fcff;
	}

	.context-panel summary {
		cursor: pointer;
		font-weight: 790;
		color: #17465a;
		margin-bottom: 0.62rem;
	}

	.prompt-panel {
		background: #edf5fc;
	}

	pre {
		margin: 0;
		font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
		font-size: 1.04rem;
		line-height: 1.58;
		white-space: pre-wrap;
		color: #12384c;
	}

	textarea {
		width: 100%;
		box-sizing: border-box;
		border-radius: 14px;
		border: 1px solid #6e9ab6;
		padding: 0.98rem;
		font: inherit;
		font-size: 1.04rem;
		line-height: 1.55;
		background: #ffffff;
		min-height: 230px;
		color: #103247;
	}

	textarea:focus-visible,
	button:focus-visible,
	details summary:focus-visible {
		outline: 3px solid #1488bb;
		outline-offset: 2px;
	}

	.assistive {
		margin: 0.64rem 0 0;
		font-size: 0.98rem;
		font-weight: 680;
		color: #225a73;
	}

	.utility-actions {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0.58rem;
		margin-top: 0.82rem;
	}

	button {
		min-height: 48px;
		padding: 0.68rem 0.86rem;
		border-radius: 12px;
		border: 1px solid #729fbb;
		background: #eff7fc;
		font-size: 1rem;
		font-weight: 760;
		color: #0f3850;
		cursor: pointer;
	}

	button:disabled {
		opacity: 1;
		background: #dfeaf3;
		border-color: #a0bdd1;
		color: #496980;
		cursor: not-allowed;
	}

	.ghost-danger {
		background: #fff4f5;
		border-color: #cf9eab;
		color: #7d253e;
	}

	.ghost-danger.armed {
		background: #ffe8ec;
		border-color: #bd6078;
		color: #65132c;
	}

	.primary-row {
		margin-top: 0.78rem;
	}

	.primary-run {
		width: 100%;
		min-height: 54px;
		background: #0f789f;
		border-color: #0a5f7e;
		color: #f7fdff;
		font-size: 1.03rem;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
	}

	.feedback-stack {
		margin-top: 0.78rem;
		display: grid;
		gap: 0.45rem;
	}

	.feedback-panel {
		margin: 0;
		padding: 0.7rem 0.84rem;
		border-radius: 12px;
		border: 1px solid #aac9dd;
		background: #e6f2fa;
		color: #10425b;
		font-size: 1rem;
		font-weight: 700;
		display: flex;
		align-items: center;
		gap: 0.56rem;
	}

	.feedback-panel.success {
		background: #e5f5eb;
		border-color: #9fceaf;
		color: #175a38;
	}

	.feedback-panel.error {
		background: #fcecf0;
		border-color: #deacb9;
		color: #7d223c;
	}

	.spinner {
		width: 17px;
		height: 17px;
		border-radius: 999px;
		border: 2px solid rgba(18, 96, 130, 0.28);
		border-top-color: #13719a;
		animation: spin 0.9s linear infinite;
	}

	.button-spinner {
		border-color: rgba(255, 255, 255, 0.4);
		border-top-color: #ffffff;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.guidance-step {
		background: #ecf5fc;
	}

	.guidance-view {
		border-radius: 14px;
		padding: 0.9rem;
		background: #f8fcff;
		border: 1px solid #b8d1e1;
	}

	.guidance-summary {
		margin: 0;
		font-size: 1.08rem;
		font-weight: 740;
		color: #113a4e;
	}

	.guidance-view ul {
		margin: 0.72rem 0 0;
		padding-left: 1.15rem;
		display: grid;
		gap: 0.56rem;
		font-size: 1.03rem;
		line-height: 1.55;
		color: #184458;
	}

	.dev-details {
		background: rgba(238, 246, 252, 0.94);
		border: 1px solid #b6cede;
		border-radius: 14px;
		padding: 0.8rem 0.9rem;
	}

	.dev-details summary {
		cursor: pointer;
		font-weight: 760;
		color: #1d4d63;
	}

	.dev-details ul {
		margin: 0.76rem 0 0;
		padding-left: 1rem;
		display: grid;
		gap: 0.47rem;
	}

	.arrow,
	.owner {
		color: #47697c;
	}

	.visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}

	@media (max-width: 940px) {
		.context-grid {
			grid-template-columns: 1fr;
		}
	}

	@media (max-width: 700px) {
		:global(body) {
			font-size: 18px;
		}

		.app-shell {
			padding: 1rem 0.9rem 4.6rem;
		}

		h1 {
			font-size: 2rem;
		}

		.chip {
			font-size: 0.96rem;
			padding: 0.58rem 0.92rem;
		}

		.utility-actions {
			grid-template-columns: 1fr;
		}

		button {
			min-height: 50px;
			font-size: 1.02rem;
		}

		.primary-run {
			min-height: 56px;
		}
	}
</style>
