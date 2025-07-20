import React, { useState, useEffect } from "react"
import { useTranslation } from "react-i18next"
import { MagnifyingGlassIcon, ReaderIcon, LightningBoltIcon, CheckCircledIcon } from "@radix-ui/react-icons"
import MarkdownBlock from "../common/MarkdownBlock"

interface AIDeepResearchBlockProps {
	query: string
	status?: "thinking" | "searching" | "reading" | "analyzing" | "completed"
	content?: string
	result?: string
}

const AIDeepResearchBlock: React.FC<AIDeepResearchBlockProps> = ({ query, status, content, result }) => {
	const { t } = useTranslation("chat")
	const [isExpanded, setIsExpanded] = useState(true)
	const [displayContent, setDisplayContent] = useState("")

	useEffect(() => {
		if (content) {
			setDisplayContent(content)
		}
	}, [content])

	const getStatusIcon = () => {
		switch (status) {
			case "thinking":
				return <LightningBoltIcon className="w-4 h-4 animate-pulse" />
			case "searching":
				return <MagnifyingGlassIcon className="w-4 h-4 animate-spin" />
			case "reading":
				return <ReaderIcon className="w-4 h-4 animate-pulse" />
			case "analyzing":
				return <LightningBoltIcon className="w-4 h-4 animate-pulse" />
			case "completed":
				return <CheckCircledIcon className="w-4 h-4 text-green-500" />
			default:
				return null
		}
	}

	const getStatusText = () => {
		switch (status) {
			case "thinking":
				return t("aiDeepResearch.thinking", "Thinking...")
			case "searching":
				return t("aiDeepResearch.searching", "Searching the web...")
			case "reading":
				return t("aiDeepResearch.reading", "Reading sources...")
			case "analyzing":
				return t("aiDeepResearch.analyzing", "Analyzing information...")
			case "completed":
				return t("aiDeepResearch.completed", "Research completed")
			default:
				return t("aiDeepResearch.initializing", "Initializing research...")
		}
	}

	return (
		<div className="flex flex-col gap-2 my-2">
			<div className="bg-vscode-editor-background border border-vscode-border rounded-xs overflow-hidden">
				<div
					className="flex items-center justify-between gap-2 px-3 py-2 cursor-pointer hover:bg-vscode-list-hoverBackground"
					onClick={() => setIsExpanded(!isExpanded)}>
					<div className="flex items-center gap-2 flex-1">
						{getStatusIcon()}
						<span className="font-medium text-vscode-foreground">
							{t("aiDeepResearch.title", "AI Deep Research")}
						</span>
						<span className="text-vscode-descriptionForeground text-sm">{getStatusText()}</span>
					</div>
					<span className={`codicon codicon-chevron-${isExpanded ? "up" : "down"}`}></span>
				</div>

				{isExpanded && (
					<div className="border-t border-vscode-border">
						<div className="px-3 py-2">
							<div className="text-sm text-vscode-descriptionForeground mb-2">
								<strong>{t("aiDeepResearch.query", "Query")}:</strong> {query}
							</div>

							{status === "thinking" && displayContent && (
								<div className="bg-vscode-editor-inactiveSelectionBackground rounded p-2 mb-2">
									<div className="text-xs text-vscode-descriptionForeground mb-1">
										{t("aiDeepResearch.thoughtProcess", "Thought Process")}
									</div>
									<div className="text-sm text-vscode-foreground whitespace-pre-wrap">
										{displayContent}
									</div>
								</div>
							)}

							{status === "searching" && displayContent && (
								<div className="text-sm text-vscode-foreground">
									<span className="text-vscode-textLink-foreground">
										{t("aiDeepResearch.searchingFor", "Searching for")}: {displayContent}
									</span>
								</div>
							)}

							{status === "reading" && displayContent && (
								<div className="text-sm text-vscode-foreground">
									<span className="text-vscode-textLink-foreground">
										{t("aiDeepResearch.readingUrl", "Reading")}: {displayContent}
									</span>
								</div>
							)}

							{status === "analyzing" && displayContent && (
								<div className="text-sm text-vscode-foreground">
									<span className="text-vscode-descriptionForeground">
										{t("aiDeepResearch.analyzingContent", "Analyzing content...")}
									</span>
								</div>
							)}

							{status === "completed" && result && (
								<div className="mt-3">
									<div className="text-xs text-vscode-descriptionForeground mb-2">
										{t("aiDeepResearch.results", "Research Results")}
									</div>
									<div className="bg-vscode-editor-inactiveSelectionBackground rounded p-3">
										<MarkdownBlock markdown={result} />
									</div>
								</div>
							)}
						</div>
					</div>
				)}
			</div>
		</div>
	)
}

export default AIDeepResearchBlock
