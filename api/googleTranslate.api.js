import googleTranslate from 'google-translate-api-x'
import { speak } from 'google-translate-api-x'
import { writeFileSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import { Logger } from '../utils/logger.utils.js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env' })
const __dirname = dirname(fileURLToPath(import.meta.url))

class GoogleTranslate {
	constructor() {
	}
	// Translate
	async translate(input, params) {
		return await googleTranslate(input, {/**from: 'nl',*/ to: params.to}).then(res => {  // 'Ik spreek Engels'
			// console.log(res.text)
			//=> I speak English
			// console.log(res.from.language.iso)
			return {text: res.text, from: res.from.language.iso, to: params.to}
			//=> nl
		}).catch(err => {
			Logger.error('GoogleTranslate', 'googleTranslate.api', '', err.message, 'ERROR', err);
		})
	}

	// Text to speech
	async textToSpeech(userId, input) {
		const timestamp = Date.now()
		const filePath = resolve(__dirname, `../audio/response/${userId}`, `${userId}-${timestamp}.ogg`)

		const res = await speak(input, {to: process.env.GOOGLE_TTS_TO})

		writeFileSync(filePath, res, {encoding:'base64'})
		return filePath
	}
}

export const googleTranslator = new GoogleTranslate()
