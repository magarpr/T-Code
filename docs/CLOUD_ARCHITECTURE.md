# Roo Code Cloud Integration Architecture

This document describes the technical architecture of Roo Code's cloud integration features, including design decisions, implementation details, and extension points.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         VS Code Extension                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────────┐  │
│  │   Webview   │  │ ClineProvider│  │  WebviewMessageHandler │  │
│  │     UI      │◄─┤              │◄─┤                        │  │
│  └─────────────┘  └──────┬───────┘  └────────────────────────┘  │
│                          │                                        │
│  ┌─────────────────────┐ │ ┌──────────────────────────────────┐ │
│  │   CloudService      │◄┴─┤  ProviderSettingsManager        │ │
│  │   (Singleton)       │   │  (Profile Management)           │ │
│  └──────────┬──────────┘   └──────────────────────────────────┘ │
│             │                                                     │
│  ┌──────────┴──────────┐   ┌──────────────────────────────────┐ │
│  │   AuthService       │   │      SettingsService             │ │
│  │ - WebAuthService    │   │  - CloudSettingsService         │ │
│  │ - StaticTokenAuth   │   │  - StaticSettingsService        │ │
│  └─────────────────────┘   └──────────────────────────────────┘ │
│                                                                   │
│  ┌─────────────────────┐   ┌──────────────────────────────────┐ │
│  │  CloudShareService  │   │      CloudAPI                    │ │
│  │  (Task Sharing)     │───┤   (HTTP Client)                  │ │
│  └─────────────────────┘   └──────────────────────────────────┘ │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
                        ┌───────────────────────┐
                        │   Roo Cloud Service   │
                        │   (External API)      │
                        └───────────────────────┘
```

## Core Components

### CloudService (Singleton)

The central orchestrator for all cloud functionality:

```typescript
class CloudService extends EventEmitter<CloudServiceEvents> {
	private static _instance: CloudService | null = null
	private authService: AuthService
	private settingsService: SettingsService
	private shareService: CloudShareService
	private cloudAPI: CloudAPI

	// Singleton pattern ensures single instance
	static async createInstance(context: ExtensionContext): Promise<CloudService>
	static get instance(): CloudService
}
```

**Key Responsibilities:**

- Manages lifecycle of cloud components
- Provides unified API for cloud features
- Handles event propagation
- Ensures proper initialization order

### Authentication Layer

#### AuthService Interface

```typescript
interface AuthService {
	initialize(): Promise<void>
	login(): Promise<void>
	logout(): Promise<void>
	isAuthenticated(): boolean
	getUserInfo(): CloudUserInfo | null
	getSessionToken(): string | null
}
```

#### WebAuthService

Handles browser-based OAuth flow:

```typescript
class WebAuthService implements AuthService {
	private async startAuthFlow() {
		// 1. Generate state for CSRF protection
		// 2. Open browser with auth URL
		// 3. Start local server to receive callback
		// 4. Exchange code for tokens
		// 5. Store tokens securely
	}
}
```

#### StaticTokenAuthService

For CI/CD and automated environments:

```typescript
class StaticTokenAuthService implements AuthService {
	constructor(token: string) {
		// Use provided token directly
		// No browser flow needed
	}
}
```

### Settings Synchronization

#### CloudSettingsService

Manages real-time settings synchronization:

```typescript
class CloudSettingsService extends EventEmitter {
	private refreshTimer: RefreshTimer
	private cachedSettings: OrganizationSettings | null

	async initialize() {
		// 1. Fetch initial settings
		// 2. Start refresh timer
		// 3. Listen for auth changes
	}

