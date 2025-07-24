export function getMimeType(dataUri: string): string | null {
	const match = dataUri.match(/^data:(.*?);/)
	return match ? match[1] : null
}
