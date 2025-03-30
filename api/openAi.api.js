import OpenAIAPI from 'openai';
import { createReadStream } from 'fs'
import * as dotenv from 'dotenv'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { writeFileSync } from 'fs'
import {Logger} from "../utils/logger.utils.js";

dotenv.config({ path: '.env' })
const __dirname = dirname(fileURLToPath(import.meta.url))
const API_KEY = process.env.OPENAI_API_KEY

class OpenAI {
	roles = {
		SYSTEM: 'system',
		USER: 'user',
		ASSISTANT: 'assistant'
	}
	constructor(apiKey) {
		this.openai = new OpenAIAPI({
			apiKey,
		});
	}

	// Getting ChatGPT response
	async chat(messages) {
		try {
			const response = await this.openai.chat.completions.create({
				model: 'gpt-4o-mini',
				messages: messages,
			});

			return response.choices[0].message;
		} catch (err) {
			Logger.error('Request to ChatGPT', 'openAi.api', '', err.message, 'ERROR')
		}
	}

	// Translating .mp3 to text
	async speechToText(filePath) {
		try {
			const response = await this.openai.audio.transcriptions.create({
				file: createReadStream(filePath),
				// model: 'whisper-1',
				model: 'gpt-4o-transcribe',
				// TODO: Make it a setting
				language: 'en',
			});

			return response.text
		} catch (err) {
			Logger.error('Speech to text', 'openAi.api', '', err.message, 'ERROR')
		}
	}

	async textToSpeech(userId, text) {
		const response = await this.openai.audio.speech.create({
			model: 'tts-1',
			voice: 'nova',
			input: text,
		});

		const timestamp = Date.now();
		const filePath = resolve(__dirname, `../audio/response/${userId}`, `${userId}-${timestamp}.ogg`);

		const buffer = Buffer.from(await response.arrayBuffer());

		writeFileSync(filePath, buffer, {encoding:'base64'});
		return filePath;
	}

	async getPicture(message) {

	}
}

export const openAi = new OpenAI(API_KEY)
