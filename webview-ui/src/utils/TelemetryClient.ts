import posthog from "posthog-js"

import { TelemetrySetting } from "@roo/TelemetrySetting"

class TelemetryClient {
	private static instance: TelemetryClient
	private static telemetryEnabled: boolean = false

	public updateTelemetryState(telemetrySetting: TelemetrySetting, apiKey?: string, distinctId?: string) {
		posthog.reset()

		if (telemetrySetting === "enabled" && apiKey && distinctId) {
			TelemetryClient.telemetryEnabled = true

			posthog.init(apiKey, {
				api_host: "https://us.i.posthog.com",
				persistence: "localStorage",
				loaded: () => posthog.identify(distinctId),
				capture_pageview: false,
				capture_pageleave: false,
				autocapture: false,
				// Disable service worker to prevent registration errors in VSCode webview
				disable_session_recording: true,
				disable_persistence: false,
				// Explicitly disable any service worker features
				opt_out_capturing_by_default: false,
				// Use XHR instead of fetch to avoid service worker issues
				xhr_headers: {
					"Content-Type": "application/json",
				},
				// Disable features that might try to use service workers
				bootstrap: {},
				// Ensure we're not using any advanced features that require service workers
				advanced_disable_decide: true,
				advanced_disable_feature_flags: false,
				advanced_disable_feature_flags_on_first_load: false,
				advanced_disable_toolbar_metrics: true,
			})
		} else {
			TelemetryClient.telemetryEnabled = false
		}
	}

	public static getInstance(): TelemetryClient {
		if (!TelemetryClient.instance) {
			TelemetryClient.instance = new TelemetryClient()
		}

		return TelemetryClient.instance
	}

	public capture(eventName: string, properties?: Record<string, any>) {
		if (TelemetryClient.telemetryEnabled) {
			try {
				posthog.capture(eventName, properties)
			} catch (_error) {
				// Silently fail if there's an error capturing an event.
			}
		}
	}
}

export const telemetryClient = TelemetryClient.getInstance()
