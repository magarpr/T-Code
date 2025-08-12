"use client"

import { useTheme } from "next-themes"
import { useEffect, useState } from "react"

export function useLogoSrc(): string {
	const { resolvedTheme, theme } = useTheme()
	const [mounted, setMounted] = useState(false)

	// Avoid hydration mismatch by waiting for client-side mount
	useEffect(() => {
		setMounted(true)
	}, [])

	// Before mounting, return a default logo (dark theme as specified in providers)
	// This prevents the logo from flickering on initial load
	if (!mounted) {
		return "/Takara-Coder-Logo-Horiz-white.svg"
	}

	// Use theme as fallback if resolvedTheme is not available yet
	const currentTheme = resolvedTheme || theme
	return currentTheme === "light" ? "/Takara-Coder-Logo-Horiz-blk.svg" : "/Takara-Coder-Logo-Horiz-white.svg"
}
