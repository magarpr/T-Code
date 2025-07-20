import React from "react"
import ReactDOM from "react-dom/client"
import WebPreviewView from "./components/webpreview/WebPreviewView"
import "./index.css"

const root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement)
root.render(
	<React.StrictMode>
		<WebPreviewView />
	</React.StrictMode>,
)
