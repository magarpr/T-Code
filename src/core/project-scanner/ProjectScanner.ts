import * as path from "path"
import * as fs from "fs/promises"
import { listFiles } from "../../services/glob/list-files"
import { RooIgnoreController } from "../ignore/RooIgnoreController"

export interface ProjectInfo {
	name: string
	description: string
	rootPath: string
	structure: ProjectStructure
	technologies: Technology[]
	configFiles: ConfigFile[]
	dependencies: Dependencies
	scripts: Scripts
	gitInfo: GitInfo
	patterns: ProjectPatterns
}

export interface ProjectStructure {
	directories: DirectoryInfo[]
	fileCount: number
	totalSize: number
	fileTypes: Record<string, number>
}

export interface DirectoryInfo {
	name: string
	path: string
	fileCount: number
	subdirectories: string[]
}

export interface Technology {
	name: string
	version?: string
	configFile?: string
	type: "language" | "framework" | "tool" | "database" | "service"
}

export interface ConfigFile {
	name: string
	path: string
	type: string
	content?: any
}

export interface Dependencies {
	production: Record<string, string>
	development: Record<string, string>
	peer?: Record<string, string>
}

export interface Scripts {
	[key: string]: string
}

export interface GitInfo {
	hasGit: boolean
	branch?: string
	remote?: string
	lastCommit?: string
}

export interface ProjectPatterns {
	architecture?: string
	testingFramework?: string
	buildTool?: string
	packageManager?: string
	cicd?: string[]
}

export class ProjectScanner {
	constructor(
		private readonly rootPath: string,
		private readonly rooIgnoreController?: RooIgnoreController,
	) {}

	async scanProject(): Promise<ProjectInfo> {
		const [files, _] = await listFiles(this.rootPath, true, 10000)

		// Filter files through rooIgnoreController if available
		const filteredFiles = this.rooIgnoreController
			? files.filter((file) => {
					// Check if the rooIgnoreController would filter this path
					const filtered = this.rooIgnoreController!.filterPaths([file])
					return filtered.includes(file)
				})
			: files

		const projectInfo: ProjectInfo = {
			name: await this.detectProjectName(),
			description: await this.detectProjectDescription(),
			rootPath: this.rootPath,
			structure: await this.analyzeStructure(filteredFiles),
			technologies: await this.detectTechnologies(filteredFiles),
			configFiles: await this.findConfigFiles(filteredFiles),
			dependencies: await this.analyzeDependencies(),
			scripts: await this.analyzeScripts(),
			gitInfo: await this.analyzeGitInfo(),
			patterns: await this.detectPatterns(filteredFiles),
		}

		return projectInfo
	}

	private async detectProjectName(): Promise<string> {
		// Try to get name from package.json
		try {
			const packageJsonPath = path.join(this.rootPath, "package.json")
			const content = await fs.readFile(packageJsonPath, "utf-8")
			const packageJson = JSON.parse(content)
			if (packageJson.name) return packageJson.name
		} catch {}

		// Try to get name from pyproject.toml
		try {
			const pyprojectPath = path.join(this.rootPath, "pyproject.toml")
			const content = await fs.readFile(pyprojectPath, "utf-8")
			const match = content.match(/name\s*=\s*"([^"]+)"/)
			if (match) return match[1]
		} catch {}

