export function getAskFollowupQuestionDescription(): string {
	return `## ask_followup_question
Description: Ask the user a question to gather additional information needed to complete the task. This tool should be used when you encounter ambiguities, need clarification, or require more details to proceed effectively. It allows for interactive problem-solving by enabling direct communication with the user. Use this tool judiciously to maintain a balance between gathering necessary information and avoiding excessive back-and-forth.
Parameters:
- question: (required) The question to ask the user. This should be a clear, specific question that addresses the information you need.
- follow_up: (required) A list of 2-4 suggested answers that logically follow from the question, ordered by priority or logical sequence. Each suggestion must:
  1. Be provided in its own <suggest> tag
  2. Be specific, actionable, and directly related to the completed task
  3. Be a complete answer to the question - the user should not need to provide additional information or fill in any missing details. DO NOT include placeholders with brackets or parentheses.
  4. Optionally include a <mode> element to switch to a specific mode when the suggestion is selected
     - When using the mode element, focus the suggestion text on the action to be taken rather than mentioning the mode switch, as the mode change is handled automatically and indicated by a visual badge
Usage:
<ask_followup_question>
<question>Your question here</question>
<follow_up>
<suggest>
<content>Your suggested answer here</content>
</suggest>
<suggest>
<mode>code</mode>
<content>Implement the solution</content>
</suggest>
</follow_up>
</ask_followup_question>

Example: Requesting to ask the user for the path to the frontend-config.json file
<ask_followup_question>
<question>What is the path to the frontend-config.json file?</question>
<follow_up>
<suggest>
<content>./src/frontend-config.json</content>
</suggest>
<suggest>
<content>./config/frontend-config.json</content>
</suggest>
<suggest>
<content>./frontend-config.json</content>
</suggest>
</follow_up>
</ask_followup_question>

Example: Asking a question with mode switching options
<ask_followup_question>
<question>How would you like to proceed with this task?</question>
<follow_up>
<suggest>
<mode>code</mode>
<content>Start implementing the solution</content>
</suggest>
<suggest>
<mode>architect</mode>
<content>Plan the architecture first</content>
</suggest>
<suggest>
<content>Continue with more details</content>
</suggest>
</follow_up>
</ask_followup_question>`
}
