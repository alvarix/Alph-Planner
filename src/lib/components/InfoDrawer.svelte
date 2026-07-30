<script lang="ts">
	import { fly } from 'svelte/transition';
	import { appState, recordChange } from '$lib/state.svelte.js';
	import type { ChangeEntry } from '$lib/types.js';

	let {
		hidePast,
		colonCatEnabled,
		vaultName,
		isRefreshing,
		onclose,
		ontoggleHidePast,
		ontoggleColon,
		onsync,
		onchangeFolder,
		onstartEditVault,
		onapplyVault,
		onvaultInputKeydown,
		onvaultInputBlur,
		editingVault,
	}: {
		hidePast: boolean;
		colonCatEnabled: boolean;
		vaultName: string;
		isRefreshing: boolean;
		onclose: () => void;
		ontoggleHidePast: () => void;
		ontoggleColon: () => void;
		onsync: () => void;
		onchangeFolder: () => void;
		onstartEditVault: () => void;
		onapplyVault: () => void;
		onvaultInputKeydown: (e: KeyboardEvent) => void;
		onvaultInputBlur: () => void;
		editingVault: boolean;
	} = $props();

	let vaultInputEl: HTMLInputElement | undefined = $state();

	// Auto-focus the vault input when editing starts.
	$effect(() => { if (editingVault) vaultInputEl?.focus(); });

	type Tab = 'info' | 'options' | 'history';
	let activeTab: Tab = $state('info');

	const changeLog: ChangeEntry[] = $derived(appState.changeLog);

	function formatTime(d: Date): string {
		const h = d.getHours().toString().padStart(2, '0');
		const m = d.getMinutes().toString().padStart(2, '0');
		return `${h}:${m}`;
	}

	function formatDateLabel(d: Date): string {
		const today = new Date();
		const yesterday = new Date(today);
		yesterday.setDate(yesterday.getDate() - 1);
		if (d.toDateString() === today.toDateString()) return 'Today';
		if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
		return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
	}

	/** Unregister all service workers, clear caches, IndexedDB, and localStorage, then reload. */
	async function deregisterAndClear() {
		// Clear localStorage (fold state, UI prefs, FS handle key reference).
		localStorage.clear();

		// Clear all IndexedDB databases.
		if (window.indexedDB?.databases) {
			try {
				const dbs = await window.indexedDB.databases();
				for (const db of dbs) {
					if (db.name) window.indexedDB.deleteDatabase(db.name);
				}
			} catch { /* some browsers don't support databases() */ }
		}

		// Clear all cache storage.
		if ('caches' in window) {
			try {
				const keys = await caches.keys();
				for (const key of keys) await caches.delete(key);
			} catch { /* ignore */ }
		}

		// Unregister all service workers.
		if ('serviceWorker' in navigator) {
			try {
				const regs = await navigator.serviceWorker.getRegistrations();
				for (const reg of regs) await reg.unregister();
			} catch { /* ignore */ }
		}

		// Reload to pick up the fresh deployment.
		window.location.reload();
	}

	/** Group change log entries by date for section headers. */
	const groupedChanges = $derived.by(() => {
		const groups: { label: string; entries: ChangeEntry[] }[] = [];
		let currentLabel = '';
		for (const entry of changeLog) {
			const label = formatDateLabel(entry.timestamp);
			if (label !== currentLabel) {
				currentLabel = label;
				groups.push({ label, entries: [] });
			}
			groups[groups.length - 1].entries.push(entry);
		}
		return groups;
	});
</script>

