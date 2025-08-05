# Smart Rules - Intelligent Semantic Rule Injection

Smart Rules is a feature that automatically selects and injects relevant rules into the AI context based on the current task, dramatically improving token efficiency and response quality.

## Overview

Traditional rule systems inject all rules into every conversation, leading to:

- **Token waste**: Irrelevant rules consume valuable context tokens
- **Context pollution**: Unrelated rules can mislead AI responses
- **Poor scalability**: Rule overhead grows linearly with project complexity
- **Limited rule depth**: Users avoid detailed rules due to constant overhead

Smart Rules solves these problems by intelligently matching user queries against rule triggers and only including relevant rules.

## How It Works

1. **Rule Definition**: Create markdown files with YAML frontmatter specifying when rules should apply
2. **Semantic Matching**: The system analyzes user queries and calculates similarity scores against rule triggers
3. **Automatic Selection**: Only rules exceeding the similarity threshold are included in the context
4. **Dependency Resolution**: Rules can specify dependencies that are automatically included

## Creating Smart Rules

### File Structure

Smart rules are stored in special directories within your `.roo` folder:

```
.roo/
├── smart-rules/           # General smart rules
│   ├── supabase.md
│   ├── testing.md
│   └── api-design.md
└── smart-rules-{mode}/    # Mode-specific smart rules
    ├── database.md
    └── frontend.md
```

### Rule Format

Each smart rule is a markdown file with YAML frontmatter:

````markdown
---
use-when: "interacting with Supabase client, database queries, or authentication"
priority: 10
dependencies:
    - "typescript.md"
---

# Supabase Best Practices

When working with Supabase:

## Authentication

- Always use TypeScript for better type safety
- Prefer RLS policies over client-side filtering
- Store sensitive configuration in environment variables

## Database Queries

```typescript
// Good: Type-safe query with error handling
const { data, error } = await supabase.from<User>("users").select("*").eq("id", userId).single()

if (error) throw error
```
````

## Real-time Subscriptions

- Always clean up subscriptions in useEffect cleanup
- Use proper TypeScript types for real-time payloads

````

### Frontmatter Fields

- **use-when** (required): Description of when this rule should be applied. This is matched semantically against user queries.
- **priority** (optional): Higher priority rules are selected first when multiple rules match (default: 0)
- **dependencies** (optional): Array of other rule filenames that should be included when this rule is selected

## Configuration

Smart Rules can be configured in VS Code settings:

