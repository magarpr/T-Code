import axios from "axios"
import { ModelRecord } from "../../../shared/api"
import { openAiModelInfoSaneDefaults } from "@roo-code/types"

export async function getLmStudioModels(baseUrl = "http://localhost:1234"): Promise<ModelRecord> {
	try {
		if (!URL.canParse(baseUrl)) {
			return {}
		}

		const response = await axios.get(`${baseUrl}/api/v0/models`)
		return response.data?.data?.reduce((acc: ModelRecord, model: any) => {
			acc[model.id] = {
				maxTokens:
					model.loaded_context_length ||
					model.max_context_length ||
					openAiModelInfoSaneDefaults.contextWindow,
				contextWindow:
					model.loaded_context_length ||
					model.max_context_length ||
					openAiModelInfoSaneDefaults.contextWindow,
				supportsImages: false,
				supportsPromptCache: false,
				supportsComputerUse: false,
				inputPrice: 0,
				outputPrice: 0,
				cacheWritesPrice: 0,
				cacheReadsPrice: 0,
			}
			return acc
		}, {})
	} catch (error) {
		return {}
	}
}
