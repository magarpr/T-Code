# Roo Code Cloud Integration

This document provides comprehensive information about Roo Code's cloud integration features, including cloud-synchronized provider profiles, task sharing, and enhanced task lifecycle events.

## Table of Contents

- [Overview](#overview)
- [Cloud Authentication](#cloud-authentication)
- [Cloud-Synchronized Provider Profiles](#cloud-synchronized-provider-profiles)
- [Task Sharing](#task-sharing)
- [Task Lifecycle Events](#task-lifecycle-events)
- [Configuration](#configuration)
- [API Reference](#api-reference)
- [Troubleshooting](#troubleshooting)

## Overview

Roo Code's cloud integration enables teams to collaborate more effectively by providing:

1. **Cloud-Synchronized Provider Profiles** - Centralized management of API provider configurations across team members
2. **Task Sharing** - Share tasks with your organization or publicly with configurable visibility
3. **Enhanced Task Lifecycle Events** - Granular tracking of task states for analytics and monitoring
4. **Organization Settings** - Centralized configuration management for teams

## Cloud Authentication

### Setting Up Authentication

Roo Code uses web-based authentication for cloud services. To authenticate:

1. Click on the account button in the Roo Code interface
2. Select "Sign in with Roo Cloud"
3. Complete the authentication flow in your browser
4. Return to VS Code once authenticated

### Authentication States

The cloud service tracks several authentication states:

- **Authenticated** - User is signed in with valid credentials
- **Has Active Session** - User has an active session token
- **Organization Member** - User belongs to an organization with specific roles

### Environment Variables

For automated environments, you can use:

- `ROO_CODE_CLOUD_TOKEN` - Static authentication token
- `ROO_CODE_CLOUD_ORG_SETTINGS` - Static organization settings (JSON format)

## Cloud-Synchronized Provider Profiles

### Overview

Provider profiles allow teams to share API configurations (models, endpoints, settings) across team members. When a profile is updated by an organization admin, all team members automatically receive the updates.

### How It Works

1. **Profile Sync on Login** - When you sign in to Roo Cloud, your provider profiles are automatically synchronized
2. **Real-time Updates** - Profile changes are propagated to all team members in real-time
3. **Local Override** - You can still create local profiles that won't be synchronized

### Managing Cloud Profiles

Cloud profiles are managed through the `CloudService` and `ProviderSettingsManager`:

```typescript
// Sync cloud profiles
await provider.syncCloudProfiles()

// The sync process:
// 1. Fetches organization settings from cloud
// 2. Compares with local profiles
// 3. Updates local profiles with cloud changes
// 4. Preserves local-only profiles
```

### Profile Structure

Cloud-synchronized profiles include:

- API provider type (OpenAI, Anthropic, etc.)
- Model configurations
- Endpoint URLs
- Rate limits and quotas
- Custom headers and authentication

## Task Sharing

### Overview

Task sharing allows you to share your Roo Code conversations and results with your team or publicly. This is useful for:

- Knowledge sharing within teams
- Getting help from colleagues
- Creating reproducible examples
- Building a knowledge base

### Sharing a Task

To share a task:

1. Click the share button in the task interface
2. Choose visibility:
    - **Organization** - Only visible to your organization members
    - **Public** - Visible to anyone with the link
3. The share URL is automatically copied to your clipboard

### Share Configuration

Organizations can configure sharing settings:

```typescript
interface OrganizationCloudSettings {
	recordTaskMessages?: boolean // Enable message recording
	enableTaskSharing?: boolean // Enable sharing feature
	taskShareExpirationDays?: number // Auto-expire shared tasks
	allowMembersViewAllTasks?: boolean // Organization-wide visibility
}
```

### API Usage

```typescript
// Share a task programmatically
const result = await CloudService.instance.shareTask(
	taskId,
	"organization", // or "public"
	clineMessages, // Optional: backfill messages if needed
)

// Check if sharing is enabled
const canShare = await CloudService.instance.canShareTask()
```

## Task Lifecycle Events

### Overview

Roo Code tracks detailed task lifecycle events for analytics, monitoring, and debugging purposes. These events provide insights into how tasks progress and where issues might occur.

### Event Types

#### Task Provider Lifecycle

- `taskCreated` - New task instance created

#### Task Lifecycle

- `taskStarted` - Task execution begins
- `taskCompleted` - Task finishes successfully
- `taskAborted` - Task is cancelled by user
- `taskFocused` - Task gains focus in UI
- `taskUnfocused` - Task loses focus
- `taskActive` - Task is actively processing
- `taskIdle` - Task is waiting for input

#### Subtask Lifecycle

- `taskPaused` - Parent task paused for subtask
- `taskUnpaused` - Parent task resumes
- `taskSpawned` - New subtask created

#### Task Execution

- `message` - New message in conversation
- `taskModeSwitched` - Task switches mode (e.g., code to debug)
- `taskAskResponded` - User responds to task question

#### Task Analytics

- `taskTokenUsageUpdated` - Token usage changes
- `taskToolFailed` - Tool execution fails

### Event Handling

```typescript
// Listen to task events
provider.on(RooCodeEventName.TaskCompleted, (taskId, tokenUsage, toolUsage) => {
	console.log(`Task ${taskId} completed`)
	console.log(`Tokens used: ${tokenUsage.total}`)
	console.log(`Tools used: ${Object.keys(toolUsage).join(", ")}`)
})

// Emit custom events
task.emit(RooCodeEventName.TaskStarted)
```

### Event Payloads

Each event includes relevant data:

```typescript
interface TaskCompletedPayload {
	taskId: string
	tokenUsage: {
		input: number
		output: number
		total: number
	}
	toolUsage: Record<string, number>
	isSubtask: boolean
}
```

## Configuration

### Organization Settings

Organizations can configure default settings for all members:

```typescript
interface OrganizationSettings {
	version: number
	cloudSettings?: OrganizationCloudSettings
	defaultSettings: OrganizationDefaultSettings
	allowList: OrganizationAllowList
	providerProfiles?: Record<string, ProviderSettings>
}
```

### Allow Lists

Control which models and providers team members can use:

```typescript
interface OrganizationAllowList {
	allowAll: boolean
	providers: Record<
		string,
		{
			allowAll: boolean
			models?: string[]
		}
	>
}
```

### Settings Synchronization

Settings are synchronized in the following order:

1. Organization defaults (from cloud)
2. User's cloud-synchronized settings
3. Local workspace settings
4. Local user preferences

## API Reference

### CloudService

The main service for cloud integration:

```typescript
class CloudService {
	// Authentication
	async login(): Promise<void>
	async logout(): Promise<void>
	isAuthenticated(): boolean
	getUserInfo(): CloudUserInfo | null

	// Organization
	getOrganizationId(): string | null
	getOrganizationName(): string | null
	getOrganizationRole(): string | null

	// Settings
	getAllowList(): OrganizationAllowList
	getOrganizationSettings(): OrganizationSettings | undefined

	// Task Sharing
	async shareTask(taskId: string, visibility?: ShareVisibility): Promise<ShareResponse>
	async canShareTask(): Promise<boolean>
}
```

### CloudShareService

Handles task sharing functionality:

```typescript
class CloudShareService {
	async shareTask(taskId: string, visibility?: ShareVisibility): Promise<ShareResponse>
	async canShareTask(): Promise<boolean>
}
```

### CloudAPI

Low-level API client:

```typescript
class CloudAPI {
	async shareTask(taskId: string, visibility?: ShareVisibility): Promise<ShareResponse>
}
```

## Troubleshooting

### Common Issues

#### Authentication Failures

1. **Token Expired** - Sign out and sign in again
2. **Network Issues** - Check your internet connection
3. **Organization Not Found** - Verify your organization membership

#### Profile Sync Issues

1. **Profiles Not Updating** - Check cloud connection status
2. **Conflicts** - Local changes may override cloud settings
3. **Missing Profiles** - Ensure you have proper permissions

#### Task Sharing Problems

1. **Sharing Disabled** - Check organization settings
2. **Task Not Found** - Ensure task was properly recorded
3. **Permission Denied** - Verify your organization role

### Debug Mode

Enable debug logging for cloud services:

```typescript
// In your VS Code settings
{
  "rooCode.debug.cloudServices": true
}
```

### Error Handling

All cloud operations include proper error handling:

```typescript
try {
	const result = await CloudService.instance.shareTask(taskId)
	if (result.success) {
		console.log("Shared at:", result.shareUrl)
	}
} catch (error) {
	if (error instanceof AuthenticationError) {
		// Handle auth errors
	} else if (error instanceof TaskNotFoundError) {
		// Handle missing task
	}
}
```

## Security Considerations

1. **API Keys** - Never share provider API keys through cloud profiles
2. **Sensitive Data** - Be cautious when sharing tasks containing sensitive information
3. **Permissions** - Regularly review organization member permissions
4. **Expiration** - Set appropriate expiration times for shared tasks

## Best Practices

1. **Profile Management**

    - Use descriptive names for profiles
    - Document profile purposes
    - Regularly review and update profiles

2. **Task Sharing**

    - Review task content before sharing
    - Use organization visibility for internal discussions
    - Set expiration for temporary shares

3. **Event Tracking**
    - Monitor task completion rates
    - Track tool usage patterns
    - Identify common failure points

## Future Enhancements

The cloud integration is continuously evolving. Planned features include:

- Enhanced collaboration tools
- Real-time task collaboration
- Advanced analytics dashboards
- Custom organization workflows
- Integration with external services

For the latest updates, check the [CHANGELOG](../CHANGELOG.md) and join our [Discord community](https://discord.gg/roocode).
