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
	async chat(messages, model = null) {
		if (!model) {
			model = process.env.OPENAI_DEFAULT_MODEL;
		}

		try {
			const response = await this.openai.chat.completions.create({
				model: model,
				messages: messages,
			});

			return response.choices[0].message;
		} catch (err) {
			Logger.error('Request to ChatGPT', 'openAi.api', '', err.message, 'ERROR', err);
		}
	}

	// Translating .mp3 to text
	async speechToText(filePath, model) {
		try {
			const response = await this.openai.audio.transcriptions.create({
				file: createReadStream(filePath),
				// model: 'whisper-1',
				model: model,
				// TODO: Make it a setting
				language: 'en',
			});

			return response.text
		} catch (err) {
			Logger.error('Speech to text', 'openAi.api', '', err.message, 'ERROR', err);
		}
	}

	async textToSpeech(userId, text) {
		const response = await this.openai.audio.speech.create({
			model: 'tts-1',
			voice: process.env.OPENAI_TTS_VOICE ?? 'nova',
			input: text,
		});

		const timestamp = Date.now();
		const filePath = resolve(__dirname, `../audio/response/${userId}`, `${userId}-${timestamp}.ogg`);

		const buffer = Buffer.from(await response.arrayBuffer());

		writeFileSync(filePath, buffer, {encoding:'base64'});
		return filePath;
	}

	async processTranscriptions(gpt4oText, whisperText, messages) {
		const lastMessages = messages.slice(-10);
		let contextMessagesString = '';

		for (const message of lastMessages) {
			if (message.role === this.roles.USER) {
				contextMessagesString += `
"
${message.content}
"
				`;
			}
		}

		let processPrompt = `
There are two transcriptions of the audio message.
The first one is done by 'whisper-1' and is less reliable.
The second is done by 'gpt-4o-transcribe', but the text can be truncated.

Also because of transcription it's possible that some words are misinterpreted.
For that you have 10 previous messages for the context, so you can fix the transcription.

Based on previous messages context and these two texts write the most accurate transcription
of the text. Do not write anything else. Do not write your own words. I need just the combined
transcription text. Fix the possible transcription mistakes.

Here is the transcription done by 'whisper-1'. It's unreliable, but doesn't have a chance
to be truncated:

"
${whisperText}
"

Here is the transcription done by 'gpt-4o-transcribe'. It's possible that it isn't the
complete transcription:

"
${gpt4oText}
"
		`;

		let messagesString;

		if (contextMessagesString !== '') {
			messagesString = `

Here are the context messages:

${contextMessagesString}
			`;
		} else {
			messagesString = `

There are no context messages.
			`;
		}

		processPrompt += messagesString;

		const transcriptionMessageArray = [];
		transcriptionMessageArray.push({role: this.roles.USER, content: processPrompt})

		const response = await this.chat(transcriptionMessageArray, 'gpt-4o');
		return response.content;
	}

	async getPicture(message) {

	}
}

export const openAi = new OpenAI(API_KEY)
