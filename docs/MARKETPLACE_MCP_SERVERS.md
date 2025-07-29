# Adding MCP Servers to the Roo Code Marketplace

This document explains how to add new MCP (Model Context Protocol) servers to the Roo Code marketplace.

## Overview

The Roo Code marketplace allows users to discover and install MCP servers that extend the capabilities of the AI assistant. MCP servers provide additional tools and resources that can be used during conversations.

## MCP Server Marketplace Item Format

MCP servers in the marketplace follow a specific schema defined in `packages/types/src/marketplace.ts`. Here's the structure:

### Required Fields

- `id`: Unique identifier for the MCP server (kebab-case)
- `name`: Human-readable name
- `description`: Detailed description of what the server does
- `type`: Must be `"mcp"`
- `url`: GitHub repository URL or official documentation URL
- `content`: JSON string containing the MCP server configuration

### Optional Fields

- `author`: Author name
- `authorUrl`: Author's website or GitHub profile
- `tags`: Array of relevant tags for discovery
- `prerequisites`: Array of requirements (e.g., API keys, software)

## Example: Microsoft Learn Docs Search MCP Server

Here's a complete example of how to define the Microsoft Learn Docs Search MCP server:

```yaml
items:
    - id: "microsoft-learn-docs-search"
      name: "Microsoft Learn Docs Search"
      description: "Official Microsoft documentation search and retrieval server. Access trusted, up-to-date information from Microsoft Learn, Azure docs, Microsoft 365 docs, and other official Microsoft sources using semantic search."
      author: "Microsoft"
      authorUrl: "https://github.com/MicrosoftDocs"
      url: "https://github.com/MicrosoftDocs/mcp"
      tags: ["microsoft", "documentation", "search", "azure", "dotnet", "official"]
      prerequisites: []
      content: |
          {
            "microsoft-learn-docs": {
              "type": "streamable-http",
              "url": "https://learn.microsoft.com/api/mcp"
            }
          }
```

## MCP Server Configuration Types

The `content` field contains the actual MCP server configuration that will be added to the user's `.roo/mcp.json` file. Different types of MCP servers use different configuration formats:

### Remote HTTP MCP Servers

For cloud-hosted MCP servers that use HTTP:

```json
{
	"server-name": {
		"type": "streamable-http",
		"url": "https://example.com/api/mcp"
	}
}
```

### Local MCP Servers

For locally installed MCP servers:

```json
{
	"server-name": {
		"command": "node",
		"args": ["path/to/server.js"]
	}
}
```

### NPM Package MCP Servers

For MCP servers distributed as npm packages:

```json
{
	"server-name": {
		"command": "npx",
		"args": ["-y", "package-name"]
	}
}
```

## Key Features of the Microsoft Learn Docs MCP Server

The Microsoft Learn Docs Search MCP server provides:

- **Semantic Search**: Advanced vector search through Microsoft's official documentation
- **Comprehensive Coverage**: Access to Microsoft Learn, Azure docs, Microsoft 365 docs, and more
- **Real-time Updates**: Always up-to-date with the latest Microsoft documentation
- **High-Quality Results**: Returns up to 10 relevant content chunks with article titles and URLs
- **Official Source**: Maintained by Microsoft for accuracy and reliability

### Available Tools

- `microsoft_docs_search`: Performs semantic search against Microsoft official technical documentation

### Example Usage

Once installed, users can ask questions like:

- "Give me the Azure CLI commands to create an Azure Container App with a managed identity. Search Microsoft docs"
- "Are you sure this is the right way to implement IHttpClientFactory in a .NET 8 minimal API? Search Microsoft docs"
- "Is gpt-4.1-mini available in EU regions? Search Microsoft docs"

## Testing Your MCP Server Definition

Before submitting a marketplace item, ensure it follows the correct format by:

1. Validating against the TypeScript schema in `packages/types/src/marketplace.ts`
2. Adding a test case in `src/services/marketplace/__tests__/MarketplaceManager.spec.ts`
3. Running the marketplace tests: `cd src && npx vitest run services/marketplace/__tests__/MarketplaceManager.spec.ts`

## Submission Process

Since the marketplace data is served from an external API, new MCP servers need to be added through the appropriate channels:

1. Create a properly formatted marketplace item definition
2. Test the format using the existing test infrastructure
3. Submit through the official Roo Code contribution process
4. The marketplace team will review and add approved servers to the external API

## Best Practices

1. **Clear Descriptions**: Provide detailed descriptions of what the MCP server does
2. **Relevant Tags**: Use appropriate tags for discoverability
3. **Prerequisites**: List any requirements (API keys, software dependencies)
4. **Official Sources**: Prefer official or well-maintained MCP servers
5. **Testing**: Thoroughly test the MCP server configuration before submission
6. **Documentation**: Include links to official documentation or setup guides

## Related Files

- `packages/types/src/marketplace.ts` - TypeScript schema definitions
- `src/services/marketplace/` - Marketplace service implementation
- `webview-ui/src/components/marketplace/` - UI components for marketplace
- `src/services/marketplace/__tests__/` - Test files for validation