		// Default to directory name
		return path.basename(this.rootPath)
	}

	private async detectProjectDescription(): Promise<string> {
		// Try to get description from package.json
		try {
			const packageJsonPath = path.join(this.rootPath, "package.json")
			const content = await fs.readFile(packageJsonPath, "utf-8")
			const packageJson = JSON.parse(content)
			if (packageJson.description) return packageJson.description
		} catch {}

		// Try to get description from README
		try {
			const readmePath = path.join(this.rootPath, "README.md")
			const content = await fs.readFile(readmePath, "utf-8")
			const lines = content.split("\n")
			// Get first non-header, non-empty line
			for (const line of lines) {
				const trimmed = line.trim()
				if (trimmed && !trimmed.startsWith("#") && !trimmed.startsWith("![")) {
					return trimmed.substring(0, 200)
				}
			}
		} catch {}

		return "No description available"
	}

	private async analyzeStructure(files: string[]): Promise<ProjectStructure> {
		const directories = new Map<string, DirectoryInfo>()
		const fileTypes: Record<string, number> = {}
		let totalSize = 0

		for (const file of files) {
			if (file.endsWith("/")) {
				// It's a directory
				const dirPath = file.slice(0, -1)
				const dirName = path.basename(dirPath)
				const parentDir = path.dirname(dirPath)

				if (!directories.has(dirPath)) {
					directories.set(dirPath, {
						name: dirName,
						path: dirPath,
						fileCount: 0,
						subdirectories: [],
					})
				}

				if (parentDir !== "." && directories.has(parentDir)) {
					directories.get(parentDir)!.subdirectories.push(dirName)
				}
			} else {
				// It's a file
				const ext = path.extname(file).toLowerCase()
				fileTypes[ext] = (fileTypes[ext] || 0) + 1

				const dir = path.dirname(file)
				if (directories.has(dir)) {
					directories.get(dir)!.fileCount++
				}
			}
		}

		// Get top-level directories
		const topLevelDirs = Array.from(directories.values())
			.filter((dir) => path.dirname(dir.path) === ".")
			.sort((a, b) => a.name.localeCompare(b.name))

		return {
			directories: topLevelDirs,
			fileCount: files.filter((f) => !f.endsWith("/")).length,
			totalSize,
			fileTypes,
		}
	}

	private async detectTechnologies(files: string[]): Promise<Technology[]> {
		const technologies: Technology[] = []
		const fileSet = new Set(files)

		// Node.js / JavaScript
		if (fileSet.has("package.json")) {
			technologies.push({ name: "Node.js", type: "language", configFile: "package.json" })

			// Check for specific frameworks
			try {
				const content = await fs.readFile(path.join(this.rootPath, "package.json"), "utf-8")
				const pkg = JSON.parse(content)
				const deps = { ...pkg.dependencies, ...pkg.devDependencies }

				if (deps.react) technologies.push({ name: "React", version: deps.react, type: "framework" })
				if (deps.vue) technologies.push({ name: "Vue", version: deps.vue, type: "framework" })
				if (deps.angular) technologies.push({ name: "Angular", version: deps.angular, type: "framework" })
				if (deps.express) technologies.push({ name: "Express", version: deps.express, type: "framework" })
				if (deps.next) technologies.push({ name: "Next.js", version: deps.next, type: "framework" })
				if (deps.typescript)
					technologies.push({ name: "TypeScript", version: deps.typescript, type: "language" })
				if (deps.jest || deps.vitest || deps.mocha) {
					const testFramework = deps.jest ? "Jest" : deps.vitest ? "Vitest" : "Mocha"
					technologies.push({ name: testFramework, type: "tool" })
				}
			} catch {}
		}

		// Python
		if (fileSet.has("requirements.txt") || fileSet.has("pyproject.toml") || fileSet.has("setup.py")) {
			technologies.push({ name: "Python", type: "language" })

			// Check for frameworks
			try {
				const reqPath = path.join(this.rootPath, "requirements.txt")
				const content = await fs.readFile(reqPath, "utf-8")
				if (content.includes("django")) technologies.push({ name: "Django", type: "framework" })
				if (content.includes("flask")) technologies.push({ name: "Flask", type: "framework" })
				if (content.includes("fastapi")) technologies.push({ name: "FastAPI", type: "framework" })
			} catch {}
		}

		// Go
		if (fileSet.has("go.mod")) {
			technologies.push({ name: "Go", type: "language", configFile: "go.mod" })
		}

		// Rust
		if (fileSet.has("Cargo.toml")) {
			technologies.push({ name: "Rust", type: "language", configFile: "Cargo.toml" })
		}

		// Docker
		if (fileSet.has("Dockerfile") || fileSet.has("docker-compose.yml")) {
			technologies.push({ name: "Docker", type: "tool" })
		}

		return technologies
	}

	private async findConfigFiles(files: string[]): Promise<ConfigFile[]> {
		const configFiles: ConfigFile[] = []
		const configPatterns = [
			{ pattern: "package.json", type: "npm" },
			{ pattern: "tsconfig.json", type: "typescript" },
			{ pattern: ".eslintrc", type: "eslint" },
			{ pattern: ".prettierrc", type: "prettier" },
			{ pattern: "webpack.config.js", type: "webpack" },
			{ pattern: "vite.config", type: "vite" },
			{ pattern: "jest.config", type: "jest" },
			{ pattern: "vitest.config", type: "vitest" },
			{ pattern: ".gitignore", type: "git" },
			{ pattern: "Dockerfile", type: "docker" },
			{ pattern: "docker-compose", type: "docker" },
			{ pattern: ".env.example", type: "environment" },
			{ pattern: "requirements.txt", type: "python" },
			{ pattern: "pyproject.toml", type: "python" },
			{ pattern: "go.mod", type: "go" },
			{ pattern: "Cargo.toml", type: "rust" },
		]

		for (const file of files) {
			const basename = path.basename(file)
			for (const { pattern, type } of configPatterns) {
				if (basename.includes(pattern)) {
					configFiles.push({
						name: basename,
						path: file,
						type,
					})
				}
			}
		}

		return configFiles
	}

	private async analyzeDependencies(): Promise<Dependencies> {
		const dependencies: Dependencies = {
			production: {},
			development: {},
		}

		// Try to read package.json
		try {
			const packageJsonPath = path.join(this.rootPath, "package.json")
			const content = await fs.readFile(packageJsonPath, "utf-8")
			const pkg = JSON.parse(content)

			dependencies.production = pkg.dependencies || {}
			dependencies.development = pkg.devDependencies || {}
			dependencies.peer = pkg.peerDependencies
		} catch {}

		return dependencies
	}

	private async analyzeScripts(): Promise<Scripts> {
		const scripts: Scripts = {}

		// Try to read package.json scripts
		try {
			const packageJsonPath = path.join(this.rootPath, "package.json")
			const content = await fs.readFile(packageJsonPath, "utf-8")
			const pkg = JSON.parse(content)

			if (pkg.scripts) {
				Object.assign(scripts, pkg.scripts)
			}
		} catch {}

		// Try to read Makefile
		try {
			const makefilePath = path.join(this.rootPath, "Makefile")
			const content = await fs.readFile(makefilePath, "utf-8")
			const lines = content.split("\n")

			for (const line of lines) {
				const match = line.match(/^([a-zA-Z0-9_-]+):/)
				if (match) {
					scripts[`make ${match[1]}`] = "Makefile target"
				}
			}
		} catch {}

		return scripts
	}

	private async analyzeGitInfo(): Promise<GitInfo> {
		const gitInfo: GitInfo = {
			hasGit: false,
		}

		try {
			// Check if .git directory exists
			await fs.access(path.join(this.rootPath, ".git"))
			gitInfo.hasGit = true

			// Try to read current branch
			try {
				const headContent = await fs.readFile(path.join(this.rootPath, ".git", "HEAD"), "utf-8")
				const match = headContent.match(/ref: refs\/heads\/(.+)/)
				if (match) {
					gitInfo.branch = match[1].trim()
				}
			} catch {}

			// Try to read remote
			try {
				const configContent = await fs.readFile(path.join(this.rootPath, ".git", "config"), "utf-8")
				const remoteMatch = configContent.match(/url = (.+)/)
				if (remoteMatch) {
					gitInfo.remote = remoteMatch[1].trim()
				}
			} catch {}
		} catch {}

		return gitInfo
	}

	private async detectPatterns(files: string[]): Promise<ProjectPatterns> {
		const patterns: ProjectPatterns = {}
		const fileSet = new Set(files)

		// Detect architecture
		if (fileSet.has("src/") && (fileSet.has("src/components/") || fileSet.has("src/pages/"))) {
			patterns.architecture = "Component-based"
		} else if (fileSet.has("app/") && fileSet.has("app/models/")) {
			patterns.architecture = "MVC"
		} else if (fileSet.has("src/") && fileSet.has("src/domain/")) {
			patterns.architecture = "Domain-driven"
		}

		// Detect testing framework
		if (fileSet.has("jest.config.js") || fileSet.has("jest.config.ts")) {
			patterns.testingFramework = "Jest"
		} else if (fileSet.has("vitest.config.js") || fileSet.has("vitest.config.ts")) {
			patterns.testingFramework = "Vitest"
		} else if (fileSet.has(".mocharc.json")) {
			patterns.testingFramework = "Mocha"
		}

		// Detect build tool
		if (fileSet.has("webpack.config.js")) {
			patterns.buildTool = "Webpack"
		} else if (fileSet.has("vite.config.js") || fileSet.has("vite.config.ts")) {
			patterns.buildTool = "Vite"
		} else if (fileSet.has("rollup.config.js")) {
			patterns.buildTool = "Rollup"
		}

		// Detect package manager
		if (fileSet.has("package-lock.json")) {
			patterns.packageManager = "npm"
		} else if (fileSet.has("yarn.lock")) {
			patterns.packageManager = "yarn"
		} else if (fileSet.has("pnpm-lock.yaml")) {
			patterns.packageManager = "pnpm"
		}

		// Detect CI/CD
		const cicd: string[] = []
		if (fileSet.has(".github/workflows/")) cicd.push("GitHub Actions")
		if (fileSet.has(".gitlab-ci.yml")) cicd.push("GitLab CI")
		if (fileSet.has(".circleci/")) cicd.push("CircleCI")
		if (fileSet.has("Jenkinsfile")) cicd.push("Jenkins")
		if (cicd.length > 0) patterns.cicd = cicd

		return patterns
	}
}
