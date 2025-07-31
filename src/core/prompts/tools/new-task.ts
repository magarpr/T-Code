import { ToolArgs } from "./types"

export function getNewTaskDescription(_args: ToolArgs): string {
	return `## new_task
Description: This will let you create a new task instance in the chosen mode using your provided message.

Parameters:
- mode: (required) The slug of the mode to start the new task in (e.g., "code", "debug", "architect").
- message: (required) The initial user message or instructions for this new task.
- todos: (optional) A markdown checklist string to initialize the new task's todo list. Use the same single-level checklist format as update_todo_list. If provided, Task parses this during initialization to create the todoList. If omitted, the task starts without a todoList.

Notes:
- settings.todoListEnabled only gates prompting behavior (i.e., whether update_todo_list is made available in prompts). Passing todos here does not force prompting if todoListEnabled is disabled.

Usage:
<new_task>
<mode>your-mode-slug-here</mode>
<message>Your initial instructions here</message>
</new_task>

Example (without todos):
<new_task>
<mode>code</mode>
<message>Implement a new feature for the application.</message>
</new_task>

Example (with todos):
<new_task>
<mode>code</mode>
<message>Implement user authentication</message>
<todos>
[ ] Set up authentication middleware
[ ] Create login endpoint
[ ] Create logout endpoint
[-] Add session management
[x] Write tests for authentication
</todos>
</new_task>
`
}
