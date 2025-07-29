import { ToolArgs } from "./types"

export function getNewTaskDescription(_args: ToolArgs): string {
	return `## new_task
Description: This will let you create a new task instance in the chosen mode using your provided message. You can optionally provide a todo list to help organize and track the subtask's progress.

Parameters:
- mode: (required) The slug of the mode to start the new task in (e.g., "code", "debug", "architect").
- message: (required) The initial user message or instructions for this new task.
- todos: (optional) A markdown checklist of todo items to initialize the new task with. When creating subtasks for complex work, include todos to break down the work into manageable steps. Format each item as a markdown checkbox:
  - [ ] for pending tasks
  - [x] for completed tasks
  - [-] for in-progress tasks

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

Example without todos:
<new_task>
<mode>code</mode>
<message>Fix the typo in the README file</message>
</new_task>

Example with todos (recommended for complex tasks):
<new_task>
<mode>code</mode>
<message>Implement user authentication system</message>
<todos>
[ ] Research authentication libraries
[ ] Set up authentication middleware
[ ] Create user model and database schema
[ ] Implement registration endpoint
[ ] Implement login endpoint
[ ] Implement logout endpoint
[ ] Add password hashing
[ ] Create JWT token generation
[ ] Add session management
[ ] Implement password reset functionality
[ ] Write unit tests for auth endpoints
[ ] Write integration tests
[ ] Update API documentation
</todos>
</new_task>

IMPORTANT: When delegating complex work to a subtask, always consider including a todos list to help the subtask stay organized and track progress effectively.
`
}
