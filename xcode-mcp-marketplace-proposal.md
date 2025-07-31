# Xcode MCP Marketplace Addition Proposal

## Overview

This document proposes adding XcodeBuildMCP to the Roo Code MCP Marketplace to address GitHub issue #6482. After researching available Xcode MCPs, XcodeBuildMCP emerges as the most comprehensive and popular option.

## Research Findings

### Available Xcode MCPs

1. **XcodeBuildMCP** (⭐ 2,163 stars) - Most popular and comprehensive

    - Repository: https://github.com/cameroncooke/XcodeBuildMCP
    - NPM Package: `xcodebuildmcp`
    - Features: Complete Xcode project management, simulator control, device management, Swift Package Manager integration

2. **xcodeproj-mcp-server** (⭐ 81 stars)

    - Repository: https://github.com/giginet/xcodeproj-mcp-server
    - Features: Xcode project file manipulation

3. **Claude-Project-Coordinator** (⭐ 38 stars)

    - Repository: https://github.com/M-Pineapple/Claude-Project-Coordinator
    - Features: Multi-project Xcode development coordination

4. **SwiftLens** (⭐ 30 stars)

    - Repository: https://github.com/swiftlens/swiftlens
    - Features: Swift codebase semantic analysis

5. **xctools-mcp-server** (⭐ 2 stars)
    - Repository: https://github.com/nzrsky/xctools-mcp-server
    - Features: Various Xcode tools

## Recommended MCP: XcodeBuildMCP

### Why XcodeBuildMCP?

- **Most Popular**: 2,163 GitHub stars indicate strong community adoption
- **Comprehensive**: Covers all major Xcode development workflows
- **Well-Maintained**: Active development with CI/CD, CodeQL scanning
- **Professional Quality**: MIT licensed, verified on MseeP platform
- **Easy Installation**: Available via NPM with simple configuration

### Features

- **Xcode Project Management**: Build, clean, discover projects and workspaces
- **Simulator Management**: List, boot, install/launch apps, capture logs and screenshots
- **Device Management**: Physical device support with app deployment and testing
- **Swift Package Manager**: Build packages, run tests and executables
- **App Utilities**: Bundle ID extraction, app lifecycle management
- **MCP Resources**: Efficient URI-based data access for supported clients

### Installation Configuration

```json
{
	"mcpServers": {
		"XcodeBuildMCP": {
			"command": "npx",
			"args": ["-y", "xcodebuildmcp@latest"]
		}
	}
}
```

### Optional Environment Variables

- `INCREMENTAL_BUILDS_ENABLED`: Enable experimental incremental builds
- `SENTRY_DISABLED`: Disable telemetry reporting

## Marketplace Configuration Proposal

Based on the existing marketplace schema in `packages/types/src/marketplace.ts`, here's the proposed configuration:

```yaml
items:
    - id: "xcodebuildmcp"
      name: "XcodeBuildMCP"
      description: "A comprehensive Model Context Protocol server that provides Xcode-related tools for building, testing, and managing iOS/macOS projects, simulators, and devices."
      author: "Cameron Cooke"
      authorUrl: "https://github.com/cameroncooke"
      url: "https://github.com/cameroncooke/XcodeBuildMCP"
      tags: ["xcode", "ios", "macos", "swift", "simulator", "device", "build", "test"]
      prerequisites: ["Xcode 16.x or later", "Node.js 18.x or later", "macOS"]
      content: |
          {
            "command": "npx",
            "args": ["-y", "xcodebuildmcp@latest"]
          }
      parameters:
          - name: "Enable Incremental Builds"
            key: "INCREMENTAL_BUILDS_ENABLED"
            placeholder: "true"
            optional: true
          - name: "Disable Sentry Telemetry"
            key: "SENTRY_DISABLED"
            placeholder: "true"
            optional: true
```

## Implementation Steps

1. **Add to Marketplace API**: The configuration above should be added to the marketplace API endpoint (`/api/marketplace/mcps`)

2. **Verify Schema Compatibility**: The existing marketplace infrastructure already supports:

    - ✅ Basic MCP configuration with `command` and `args`
    - ✅ Optional parameters with environment variables
    - ✅ Prerequisites listing
    - ✅ Author information and URLs
    - ✅ Tags for categorization

3. **Test Installation**: Verify that the marketplace can properly install and configure XcodeBuildMCP

## Additional Recommendations

### Consider Adding Multiple Xcode MCPs

While XcodeBuildMCP is the most comprehensive, different MCPs serve different use cases:

1. **XcodeBuildMCP**: Complete Xcode development workflow
2. **xcodeproj-mcp-server**: Specialized for project file manipulation
3. **SwiftLens**: Focused on code analysis and understanding

### Future Enhancements

- Add MCP compatibility matrix showing which features work with which editors
- Include demo videos or screenshots in marketplace listings
- Add community ratings and reviews for MCPs

## Conclusion

Adding XcodeBuildMCP to the marketplace would significantly enhance Roo Code's iOS/macOS development capabilities. The MCP is mature, well-maintained, and provides comprehensive Xcode integration that would benefit many users working on Apple platform development.

The existing marketplace infrastructure is fully capable of supporting this addition without any code changes to the Roo Code repository.
