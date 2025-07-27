# Perplexity MCP Server

An MCP (Model Context Protocol) server that integrates with the Perplexity API to provide web search and deep research capabilities to AI assistants.

## Features

This MCP server provides three main tools:

### 1. `web_search`

Performs real-time web searches using Perplexity's Sonar model.

**Parameters:**

- `query` (required): Search query for web search
- `search_domain_filter` (optional): List of domains to restrict search to
- `return_citations` (optional, default: true): Whether to return source citations
- `return_images` (optional, default: false): Whether to return relevant images
- `return_related_questions` (optional, default: true): Whether to return related questions
- `search_recency_filter` (optional): Filter results by recency ('month', 'week', 'day', 'hour')
- `temperature` (optional, default: 0.2): Temperature for response generation (0-2)

### 2. `deep_research`

Conducts comprehensive research using Perplexity's Pro models for in-depth analysis.

**Parameters:**

- `topic` (required): Research topic or question for in-depth analysis
- `model` (optional, default: 'sonar-pro'): Model to use ('sonar-pro' or 'sonar-reasoning')
- `focus_areas` (optional): Specific areas to focus the research on
- `max_tokens` (optional, default: 2000): Maximum tokens for response (100-4000)
- `temperature` (optional, default: 0.1): Temperature for response generation (0-2)
- `return_citations` (optional, default: true): Whether to return source citations

### 3. `ask_followup`

Asks follow-up questions based on previous research context.

**Parameters:**

- `context` (required): Previous research context or conversation
- `question` (required): Follow-up question to ask
- `model` (optional, default: 'sonar'): Model to use ('sonar' or 'sonar-pro')
- `temperature` (optional, default: 0.3): Temperature for response generation (0-2)

## Prerequisites

- Node.js 18 or higher
- A Perplexity API key (get one at https://www.perplexity.ai/settings/api)

## Installation

### For Development

1. Clone this repository and navigate to the server directory:

```bash
cd examples/mcp-servers/perplexity
```

2. Install dependencies:

```bash
npm install
```

3. Build the server:

```bash
npm run build
```

### For Use with Roo Code

The server can be configured in your MCP settings file. See the Configuration section below.

## Configuration

### Getting a Perplexity API Key

1. Sign up for a Perplexity account at https://www.perplexity.ai
2. Navigate to Settings → API
3. Generate a new API key
4. Copy the API key for use in the configuration

### MCP Settings Configuration

Add the following to your MCP settings file:

#### For Roo Code Extension

Location: `~/Library/Application Support/Code/User/globalStorage/rooveterinaryinc.roo-cline/settings/mcp_settings.json` (macOS)

```json
{
	"mcpServers": {
		"perplexity": {
			"command": "node",
			"args": ["/absolute/path/to/examples/mcp-servers/perplexity/build/index.js"],
			"env": {
				"PERPLEXITY_API_KEY": "your-perplexity-api-key-here"
			}
		}
	}
}
```

#### For Claude Desktop App

Location: `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS)

```json
{
	"mcpServers": {
		"perplexity": {
			"command": "node",
			"args": ["/absolute/path/to/examples/mcp-servers/perplexity/build/index.js"],
			"env": {
				"PERPLEXITY_API_KEY": "your-perplexity-api-key-here"
			}
		}
	}
}
```

## Usage Examples

Once configured, the AI assistant can use these tools:

### Web Search Example

```
"Search for the latest developments in quantum computing"
```

### Deep Research Example

```
"Conduct deep research on the environmental impact of electric vehicles, focusing on battery production and recycling"
```

### Follow-up Question Example

```
"Based on the previous research about electric vehicles, what are the most promising battery technologies being developed?"
```

## Development

### Running in Development Mode

```bash
npm run dev
```

### Building

```bash
npm run build
```

### Project Structure

```
perplexity/
├── src/
│   └── index.ts      # Main server implementation
├── build/            # Compiled JavaScript (generated)
├── package.json      # Dependencies and scripts
├── tsconfig.json     # TypeScript configuration
└── README.md         # This file
```

## API Rate Limits

Please be aware of Perplexity API rate limits:

- Check your plan's rate limits at https://www.perplexity.ai/settings/api
- The server includes error handling for rate limit errors
- Consider implementing caching for frequently requested information

## Troubleshooting

### Common Issues

1. **"PERPLEXITY_API_KEY environment variable is required"**

    - Ensure you've added your API key to the MCP settings configuration
    - Verify the key is valid and has not expired

2. **Connection errors**

    - Check your internet connection
    - Verify the Perplexity API is accessible
    - Ensure your API key has the necessary permissions

3. **TypeScript errors during build**
    - Run `npm install` to ensure all dependencies are installed
    - Check that you're using Node.js 18 or higher

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests to improve this MCP server.

## License

This MCP server is part of the Roo Code project and follows the same license terms.