```json
{
  "roo-cline.smartRules.enabled": true,
  "roo-cline.smartRules.minSimilarity": 0.7,
  "roo-cline.smartRules.maxRules": 5,
  "roo-cline.smartRules.showSelectedRules": false,
  "roo-cline.smartRules.debugRuleSelection": false
}
````

### Settings

- **enabled**: Enable/disable smart rules functionality
- **minSimilarity**: Minimum similarity score (0-1) for rule selection. Lower values include more rules.
- **maxRules**: Maximum number of smart rules to include in a single prompt
- **showSelectedRules**: Display which rules were selected in the UI
- **debugRuleSelection**: Enable detailed logging of the rule selection process

## Examples

### Example 1: Database Operations

**User Query**: "Set up Supabase authentication in my Next.js app"

**Selected Rules**:

1. `supabase.md` (score: 0.85) - Matched "Supabase" and "authentication"
2. `nextjs-app-router.md` (score: 0.72) - Matched "Next.js app"
3. `typescript.md` (score: 0.70) - Included as dependency of supabase.md

### Example 2: API Development

**User Query**: "Create a REST API endpoint for user management"

**Selected Rules**:

1. `api-design.md` (score: 0.88) - Matched "REST API" and "endpoint"
2. `testing.md` (score: 0.70) - Included as dependency
3. `validation.md` (score: 0.71) - Matched "user management"

## Best Practices

### Writing Effective use-when Triggers

1. **Be Specific**: Include key terms and phrases that users would naturally use

    ```yaml
    # Good
    use-when: "working with React hooks, useState, useEffect, or custom hooks"

    # Too vague
    use-when: "React development"
    ```

2. **Include Variations**: Account for different ways users might describe the same task

    ```yaml
    use-when: "database queries, SQL operations, data fetching, or ORM usage"
    ```

3. **Use Natural Language**: Write triggers as if describing when a human would need the rule
    ```yaml
    use-when: "debugging performance issues, optimizing slow code, or profiling applications"
    ```

### Organizing Rules

1. **Granular Rules**: Create focused rules for specific topics rather than large, general rules
2. **Use Dependencies**: Link related rules instead of duplicating content
3. **Mode-Specific Rules**: Place mode-specific rules in `smart-rules-{mode}` directories
4. **Prioritize Important Rules**: Use the priority field for rules that should take precedence

### Performance Considerations

1. **Rule Count**: While there's no hard limit, 50-100 well-organized rules perform well
2. **Content Size**: Keep individual rules focused; very large rules still consume tokens when selected
3. **Similarity Threshold**: Adjust `minSimilarity` based on your rule specificity:
    - 0.8-1.0: Very strict matching, fewer rules selected
    - 0.6-0.8: Balanced matching (recommended)
    - 0.4-0.6: Loose matching, more rules selected

## Migration Guide

### From Traditional Rules

1. **Identify Rule Categories**: Group your existing rules by topic or use case
2. **Create Smart Rule Files**: Convert each group into a smart rule with appropriate `use-when` trigger
3. **Add Dependencies**: Link related rules using the dependencies field
4. **Test Selection**: Use debug mode to verify rules are selected appropriately
5. **Adjust Triggers**: Refine `use-when` descriptions based on actual usage

### Example Migration

**Before** (`.roo/rules/database.md`):

```markdown
# Database Rules

Always use prepared statements...
```

**After** (`.roo/smart-rules/database.md`):

```markdown
---
use-when: "database operations, SQL queries, data persistence, or ORM configuration"
priority: 5
---

# Database Rules

Always use prepared statements...
```

## Troubleshooting

### Rules Not Being Selected

1. **Check Similarity Score**: Enable `debugRuleSelection` to see similarity scores
2. **Lower Threshold**: Temporarily reduce `minSimilarity` to test
3. **Improve Triggers**: Add more relevant keywords to `use-when`
4. **Verify File Location**: Ensure rules are in correct directories

### Too Many Rules Selected

1. **Increase Threshold**: Raise `minSimilarity` value
2. **Reduce Max Rules**: Lower `maxRules` setting
3. **Refine Triggers**: Make `use-when` descriptions more specific

### Performance Issues

1. **Check Rule Count**: Large numbers of rules may slow selection
2. **Optimize Content**: Keep rule content focused and concise
3. **Review Dependencies**: Avoid circular or excessive dependencies

## Advanced Usage

### Dynamic Rule Generation

Smart rules can be generated programmatically for large projects:

```javascript
const generateSmartRule = (component, guidelines) => ({
	filename: `${component.toLowerCase()}.md`,
	frontmatter: {
		"use-when": `working with ${component} component, ${component} API, or ${component} configuration`,
		priority: component.critical ? 10 : 5,
	},
	content: guidelines,
})
```

### Integration with CI/CD

Validate smart rules in your pipeline:

```bash
# Check for required frontmatter
find .roo/smart-rules -name "*.md" -exec grep -L "use-when:" {} \;

# Validate YAML frontmatter
for file in .roo/smart-rules/*.md; do
  head -n 20 "$file" | sed -n '/^---$/,/^---$/p' | yaml-lint
done
```

## Future Enhancements

- **Machine Learning**: Improve matching using embeddings and vector similarity
- **Rule Analytics**: Track which rules are most frequently selected
- **Auto-generation**: Generate rules from codebase patterns and documentation
- **Rule Sharing**: Community marketplace for smart rule templates