	private async fetchSettings() {
		// 1. Get auth token
		// 2. Call API
		// 3. Validate response
		// 4. Update cache
		// 5. Emit change event
	}
}
```

**Refresh Strategy:**

- Initial fetch on authentication
- Periodic refresh (configurable interval)
- Force refresh on specific events
- Exponential backoff on failures

### Profile Management

#### ProviderSettingsManager

Handles the complex merge of cloud and local profiles:

```typescript
class ProviderSettingsManager {
	async syncCloudProfiles(
		cloudProfiles: Record<string, ProviderSettings>,
		currentProfileName?: string,
	): Promise<SyncResult> {
		// 1. Load local profiles
		// 2. Identify cloud-sourced profiles
		// 3. Merge with conflict resolution
		// 4. Preserve local-only profiles
		// 5. Update active profile if needed
	}
}
```

**Conflict Resolution:**

- Cloud profiles take precedence
- Local modifications are preserved until next sync
- Deleted cloud profiles are removed locally
- Local-only profiles are never touched

### Task Sharing

#### CloudShareService

Manages task sharing with clipboard integration:

```typescript
class CloudShareService {
	async shareTask(taskId: string, visibility: ShareVisibility) {
		// 1. Call API to create share
		// 2. Copy URL to clipboard
		// 3. Return share details
	}

	async canShareTask(): boolean {
		// Check organization settings
		// Verify user permissions
	}
}
```

**Share Flow:**

1. User initiates share
2. Task data is already on server (if telemetry enabled)
3. Create share record with visibility
4. Generate shareable URL
5. Auto-copy to clipboard

### Event System

#### Task Lifecycle Events

Events flow through multiple layers:

```typescript
// Task emits event
task.emit(RooCodeEventName.TaskCompleted, tokenUsage, toolUsage)

// ClineProvider proxies to CloudService
provider.on(RooCodeEventName.TaskCompleted, (...args) => {
	CloudService.instance.captureEvent({
		name: "task_completed",
		properties: { ...args },
	})
})

// TelemetryClient sends to cloud
telemetryClient.capture(event)
```

**Event Categories:**

- **Lifecycle**: Created, Started, Completed, Aborted
- **State**: Focused, Unfocused, Active, Idle
- **Execution**: Message, ModeSwitch, ToolUse
- **Analytics**: TokenUsage, ToolFailure

## Data Flow

### Profile Synchronization Flow

```
1. User signs in
   └─> AuthService.login()
       └─> CloudSettingsService.fetchSettings()
           └─> ProviderSettingsManager.syncCloudProfiles()
               └─> ClineProvider.postStateToWebview()
                   └─> UI updates

2. Admin updates profile
   └─> Cloud webhook (future)
       └─> CloudSettingsService.refresh()
           └─> Same flow as above

3. User switches profile
   └─> WebviewMessageHandler.loadApiConfiguration()
       └─> ProviderSettingsManager.activateProfile()
           └─> Update global state
           └─> Update current task API
```

### Task Sharing Flow

```
1. User clicks share
   └─> WebviewMessageHandler.shareCurrentTask()
       └─> CloudService.shareTask()
           ├─> CloudAPI.shareTask()
           │   └─> POST /api/extension/share
           └─> vscode.env.clipboard.writeText()

2. If task not found (backfill)
   └─> TelemetryClient.backfillMessages()
       └─> Retry share
```

## Security Architecture

### Authentication Security

1. **OAuth 2.0 Flow**

    - PKCE for enhanced security
    - State parameter for CSRF protection
    - Secure token storage in VS Code

2. **Token Management**

    - Access tokens with short expiry
    - Refresh tokens for long-lived sessions
    - Automatic token refresh

3. **Static Token Mode**
    - For CI/CD environments only
    - Environment variable based
    - No persistent storage

### Data Security

1. **API Communication**

    - HTTPS only
    - Certificate pinning (future)
    - Request signing (future)

2. **Profile Security**

    - API keys never synced
    - Only configuration synced
    - Local encryption for sensitive data

3. **Task Sharing Security**
    - Visibility controls
    - Expiration dates
    - Access logging

## Extension Points

### Adding New Cloud Features

1. **New Service Pattern**

```typescript
class NewCloudService {
	constructor(
		private cloudAPI: CloudAPI,
		private settingsService: SettingsService,
	) {}

