<script>
    import { onMount, onDestroy, untrack } from 'svelte'
    import { createTaskBackend } from '../backends/index.js'
    import { settings } from '../settings-store.svelte.js'
    import { isChrome } from '../browser-detect.js'
    import AddTask from './AddTask.svelte'
    import {
        parseSmartDate,
        stripDateMatch,
        formatTaskDue,
    } from '../date-matcher.js'
    import { parseProjectMatch, stripProjectMatch } from '../project-matcher.js'

    let api = null
    let tasks = $state([])
    let availableProjects = $state([])
    let syncing = $state(true)
    let error = $state('')
    let initialLoad = $state(true)
    let previousToken = $state(null)
    let taskCount = $derived(tasks.filter((task) => !task.checked).length)
    let newTaskContent = $state('')
    let addingTask = $state(false)
    let togglingTasks = $state(new Set())

    // Derived project match
    let parsedProject = $derived(
        parseProjectMatch(newTaskContent, availableProjects)
    )

    // Derived date match - parse from text AFTER stripping project
    let parsedDate = $derived.by(() => {
        let textForDateParsing = newTaskContent

        // If there's a project match, strip it first
        if (parsedProject?.match) {
            textForDateParsing = stripProjectMatch(
                newTaskContent,
                parsedProject.match
            )
        }

        const dateResult = parseSmartDate(textForDateParsing, {
            dateFormat: settings.dateFormat,
        })

        // If we stripped a project and found a date, find where it is in the original text
        if (dateResult?.match && parsedProject?.match) {
            const dateText = textForDateParsing.slice(
                dateResult.match.start,
                dateResult.match.end
            )

            // Find this date text in the original, searching after the project match
            const searchStart = parsedProject.match.end
            const foundIndex = newTaskContent.indexOf(dateText, searchStart)

            if (foundIndex !== -1) {
                dateResult.match = {
                    start: foundIndex,
                    end: foundIndex + dateText.length,
                }
            } else {
                // Couldn't find date in original text, don't highlight it
                return null
            }
        }

        return dateResult
    })

    function handleVisibilityChange() {
        if (document.visibilityState === 'visible' && api) {
            loadTasks()
        }
    }

    $effect(() => {
        const backend = settings.taskBackend
        const token = settings.todoistApiToken
        const googleSignedIn = settings.googleTasksSignedIn

        if (untrack(() => initialLoad)) {
            initialLoad = false
            previousToken = token
            return
        }

        // Only clear Todoist data if the token changed (not the backend)
        const tokenChanged = backend === 'todoist' && previousToken !== token
        previousToken = token
        initializeAPI(backend, token, tokenChanged)
    })

    async function initializeAPI(backend, token, clearLocalData = false) {
        if (backend === 'todoist' && !token) {
            api = null
            tasks = []
            availableProjects = []
            syncing = false
            error = 'no todoist api token'
            return
        }

        if (backend === 'google-tasks' && !isChrome()) {
            api = null
            tasks = []
            availableProjects = []
            syncing = false
            error = 'google tasks only works in chrome'
            return
        }

        if (backend === 'google-tasks' && !settings.googleTasksSignedIn) {
            api = null
            tasks = []
            availableProjects = []
            syncing = false
            error = 'not signed in to google'
            return
        }

        try {
            if (backend === 'google-tasks') {
                api = createTaskBackend(backend)
            } else {
                api = createTaskBackend(backend, { token })
            }

            if (clearLocalData) {
                api.clearLocalData()
                tasks = []
                availableProjects = []
            }
            await loadTasks(true)
        } catch (err) {
            error = `failed to initialize ${backend} backend`
            console.error(err)
            syncing = false
        }
    }

    async function loadTasks(showSyncing = false) {
        try {
            if (showSyncing) syncing = true
            error = ''
            await api.sync()
            tasks = api.getTasks()

            // Update available projects/lists
            if (settings.taskBackend === 'todoist') {
                availableProjects = (api.data?.projects || []).map((p) => ({
                    id: p.id,
                    name: p.name,
                }))
            } else if (settings.taskBackend === 'google-tasks') {
                availableProjects = (api.data?.tasklists || []).map((tl) => ({
                    id: tl.id,
                    name: tl.title,
                }))
            }
        } catch (err) {
            // Check if this is an auth error for Google Tasks
            if (
                settings.taskBackend === 'google-tasks' &&
                err.message?.includes('Authentication expired')
            ) {
                settings.googleTasksSignedIn = false
                error = 'google sign in expired'
            } else {
                error = `failed to sync tasks`
            }
            console.error(err)
        } finally {
            if (showSyncing) syncing = false
        }
    }

    async function addTask(event) {
        event.preventDefault()
        const raw = newTaskContent.trim()
        if (!raw || !api || addingTask) return

        let content = raw
        let due = null
        let projectId = null

        // Strip date match
        if (parsedDate?.match) {
            const cleaned = stripDateMatch(content, parsedDate.match)
            content = cleaned || content
            due = formatTaskDue(parsedDate.date, parsedDate.hasTime)
        }

        // Strip project match
        if (parsedProject?.match) {
            const cleaned = stripProjectMatch(content, parsedProject.match)
            content = cleaned || content
            projectId = parsedProject.projectId
        }

        try {
            addingTask = true
            await api.addTask(content, due, projectId)
            newTaskContent = ''
            await loadTasks()
        } catch (err) {
            console.error('Failed to add task:', err)
        } finally {
            addingTask = false
        }
    }

    async function toggleTask(taskId, checked) {
        // Prevent concurrent toggles of the same task
        if (togglingTasks.has(taskId)) return

        try {
            togglingTasks.add(taskId)

            tasks = tasks.map((task) =>
                task.id === taskId
                    ? {
                          ...task,
                          checked: checked,
                          completed_at: checked
                              ? new Date().toISOString()
                              : null,
                      }
                    : task
            )

            if (checked) {
                await api.completeTask(taskId)
            } else {
                await api.uncompleteTask(taskId)
            }
            await loadTasks()
        } catch (err) {
            console.error(err)
            await loadTasks()
        } finally {
            togglingTasks.delete(taskId)
        }
    }

    async function deleteTask(taskId) {
        if (!api) return
        try {
            tasks = tasks.filter((task) => task.id !== taskId)
            await api.deleteTask(taskId)
            await loadTasks()
        } catch (err) {
            console.error('Failed to delete task:', err)
            await loadTasks()
        }
    }

    function isTaskOverdue(task) {
        if (!task.due || task.checked) return false
        const now = new Date()
        return task.due_date.getTime() < now.getTime()
    }

    function formatDueDate(date, hasTime) {
        if (!date) return ''

        const now = new Date()
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
        const dueDate = new Date(date)
        const dueDateOnly = new Date(
            dueDate.getFullYear(),
            dueDate.getMonth(),
            dueDate.getDate()
        )

        const diffTime = dueDateOnly.getTime() - today.getTime()
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

        let dateString = ''

        if (diffDays === -1) {
            dateString = 'yesterday'
        } else if (diffDays === 0) {
            dateString = 'today'
        } else if (diffDays === 1) {
            dateString = 'tmrw'
        } else if (diffDays > 1 && diffDays < 7) {
            dateString = dueDate
                .toLocaleDateString('en-US', {
                    weekday: 'short',
                })
                .toLowerCase()
        } else {
            dateString = dueDate
                .toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                })
                .toLowerCase()
        }

        if (hasTime) {
            let timeString
            if (settings.timeFormat === '12hr') {
                timeString = dueDate
                    .toLocaleTimeString('en-US', {
                        hour: 'numeric',
                        minute: '2-digit',
                        hour12: true,
                    })
                    .toLowerCase()
            } else {
                timeString = dueDate.toLocaleTimeString('en-US', {
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: false,
                })
            }
            dateString += ` ${timeString}`
        }

        return dateString
    }

    onMount(() => {
        initializeAPI(settings.taskBackend, settings.todoistApiToken)
        document.addEventListener('visibilitychange', handleVisibilityChange)
    })

    onDestroy(() => {
        document.removeEventListener('visibilitychange', handleVisibilityChange)
    })
