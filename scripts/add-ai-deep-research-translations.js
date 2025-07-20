const fs = require("fs")
const path = require("path")

const aiDeepResearchTranslations = {
	aiDeepResearch: {
		title: "AI Deep Research",
		thinking: "Thinking...",
		searching: "Searching the web...",
		reading: "Reading sources...",
		analyzing: "Analyzing information...",
		completed: "Research completed",
		initializing: "Initializing research...",
		query: "Query",
		thoughtProcess: "Thought Process",
		searchingFor: "Searching for",
		readingUrl: "Reading",
		analyzingContent: "Analyzing content...",
		results: "Research Results",
	},
}

const locales = [
	"ca",
	"de",
	"es",
	"fr",
	"hi",
	"id",
	"it",
	"ja",
	"ko",
	"nl",
	"pl",
	"pt-BR",
	"ru",
	"tr",
	"vi",
	"zh-CN",
	"zh-TW",
]

locales.forEach((locale) => {
	const filePath = path.join(__dirname, "..", "webview-ui", "src", "i18n", "locales", locale, "chat.json")

	try {
		const content = JSON.parse(fs.readFileSync(filePath, "utf8"))

		// Remove any flat keys that were added incorrectly
		Object.keys(content).forEach((key) => {
			if (key.startsWith("aiDeepResearch.")) {
				delete content[key]
			}
		})

		// Add the nested translations
		content.aiDeepResearch = aiDeepResearchTranslations.aiDeepResearch

		// Write back the file with proper formatting
		fs.writeFileSync(filePath, JSON.stringify(content, null, "\t") + "\n", "utf8")
		console.log(`✅ Updated ${locale}/chat.json`)
	} catch (error) {
		console.error(`❌ Error updating ${locale}/chat.json:`, error.message)
	}
})

console.log("\nDone! All translations have been added.")
