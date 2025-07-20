# Web Preview Feature

The Web Preview feature in Roo Code allows developers to preview web applications directly within VSCode and select UI elements to provide context to the AI assistant. This feature is similar to Windsurf IDE's preview functionality.

## Features

- **Integrated Web Preview**: View web applications in a dedicated panel within VSCode
- **Element Selection**: Click on UI elements to select them and extract their context
- **Responsive Design Testing**: Switch between different device viewports
- **Element Context Extraction**: Automatically extract HTML, CSS, position, and other metadata
- **AI Integration**: Selected element context is automatically sent to the AI assistant

## How to Use

### Opening the Web Preview

1. Open the Web Preview panel by:
    - Using the command palette: `Cmd/Ctrl + Shift + P` → "Roo Code: Open Web Preview"
    - Clicking on the Web Preview icon in the Roo Code sidebar

### Loading a URL

1. Enter the URL in the address bar at the top of the preview panel
2. Click "Go" or press Enter to load the page

### Selecting Elements

1. Click the "🎯 Select Element" button to enable element selection mode
2. Hover over elements in the preview to see them highlighted
3. Click on an element to select it
4. The element's context will be automatically sent to the AI chat

### Device Simulation

Use the device selector dropdown to switch between different viewport sizes:

- Responsive (default)
- iPhone SE (375x667)
- iPhone 12/13 (390x844)
- iPad (768x1024)
- Desktop (1280x800)
- Full HD (1920x1080)

## Element Context

When you select an element, the following information is extracted and sent to the AI:

- **HTML**: The complete HTML of the selected element
- **CSS**: All CSS rules that apply to the element
- **Position**: X, Y coordinates and dimensions (width, height)
- **Computed Styles**: Key style properties like display, position, colors, fonts
- **Attributes**: All HTML attributes on the element
- **Selectors**: Both CSS selector and XPath for the element

## Example Use Cases

1. **UI Debugging**: Select a misaligned element and ask the AI to fix the CSS
2. **Component Analysis**: Select a component and ask the AI to explain how it works
3. **Style Improvements**: Select an element and ask for design suggestions
4. **Accessibility**: Select elements and ask for accessibility improvements
5. **Code Generation**: Select a UI pattern and ask the AI to create similar components

## Limitations

- **Cross-Origin Restrictions**: Element inspection may not work on pages with strict CORS policies
- **IFrame Content**: Cannot inspect elements inside cross-origin iframes
- **Dynamic Content**: Some dynamically loaded content may not be immediately selectable

## Technical Details

The Web Preview feature consists of:

1. **WebPreviewProvider**: Main provider class that manages the preview panel
2. **Preview UI**: HTML/CSS/JS for the preview interface and controls
3. **Element Inspector**: JavaScript injection for element selection and context extraction
4. **Message Passing**: Communication between the preview, extension, and AI chat

## API Reference

### WebPreviewProvider

```typescript
class WebPreviewProvider {
	// Load a URL in the preview
	loadUrl(url: string): Promise<void>

	// Set viewport dimensions
	setViewport(width: number, height: number): Promise<void>

	// Get the last selected element context
	getSelectedElementContext(): ElementContext | undefined
}
```

### ElementContext Interface

```typescript
interface ElementContext {
	html: string
	css: string
	position: {
		x: number
		y: number
		width: number
		height: number
	}
	computedStyles?: Record<string, string>
	attributes?: Record<string, string>
	xpath?: string
	selector?: string
}
```

## Contributing

To contribute to the Web Preview feature:

1. The main code is in `src/core/webview/WebPreviewProvider.ts`
2. Preview UI assets are in `src/core/webview/preview/`
3. Tests are in `src/__tests__/WebPreviewProvider.spec.ts`
4. Message types are defined in `src/shared/ExtensionMessage.ts`

Please ensure all tests pass and add new tests for any new functionality.
