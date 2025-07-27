import { ToolArgs } from "./types"

export function getNewTaskDescription(_args: ToolArgs): string {
	return `## new_task
Description: This will let you create a new task instance in the chosen mode using your provided message.

Parameters:
- mode: (required) The slug of the mode to start the new task in (e.g., "code", "debug", "architect").
- message: (required) The initial user message or instructions for this new task.
- todos: (optional) A markdown checklist of todo items to initialize the new task with. Use the same format as update_todo_list.

Usage:
<new_task>
<mode>your-mode-slug-here</mode>
<message>Your initial instructions here</message>
<todos>
[ ] First todo item
[ ] Second todo item
[x] Completed todo item
[-] In progress todo item
</todos>
</new_task>

Example:
<new_task>
<mode>code</mode>
<message>Implement a new feature for the application.</message>
</new_task>

Example with todos:
<new_task>
<mode>code</mode>
<message>Implement user authentication</message>
<todos>
[ ] Set up authentication middleware
[ ] Create login endpoint
[ ] Create logout endpoint
[ ] Add session management
[ ] Write tests for authentication
</todos>
</new_task>
`
}
