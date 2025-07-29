import { ToolArgs } from "./types"

export function getNewTaskDescription(_args: ToolArgs): string {
	return `## new_task
Description: This will let you create a new task instance in the chosen mode using your provided message and initial todo list.

Parameters:
- mode: (required) The slug of the mode to start the new task in (e.g., "code", "debug", "architect").
- message: (required) The initial user message or instructions for this new task.
- todos: (required) A markdown checklist string defining the initial todo list for the task.

Usage:
<new_task>
<mode>your-mode-slug-here</mode>
<message>Your initial instructions here</message>
<todos>
[ ] First task to complete
[ ] Second task to complete
[ ] Third task to complete
</todos>
</new_task>

Example:
<new_task>
<mode>code</mode>
<message>Implement user authentication</message>
<todos>
[ ] Set up auth middleware
[ ] Create login endpoint
[ ] Add session management
[ ] Write tests
</todos>
</new_task>
`
}
