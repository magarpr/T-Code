// npx vitest run src/__tests__/index.test.ts

import { generatePackageJson } from "../index.js"

describe("generatePackageJson", () => {
	it("should be a test", () => {
		const generatedPackageJson = generatePackageJson({
			packageJson: {
				name: "roo-cline",
				displayName: "%extension.displayName%",
				description: "%extension.description%",
				publisher: "RooVeterinaryInc",
				version: "3.17.2",
				icon: "assets/icons/icon.png",
				contributes: {
					viewsContainers: {
						activitybar: [
							{
								id: "roo-cline-ActivityBar",
								title: "%views.activitybar.title%",
								icon: "assets/icons/icon.svg",
							},
						],
					},
					views: {
						"roo-cline-ActivityBar": [
							{
								type: "webview",
								id: "roo-cline.SidebarProvider",
								name: "",
							},
						],
					},
					commands: [
						{
							command: "roo-cline.plusButtonClicked",
							title: "%command.newTask.title%",
							icon: "$(add)",
						},
						{
							command: "roo-cline.openInNewTab",
							title: "%command.openInNewTab.title%",
							category: "%configuration.title%",
						},
					],
					menus: {
						"editor/context": [
							{
								submenu: "roo-cline.contextMenu",
								group: "navigation",
							},
						],
						"roo-cline.contextMenu": [
							{
								command: "roo-cline.addToContext",
								group: "1_actions@1",
							},
						],
						"editor/title": [
							{
								command: "roo-cline.plusButtonClicked",
								group: "navigation@1",
								when: "activeWebviewPanelId == roo-cline.TabPanelProvider",
							},
							{
								command: "roo-cline.settingsButtonClicked",
								group: "navigation@6",
								when: "activeWebviewPanelId == roo-cline.TabPanelProvider",
							},
							{
								command: "roo-cline.accountButtonClicked",
								group: "navigation@6",
								when: "activeWebviewPanelId == roo-cline.TabPanelProvider",
							},
						],
					},
					submenus: [
						{
							id: "roo-cline.contextMenu",
							label: "%views.contextMenu.label%",
						},
						{
							id: "roo-cline.terminalMenu",
							label: "%views.terminalMenu.label%",
						},
					],
					configuration: {
						title: "%configuration.title%",
						properties: {
							"roo-cline.allowedCommands": {
								type: "array",
								items: {
									type: "string",
								},
								default: ["npm test", "npm install", "tsc", "git log", "git diff", "git show"],
								description: "%commands.allowedCommands.description%",
							},
							"roo-cline.customStoragePath": {
								type: "string",
								default: "",
								description: "%settings.customStoragePath.description%",
							},
						},
					},
				},
				scripts: {
					lint: "eslint **/*.ts",
				},
			},
			overrideJson: {
				name: "takara-coder-nightly",
				displayName: "Takara Coder Nightly",
				publisher: "RooVeterinaryInc",
				version: "0.0.1",
				icon: "assets/icons/icon-nightly.png",
				scripts: {},
			},
			substitution: ["roo-cline", "takara-coder-nightly"],
		})

		expect(generatedPackageJson).toStrictEqual({
			name: "takara-coder-nightly",
			displayName: "Takara Coder Nightly",
			description: "%extension.description%",
			publisher: "RooVeterinaryInc",
			version: "0.0.1",
			icon: "assets/icons/icon-nightly.png",
			contributes: {
				viewsContainers: {
					activitybar: [
						{
							id: "takara-coder-nightly-ActivityBar",
							title: "%views.activitybar.title%",
							icon: "assets/icons/icon.svg",
						},
					],
				},
				views: {
					"takara-coder-nightly-ActivityBar": [
						{
							type: "webview",
							id: "takara-coder-nightly.SidebarProvider",
							name: "",
						},
					],
				},
				commands: [
					{
						command: "takara-coder-nightly.plusButtonClicked",
						title: "%command.newTask.title%",
						icon: "$(add)",
					},
					{
						command: "takara-coder-nightly.openInNewTab",
						title: "%command.openInNewTab.title%",
						category: "%configuration.title%",
					},
				],
				menus: {
					"editor/context": [
						{
							submenu: "takara-coder-nightly.contextMenu",
							group: "navigation",
						},
					],
					"takara-coder-nightly.contextMenu": [
						{
							command: "takara-coder-nightly.addToContext",
							group: "1_actions@1",
						},
					],
					"editor/title": [
						{
							command: "takara-coder-nightly.plusButtonClicked",
							group: "navigation@1",
							when: "activeWebviewPanelId == takara-coder-nightly.TabPanelProvider",
						},
						{
							command: "takara-coder-nightly.settingsButtonClicked",
							group: "navigation@6",
							when: "activeWebviewPanelId == takara-coder-nightly.TabPanelProvider",
						},
						{
							command: "takara-coder-nightly.accountButtonClicked",
							group: "navigation@6",
							when: "activeWebviewPanelId == takara-coder-nightly.TabPanelProvider",
						},
					],
				},
				submenus: [
					{
						id: "takara-coder-nightly.contextMenu",
						label: "%views.contextMenu.label%",
					},
					{
						id: "takara-coder-nightly.terminalMenu",
						label: "%views.terminalMenu.label%",
					},
				],
				configuration: {
					title: "%configuration.title%",
					properties: {
						"takara-coder-nightly.allowedCommands": {
							type: "array",
							items: {
								type: "string",
							},
							default: ["npm test", "npm install", "tsc", "git log", "git diff", "git show"],
							description: "%commands.allowedCommands.description%",
						},
						"takara-coder-nightly.customStoragePath": {
							type: "string",
							default: "",
							description: "%settings.customStoragePath.description%",
						},
					},
				},
			},
			scripts: {},
		})
	})
})