<div id="info-drawer" transition:fly={{ x: 320, duration: 220, opacity: 1 }}>
	<div class="drawer-header">
		<span class="drawer-title">
			{#if activeTab === 'info'}About Alph-Planner
			{:else if activeTab === 'options'}Options
			{:else}History
			{/if}
		</span>
		<button class="drawer-close" onclick={onclose} aria-label="Close info drawer">&#x2715;</button>
	</div>

	<!-- Tabs -->
	<div class="tab-bar">
		<button class="tab" class:active={activeTab === 'info'} onclick={() => (activeTab = 'info')}>Info</button>
		<button class="tab" class:active={activeTab === 'options'} onclick={() => (activeTab = 'options')}>Options</button>
		<button class="tab" class:active={activeTab === 'history'} onclick={() => (activeTab = 'history')}>
			History
			{#if changeLog.length > 0}
				<span class="tab-badge">{changeLog.length}</span>
			{/if}
		</button>
	</div>

	<div class="drawer-body">
		<!-- ─── Info Tab ─────────────────────────────────────── -->
		{#if activeTab === 'info'}
			<div class="info-section">
				<h2>What is Alph-Planner?</h2>
				<p>
					Alph-Planner is a <strong>local-first weekly task planner</strong> that reads and writes
					plain Markdown files on your computer. There is no database, no backend server, and no
					cloud sync &mdash; your <code>.md</code> files are the only source of truth.
					Open them in Obsidian or any text editor alongside the app.
				</p>
			</div>

			<div class="info-section">
				<h2>Header buttons</h2>
				<dl class="button-guide">
					<dt><span class="key">&#8592; &#8594;</span></dt>
					<dd>Navigate to the previous or next week.</dd>

					<dt><span class="key">Today</span></dt>
					<dd>Jump back to the current week. The column for today is highlighted with a crimson marker.</dd>

					<dt><span class="key">Upcoming</span></dt>
					<dd>Hide days that have already passed. Toggle on to show only today and future days.</dd>

					<dt><span class="key">Colon</span></dt>
					<dd>Enable the colon shortcut. Type <code>PP: task name</code> in a day's input to auto-create
					a <code># PP</code> category header and add the task under it.</dd>

					<dt><span class="key">Done log</span></dt>
					<dd>Open a bottom drawer showing all completed tasks from the last 30 days, grouped by date.</dd>

					<dt><span class="key">Sync</span></dt>
					<dd>Re-read all files from disk. Use this after editing files in Obsidian or another editor
					to pull in external changes.</dd>

					<dt><span class="key">Change folder</span></dt>
					<dd>Pick a different daily-notes folder or reconnect after a permission loss. The folder badge
					in the header shows the current folder name.</dd>
				</dl>
			</div>

			<div class="info-section">
				<h2>Features</h2>
				<dl class="button-guide">
					<dt>Task management</dt>
					<dd>Checkbox tri-state cycle: <code>[ ]</code> &rarr; <code>[-]</code> (in-progress) &rarr; <code>[x]</code> (done).
					Completing a task has a 3-second undo window. Long-press a checkbox to complete immediately.</dd>

					<dt>Subtasks</dt>
					<dd>Click the <strong>+</strong> button on any task to add a child subtask. Toggling children
					propagates status upward: any active child makes the parent in-progress; all children done
					completes the parent.</dd>

					<dt>Categories</dt>
					<dd>Tasks are grouped under <code># Category Name</code> H1 headers. Add categories via the
					input at the bottom of each column. Drag categories to reorder them.</dd>

					<dt>Drag &amp; drop</dt>
					<dd>Drag tasks between days, between categories, and within a column to reorder. Drag from the
					backlog rail to schedule a task. Cross-file moves are atomic (target-first, rollback on failure).</dd>

					<dt>Star &amp; duration</dt>
					<dd>Star a task to make it bold (<code>**title**</code>). Set a duration estimate like <code>1h</code>
					or <code>30m</code>. Both are stored directly in the Markdown line.</dd>

					<dt>Notes</dt>
					<dd>Each day can have free-form notes stored below a <code>---</code> divider in the file.
					Click the notes icon on any day column to open the notes popover.</dd>

					<dt>Defaults (recurring tasks)</dt>
					<dd>Create a <code>Defaults.md</code> file in your folder with weekly or monthly recurring tasks.
					The app auto-inserts them into new day files on first load.</dd>

					<dt>Keyboard shortcut</dt>
					<dd>Press <code>n</code> anywhere to jump to today's task input. Press <code>Enter</code> to submit.</dd>

					<dt>iCloud conflict detection</dt>
					<dd>Files matching <code>*(conflict copy).md</code> are surfaced in the header with a warning badge.</dd>
				</dl>
			</div>

			<div class="info-section">
				<h2>File format</h2>
				<p>
					Each day is a single <code>YYYY-MM-DD.md</code> file. Tasks are standard Markdown list items:
				</p>
				<pre class="md-sample"># Work
- [ ] **ship invoice** 1h
  - [x] gather receipts
  - [ ] send email
- [-] review PR

# Personal
- [x] grocery run 30m

---
Free-form notes go here.</pre>
				<p class="footnote">
					The serializer is line-preserving: only the explicitly changed line is modified.
					Everything else (prose, frontmatter, blank lines) passes through untouched.
				</p>
			</div>

		<!-- ─── Options Tab ──────────────────────────────────── -->
		{:else if activeTab === 'options'}
			<div class="options-list">
				<label class="opt-row">
					<span class="opt-label">
						<span class="opt-title">Hide past days</span>
						<span class="opt-desc">Show only today and future days in the week view.</span>
					</span>
					<button
						class="toggle"
						class:on={hidePast}
						onclick={ontoggleHidePast}
						role="switch"
						aria-checked={hidePast}
						aria-label="Hide past days"
					>
						<span class="toggle-knob"></span>
					</button>
				</label>

				<label class="opt-row">
					<span class="opt-label">
						<span class="opt-title">Colon shortcut</span>
						<span class="opt-desc">Type <code>PP: task</code> to auto-create a category and add the task under it.</span>
					</span>
					<button
						class="toggle"
						class:on={colonCatEnabled}
						onclick={ontoggleColon}
						role="switch"
						aria-checked={colonCatEnabled}
						aria-label="Colon shortcut"
					>
						<span class="toggle-knob"></span>
					</button>
				</label>

				<hr class="opt-divider" />

				<button class="opt-btn" disabled={isRefreshing} onclick={onsync}>
					Sync now
					<span class="opt-btn-desc">Re-read all files from disk</span>
				</button>

				<button class="opt-btn" onclick={onchangeFolder}>
					Change folder
					<span class="opt-btn-desc">
						{#if appState.folder.status === 'ready'}
							Current: {appState.folder.name}/
						{:else}
							Pick a daily-notes folder
						{/if}
					</span>
				</button>

				{#if appState.folder.status === 'needs-permission'}
					<button class="opt-btn warn" onclick={onchangeFolder}>
						Reconnect folder
						<span class="opt-btn-desc">Permission was lost or revoked</span>
					</button>
				{/if}

				<hr class="opt-divider" />

				<div class="opt-row">
					<span class="opt-label">
						<span class="opt-title">Obsidian vault</span>
						<span class="opt-desc">Set a vault name for Obsidian interop (used in wiki links).</span>
					</span>
					{#if editingVault}
						<input
							bind:this={vaultInputEl}
							value={vaultName}
							class="opt-vault-input"
							placeholder={appState.folder.status === 'ready' ? appState.folder.name : 'vault name'}
							onkeydown={onvaultInputKeydown}
							onblur={onvaultInputBlur}
						/>
					{:else}
						<button class="opt-vault-badge" onclick={onstartEditVault}>
							{vaultName || 'set vault'}
						</button>
					{/if}
				</div>

				{#if appState.conflicts.length > 0}
					<div class="opt-conflict">
						&#9888; {appState.conflicts.length} conflict file{appState.conflicts.length > 1 ? 's' : ''}:
						<ul>
							{#each appState.conflicts as c}
								<li>{c}</li>
							{/each}
						</ul>
					</div>
				{/if}

				<hr class="opt-divider" />

				<button class="opt-btn warn" onclick={deregisterAndClear}>
					Clear cache &amp; reload
					<span class="opt-btn-desc">Deregister service worker, clear all site data, and reload. Use when the app seems stale after a deploy.</span>
				</button>
			</div>

		<!-- ─── History Tab ──────────────────────────────────── -->
		{:else if activeTab === 'history'}
			<div class="history-list">
				{#if changeLog.length === 0}
					<div class="history-empty">No changes recorded yet. Start adding or completing tasks to see your history.</div>
				{:else}
					{#each groupedChanges as group (group.label)}
						<div class="history-group">
							<div class="history-date">{group.label}</div>
							{#each group.entries as entry (entry.timestamp.getTime() + entry.detail)}
								<div class="history-entry">
									<div class="git-graph">
										<span class="git-dot">{entry.icon}</span>
									</div>
									<div class="git-body">
										<span class="git-time">{formatTime(entry.timestamp)}</span>
										<span class="git-action">{entry.action}</span>
										<span class="git-detail">{entry.detail}</span>
										<span class="git-file">{entry.file}</span>
									</div>
								</div>
							{/each}
						</div>
					{/each}
				{/if}
			</div>
		{/if}
	</div>
</div>

<style>
#info-drawer {
	position: fixed; top: 0; right: 0; bottom: 0; z-index: 60;
	width: 340px; max-width: calc(100vw - 40px);
	display: flex; flex-direction: column;
	background: #fff;
	border-left: 1px solid var(--border);
	box-shadow: -6px 0 24px rgba(0,0,0,.06);
}

.drawer-header {
	display: flex; align-items: center; gap: 8px;
	padding: 0 14px; height: 38px; flex-shrink: 0;
	border-bottom: 1px solid var(--border);
}
.drawer-title {
	font-size: 12px; font-weight: 700; text-transform: uppercase;
	letter-spacing: .5px; color: var(--text-subtle);
}
.drawer-close {
	margin-left: auto;
	background: none; border: none; cursor: pointer;
	color: var(--text-muted); font-size: 13px; padding: 4px 6px; line-height: 1;
	border-radius: 4px;
}
.drawer-close:hover { background: var(--surface-muted); color: var(--text); }

/* Tabs */
.tab-bar {
	display: flex; flex-shrink: 0;
	border-bottom: 1px solid var(--border);
}
.tab {
	flex: 1; padding: 7px 0 5px;
	background: none; border: none; border-bottom: 2px solid transparent;
	font-size: 11px; font-weight: 600; color: var(--text-muted); cursor: pointer;
	transition: border-color .15s, color .15s;
	display: flex; align-items: center; justify-content: center; gap: 5px;
}
.tab:hover { color: var(--text-subtle); }
.tab.active { color: var(--text); border-bottom-color: var(--text); }
.tab-badge {
	font-size: 9px; background: var(--surface-em); color: var(--text-subtle);
	padding: 1px 6px; border-radius: 99px; font-weight: 700; line-height: 1.4;
}

.drawer-body { flex: 1; overflow-y: auto; }

/* Info tab */
.info-section {
	padding: 14px 14px 10px;
	border-bottom: 1px solid var(--surface-muted);
}
.info-section:last-child { border-bottom: none; }
.info-section h2 {
	font-size: 12px; font-weight: 700; color: var(--text-subtle);
	margin-bottom: 6px; text-transform: uppercase; letter-spacing: .4px;
}
.info-section p {
	font-size: 12px; line-height: 1.55; color: var(--text-mid);
	margin-bottom: 6px;
}
.info-section p:last-child { margin-bottom: 0; }
.info-section code {
	font-size: 11px; background: var(--surface-muted); color: var(--text-dark);
	padding: 1px 5px; border-radius: 3px; font-family: 'SF Mono', 'Menlo', monospace;
}
.footnote {
	font-size: 11px; color: var(--text-muted); font-style: italic;
}

.button-guide { margin: 0; }
.button-guide dt {
	font-size: 11px; font-weight: 600; color: var(--text-dark);
	margin-top: 8px;
}
.button-guide dt:first-child { margin-top: 0; }
.button-guide dd {
	font-size: 11px; color: var(--text-mid); line-height: 1.5;
	margin: 2px 0 0 0;
}
.key {
	display: inline-block;
	font-size: 10px; font-weight: 600; color: var(--text-subtle);
	background: var(--surface-muted); border: 1px solid var(--border);
	padding: 1px 7px; border-radius: 4px;
}

.md-sample {
	font-size: 11px; background: var(--surface-muted); color: var(--text-mid);
	padding: 10px 12px; border-radius: 5px; line-height: 1.5;
	overflow-x: auto; font-family: 'SF Mono', 'Menlo', monospace;
	margin: 6px 0 0;
}

/* Options tab */
.options-list { padding: 10px 14px; }

.opt-row {
	display: flex; align-items: center; justify-content: space-between; gap: 10px;
	padding: 8px 0;
}
.opt-label { flex: 1; min-width: 0; }
.opt-title { display: block; font-size: 12px; font-weight: 600; color: var(--text); }
.opt-desc { display: block; font-size: 11px; color: var(--text-muted); margin-top: 1px; }
.opt-desc code { font-size: 10px; background: var(--surface-muted); padding: 0 4px; border-radius: 2px; }

.opt-divider {
	border: none; border-top: 1px solid var(--surface-muted);
	margin: 8px 0;
}

.opt-btn {
	display: flex; flex-direction: column; align-items: flex-start; gap: 1px;
	width: 100%; padding: 8px 10px; margin: 2px 0;
	background: var(--surface-muted); border: 1px solid var(--border);
	border-radius: 6px; font-size: 12px; font-weight: 600; color: var(--text);
	cursor: pointer; text-align: left;
}
.opt-btn:hover { background: var(--surface-em); border-color: var(--border-mid); }
.opt-btn:disabled { opacity: .45; cursor: not-allowed; }
.opt-btn.warn { color: var(--crimson); border-color: var(--crimson); }
.opt-btn.warn:hover { background: var(--crimson); color: #fff; }
.opt-btn-desc { font-size: 10px; font-weight: 400; color: var(--text-muted); }

.opt-vault-badge {
	font-size: 11px; color: var(--text-muted); font-family: monospace;
	background: var(--surface-muted); border: 1px solid var(--border);
	padding: 3px 8px; border-radius: 5px; cursor: pointer; white-space: nowrap;
}
.opt-vault-badge:hover { color: var(--text); border-color: var(--border-mid); }
.opt-vault-input {
	font-size: 11px; font-family: monospace;
	background: #fff; border: 1px solid var(--border-input);
	padding: 3px 8px; border-radius: 5px; width: 110px; outline: none;
	color: var(--text);
}

.opt-conflict {
	margin-top: 10px; padding: 8px 10px;
	background: var(--surface-muted); border: 1px solid var(--bar-border-strong);
	border-radius: 6px; font-size: 11px; color: var(--text-mid);
}
.opt-conflict ul { margin: 4px 0 0 16px; }
.opt-conflict li { font-size: 10px; color: var(--text-muted); font-family: monospace; }

/* Toggle switch */
.toggle {
	position: relative; width: 36px; height: 20px; flex-shrink: 0;
	background: var(--surface-em); border: 1px solid var(--border-mid);
	border-radius: 99px; cursor: pointer; padding: 0; transition: background .15s;
}
.toggle.on { background: var(--text); border-color: var(--text); }
.toggle-knob {
	position: absolute; top: 2px; left: 2px;
	width: 14px; height: 14px; border-radius: 50%;
	background: #fff; transition: transform .15s; box-shadow: 0 1px 2px rgba(0,0,0,.15);
}
.toggle.on .toggle-knob { transform: translateX(16px); }

/* History tab */
.history-list { padding: 4px 0; }

.history-empty {
	padding: 24px 14px; font-size: 12px; color: var(--text-muted); font-style: italic; text-align: center;
}

.history-group { margin-bottom: 2px; }

.history-date {
	padding: 8px 14px 4px;
	font-size: 10px; font-weight: 700; text-transform: uppercase;
	letter-spacing: .5px; color: var(--text-muted); background: var(--bg);
	position: sticky; top: 0; z-index: 1;
}

.history-entry {
	display: flex; gap: 8px; padding: 5px 14px;
	border-top: 1px solid var(--surface-muted);
}

/* Git tree graph */
.git-graph {
	width: 16px; flex-shrink: 0; display: flex; align-items: flex-start; justify-content: center;
	padding-top: 2px;
}
.git-dot {
	font-size: 10px; line-height: 1; color: var(--text-subtle);
	width: 14px; height: 14px; display: flex; align-items: center; justify-content: center;
	background: var(--surface-muted); border-radius: 50%;
}

.git-body {
	flex: 1; min-width: 0; display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px;
}
.git-time {
	font-size: 10px; color: var(--text-faint); font-family: monospace; flex-shrink: 0;
}
.git-action {
	font-size: 10px; font-weight: 600; color: var(--text-muted); flex-shrink: 0;
}
.git-detail {
	font-size: 11px; color: var(--text); flex: 1; min-width: 0;
	white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.git-file {
	font-size: 9px; color: var(--text-faint); font-family: monospace;
	margin-left: auto; flex-shrink: 0; padding-left: 4px;
}
</style>
