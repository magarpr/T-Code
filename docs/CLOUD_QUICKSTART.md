# Roo Code Cloud Integration Quick Start Guide

This guide will help you get started with Roo Code's cloud integration features in just a few minutes.

## Prerequisites

- Roo Code extension installed in VS Code
- An active Roo Code account (sign up at [roocode.com](https://roocode.com))
- Organization membership (for team features)

## Step 1: Sign In to Roo Cloud

1. Open the Roo Code sidebar in VS Code
2. Click the **Account** tab
3. Click **Sign in with Roo Cloud**
4. Complete authentication in your browser
5. Return to VS Code when prompted

You should now see your user information in the Account tab.

## Step 2: Enable Cloud Features

Cloud features are enabled by default once you're signed in. You can verify this by checking:

```json
// In VS Code settings (settings.json)
{
	"rooCode.cloud.enabled": true,
	"rooCode.cloud.syncProfiles": true,
	"rooCode.cloud.enableSharing": true
}
```

## Step 3: Using Cloud-Synchronized Profiles

### View Available Profiles

1. Go to the **Settings** tab in Roo Code
2. Look for the **API Configuration** section
3. Cloud-synchronized profiles will have a cloud icon ☁️

### Switch Between Profiles

```typescript
// Profiles are automatically synchronized
// Just select from the dropdown in Settings
```

### Create a Team Profile (Admins Only)

1. Create a new profile in Settings
2. Configure your API provider and model
3. Save with a descriptive name
4. It will automatically sync to team members

## Step 4: Sharing Tasks

### Share Your Current Task

1. Complete or pause your current task
2. Click the **Share** button (↗️) in the task interface
3. Choose visibility:
    - **Organization** - Only your team can access
    - **Public** - Anyone with the link can view

### What Gets Shared

- Complete conversation history
- Code changes and outputs
- Tool usage and results
- Task metadata (duration, tokens used)

### Share Link Format

```
https://share.roocode.com/task/[task-id]
```

The link is automatically copied to your clipboard!

## Step 5: Monitoring Task Events

### View Task Analytics

Task events are automatically tracked. You can:

1. See task completion status
2. Monitor token usage
3. Track tool execution
4. Identify performance patterns

### Common Events to Monitor

```typescript
// Task started
RooCodeEventName.TaskStarted

// Task completed with metrics
RooCodeEventName.TaskCompleted
// Payload: { taskId, tokenUsage, toolUsage }

// Mode switches
RooCodeEventName.TaskModeSwitched
// Payload: { taskId, newMode }

// Tool failures
RooCodeEventName.TaskToolFailed
// Payload: { taskId, tool, error }
```

## Step 6: Organization Settings

### For Organization Admins

Configure team-wide settings:

```typescript
{
  "cloudSettings": {
    "enableTaskSharing": true,
    "taskShareExpirationDays": 30,
    "allowMembersViewAllTasks": false
  },
  "allowList": {
    "allowAll": false,
    "providers": {
      "openai": {
        "allowAll": false,
        "models": ["gpt-4", "gpt-3.5-turbo"]
      },
      "anthropic": {
        "allowAll": true
      }
    }
  }
}
```

### For Team Members

Your available models and features are controlled by your organization admin. Contact them if you need access to specific models or features.

## Common Use Cases

### 1. Team Knowledge Sharing

Share successful task completions with your team:

```typescript
// After completing a complex refactoring
// Click Share → Organization
// Post link in team chat with context
```

### 2. Getting Help

Share a stuck task with colleagues:

```typescript
// When encountering an issue
// Click Share → Organization
// Ask for help with the share link
```

### 3. Building Examples

Create public examples for documentation:

```typescript
// Complete a demonstration task
// Click Share → Public
// Include link in documentation
```

### 4. Standardizing Configurations

Admins can create standard profiles:

- "Production API" - Rate-limited, specific models
- "Development API" - More permissive settings
- "Testing API" - Optimized for speed/cost

## Troubleshooting

### Not Seeing Cloud Features?

1. Ensure you're signed in (check Account tab)
2. Verify organization membership
3. Check with your admin for permissions

### Profiles Not Syncing?

1. Sign out and sign back in
2. Check internet connection
3. Verify organization settings

### Can't Share Tasks?

1. Check if sharing is enabled by your org
2. Ensure task has completed or paused
3. Verify you have sharing permissions

### Getting Authentication Errors?

1. Your session may have expired
2. Sign out completely
3. Clear VS Code credentials
4. Sign in again

## Best Practices

### For Individual Users

1. **Review Before Sharing** - Check for sensitive data
2. **Use Descriptive Names** - Help others understand shared tasks
3. **Set Context** - Add comments explaining your approach
4. **Clean Up** - Delete old shared tasks periodically

### for Teams

1. **Standardize Profiles** - Use consistent naming
2. **Document Profiles** - Explain when to use each
3. **Monitor Usage** - Track token consumption
4. **Regular Reviews** - Update allowed models

### For Admins

1. **Start Restrictive** - Add permissions as needed
2. **Communicate Changes** - Notify team of updates
3. **Monitor Costs** - Track API usage by profile
4. **Security First** - Never share API keys

## Advanced Features

### Programmatic Access

```typescript
import { CloudService } from "@roo-code/cloud"

// Check authentication
if (CloudService.instance.isAuthenticated()) {
	// Get user info
	const user = CloudService.instance.getUserInfo()

	// Share a task
	const result = await CloudService.instance.shareTask(taskId, "organization")

	console.log("Shared at:", result.shareUrl)
}
```

### Event Subscriptions

```typescript
// Subscribe to task events
provider.on(RooCodeEventName.TaskCompleted, (taskId, usage) => {
	// Send to analytics
	analytics.track("task_completed", {
		taskId,
		tokens: usage.total,
		duration: Date.now() - startTime,
	})
})
```

### Custom Integrations

```typescript
// Integrate with your tools
class CustomIntegration {
	async onTaskShared(shareUrl: string) {
		// Post to Slack
		await slack.postMessage({
			text: `New Roo Code task shared: ${shareUrl}`,
		})

		// Log to internal system
		await internalApi.logShare({
			url: shareUrl,
			user: CloudService.instance.getUserInfo(),
		})
	}
}
```

## Security Notes

1. **Never share tasks containing**:

    - API keys or secrets
    - Personal information
    - Proprietary code (unless intended)
    - Security vulnerabilities

2. **Always verify** share visibility before sharing

3. **Use organization sharing** for internal work

4. **Set expiration** for temporary shares

## Getting Help

- **Documentation**: [docs.roocode.com](https://docs.roocode.com)
- **Discord Community**: [discord.gg/roocode](https://discord.gg/roocode)
- **GitHub Issues**: [Report bugs or request features](https://github.com/RooCodeInc/Roo-Code/issues)
- **Email Support**: support@roocode.com

## Next Steps

Now that you're set up with cloud features:

1. Try sharing your first task
2. Explore different provider profiles
3. Monitor your task analytics
4. Join our Discord to share experiences

Happy coding with Roo Code Cloud! 🚀
