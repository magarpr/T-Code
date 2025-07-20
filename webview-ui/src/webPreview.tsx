import React from "react"
import ReactDOM from "react-dom/client"
import WebPreview from "./components/web-preview/WebPreview"
import "./index.css"

const root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement)
root.render(
	<React.StrictMode>
		<WebPreview />
	</React.StrictMode>,
)