	async initialize() {
		// Setup logic
	}

	// Feature methods
}
```

2. **Integration Steps**
    - Add to CloudService initialization
    - Create message handlers
    - Update webview communication
    - Add telemetry events

### Custom Authentication Providers

```typescript
interface AuthProvider {
	type: "oauth" | "apikey" | "custom"
	initialize(): Promise<void>
	authenticate(): Promise<AuthResult>
	refresh(): Promise<AuthResult>
}
```

### Event Extensions

```typescript
// Define new event
enum CustomEventName {
	CustomAction = "customAction",
}

// Add to event schema
const customEventSchema = z.object({
	[CustomEventName.CustomAction]: z.tuple([
		z.string(), // taskId
		z.object({
			/* payload */
		}),
	]),
})

// Emit event
task.emit(CustomEventName.CustomAction, taskId, payload)
```

## Performance Considerations

### Caching Strategy

1. **Settings Cache**

    - 5-minute TTL
    - Force refresh on auth change
    - Invalidate on error

2. **Profile Cache**

    - Persistent local storage
    - Sync on startup
    - Incremental updates

3. **API Response Cache**
    - ETag support
    - Conditional requests
    - Bandwidth optimization

### Optimization Techniques

1. **Lazy Loading**

    - Cloud features load on demand
    - Defer non-critical operations
    - Progressive enhancement

2. **Batching**

    - Group API requests
    - Debounce rapid changes
    - Bulk operations

3. **Background Sync**
    - Non-blocking UI updates
    - Queue offline changes
    - Retry with backoff

## Error Handling

### Error Categories

1. **Authentication Errors**

    - Token expired
    - Invalid credentials
    - Network issues

2. **API Errors**

    - Rate limiting
    - Server errors
    - Validation failures

3. **Sync Errors**
    - Conflict resolution
    - Data corruption
    - Version mismatch

### Recovery Strategies

```typescript
class ErrorRecovery {
	async handleAuthError(error: AuthError) {
		if (error.code === "TOKEN_EXPIRED") {
			// Attempt refresh
			// Fallback to re-login
		}
	}

	async handleSyncError(error: SyncError) {
		if (error.code === "CONFLICT") {
			// User chooses resolution
			// Or automatic resolution
		}
	}
}
```

## Testing Strategy

### Unit Tests

```typescript
describe("CloudShareService", () => {
	it("should share task with organization visibility", async () => {
		// Mock CloudAPI
		// Test share flow
		// Verify clipboard
	})
})
```

### Integration Tests

```typescript
describe("Profile Sync", () => {
	it("should merge cloud and local profiles", async () => {
		// Setup test profiles
		// Trigger sync
		// Verify merge result
	})
})
```

### E2E Tests

```typescript
describe("Cloud Features E2E", () => {
	it("should complete full auth and sync flow", async () => {
		// Simulate login
		// Wait for sync
		// Verify UI state
	})
})
```

## Future Enhancements

### Planned Features

1. **Real-time Collaboration**

    - WebSocket connections
    - Live task sharing
    - Collaborative editing

2. **Advanced Analytics**

    - Custom dashboards
    - Team metrics
    - Cost tracking

3. **Enterprise Features**
    - SSO integration
    - Audit logging
    - Compliance tools

### Architecture Evolution

1. **Microservices**

    - Separate auth service
    - Independent share service
    - Scalable architecture

2. **Edge Computing**

    - Regional endpoints
    - CDN integration
    - Reduced latency

3. **Offline Support**
    - Local queue
    - Sync on reconnect
    - Conflict resolution

## Conclusion

The cloud integration architecture is designed to be:

- **Modular**: Easy to extend and maintain
- **Secure**: Multiple layers of protection
- **Performant**: Optimized for responsiveness
- **Reliable**: Graceful error handling
- **Scalable**: Ready for growth

For implementation details, see the source code in:

- `/packages/cloud/src/`
- `/src/core/webview/`
- `/packages/types/src/`