</script>

<div class="panel-wrapper">
    <button
        class="widget-label"
        onclick={() => loadTasks(true)}
        disabled={syncing}
    >
        {syncing ? 'syncing...' : 'tasks'}
    </button>
    <div class="panel">
        {#if error}
            <div class="error">{error}</div>
        {:else}
            <div class="widget-header">
                {#if settings.taskBackend === 'todoist'}
                    <a
                        href="https://todoist.com/app"
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        <span class="bright">{taskCount}</span>
                        task{taskCount === 1 ? '' : 's'}
                    </a>
                {:else if settings.taskBackend === 'google-tasks'}
                    <a
                        href="https://tasks.google.com"
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        <span class="bright">{taskCount}</span>
                        task{taskCount === 1 ? '' : 's'}
                    </a>
                {:else}
                    <span>
                        <span class="bright">{taskCount}</span>
                        task{taskCount === 1 ? '' : 's'}
                    </span>
                {/if}
                <AddTask
                    bind:value={newTaskContent}
                    bind:parsed={parsedDate}
                    {parsedProject}
                    disabled={addingTask}
                    loading={addingTask}
                    show={tasks.length === 0}
                    onsubmit={addTask}
                />
            </div>

            <br />
            <div class="tasks">
                <div class="tasks-list">
                    {#each tasks as task}
                        <div class="task" class:completed={task.checked}>
                            <button
                                onclick={() =>
                                    toggleTask(task.id, !task.checked)}
                                class="checkbox"
                            >
                                {#if task.checked}
                                    [<span class="checkbox-x">x</span>]
                                {:else}
                                    [ ]
                                {/if}
                            </button>
                            {#if task.project_name && task.project_name !== 'Inbox'}
                                <span class="task-project"
                                    >#{task.project_name}</span
                                >
                            {/if}
                            <span class="task-title"
                                >{task.content || '(no content)'}</span
                            >
                            {#if task.due_date}
                                <span
                                    class="task-due"
                                    class:overdue={isTaskOverdue(task)}
                                >
                                    {formatDueDate(
                                        task.due_date,
                                        task.has_time
                                    )}
                                </span>
                            {/if}
                            <button
                                type="button"
                                class="task-delete"
                                onclick={() => deleteTask(task.id)}
                                aria-label="delete task"
                                title="delete"
                            >
                                x
                            </button>
                        </div>
                    {/each}
                </div>
            </div>
        {/if}
    </div>
</div>

<style>
    .panel-wrapper {
        flex: 1;
    }
    .widget-header {
        display: flex;
        gap: 1ch;
    }
    .tasks {
        max-height: 15rem;
        overflow: auto;
        scrollbar-width: none;
        scroll-snap-type: y proximity;
    }
    .task {
        display: flex;
        align-items: baseline;
        gap: 1ch;
        max-width: 40rem;
        white-space: nowrap;
        scroll-snap-align: start;
    }
    .task-title {
        flex: 1 1 auto;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
    }
    .task-due {
        color: var(--txt-3);
    }
    .task-project {
        color: var(--txt-3);
    }
    .task-delete {
        opacity: 0;
        pointer-events: none;
    }
    .task:hover .task-delete,
    .task:focus-within .task-delete {
        opacity: 1;
        pointer-events: auto;
    }
    .task.completed .task-title {
        text-decoration: line-through;
    }
    .overdue {
        color: var(--txt-err);
    }
    a:hover {
        color: var(--txt-1);
    }
    .checkbox-x {
        color: var(--txt-2);
    }
</style>
