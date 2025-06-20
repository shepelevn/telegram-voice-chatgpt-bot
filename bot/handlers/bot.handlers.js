import { telegramBot } from '../bot.js'
import { config } from '../../config/config.service.js'
import { oggToMp3Converter } from '../../utils/converter.utils.js'
import { openAi } from '../../api/openAi.api.js'
import { yandexSpeech } from '../../api/yandexSpeech.api.js'
import { googleTranslator } from '../../api/googleTranslate.api.js'
import { utils } from '../../utils/utils.js'
import { message } from 'telegraf/filters'
import { code } from 'telegraf/format'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import { Logger } from '../../utils/logger.utils.js'
import * as fs from 'fs'

const __dirname = dirname(fileURLToPath(import.meta.url))

class BotHandlers {
	voice(telegramBot) {
		telegramBot.bot.on(message('voice'), async ctx => {
			try {
				if (!ctx.session) ctx.session = telegramBot.SESSION

				if (JSON.stringify(telegramBot.whitelist).includes(ctx.message.from.username)) {
					// Getting the userID
					const userId = String(ctx.message.from.id)
					// // Set user settings
					// await telegramBot.setUserSettings(userId)
					await ctx.reply(code('Идет обработка сообщения...'))
					// Getting link to .ogg file
					const voiceFileLink = await ctx.telegram.getFileLink(ctx.message.voice)

					const dirReq = `./audio/request/${userId}`
					if (!fs.existsSync(dirReq)) fs.mkdirSync(dirReq)

					// Getting and saving a file .ogg to disk in the 'audio' directory
					const timestamp = Date.now()
					const oggPath = await oggToMp3Converter.create(voiceFileLink.href, userId, timestamp)
					let text = ''
					let filePath

					if (ctx.session.messages.length === 0) {
						const practiceLanguage = process.env.PRACTICE_LANGUAGE ?? "English";
						const systemMessage = `
							You are the chatbot helping the user practice ${practiceLanguage}.
							You and the user are talking to each other through audio.
							Use some humor. 
						`;

						ctx.session.messages.push({role: openAi.roles.SYSTEM, content: systemMessage});
					}

					if (config.get('SPEECH_TO_TEXT_MODE') === 'openai') {
						// Converting .ogg file to .mp3
						// const mp3Path = await oggToMp3Converter.convert(oggPath, userId)
						// Recognition .mp3 file to text
						const [whisperText, gpt4oText] = await Promise.all([
							openAi.speechToText(oggPath, 'whisper-1'),
							openAi.speechToText(oggPath, 'gpt-4o-transcribe'),
						]);

						text = await openAi.processTranscriptions(gpt4oText, whisperText, ctx.session.messages);

						filePath = resolve(__dirname, `../../audio/request/${userId}`, `${userId}-${timestamp}.mp3`)
						// Deleting .mp3 file
						if (config.get('SAVE_VOICE_HISTORY') === 'response' || config.get('SAVE_VOICE_HISTORY') === 'false') {
							await utils.deleteFile(filePath)
							await utils.deleteDir(dirReq)
						}
					}

					if (config.get('SPEECH_TO_TEXT_MODE') === 'yandex') {
						// Recognition .ogg file to text
						text = await yandexSpeech.recognition(oggPath)
						filePath = resolve(__dirname, `../../audio/request/${userId}`, `${userId}-${timestamp}.ogg`)
						// Deleting .ogg file
						if (config.get('SAVE_VOICE_HISTORY') === 'response' || config.get('SAVE_VOICE_HISTORY') === 'false') {
							await utils.deleteFile(filePath)
							await utils.deleteDir(dirReq)
						}
					}

					await ctx.reply(code(`Ваш запрос к ChatGPT: ${text}`))

					if (process.env.IS_MISTAKES_MESSAGE === 'true') {
						await this.informAboutMistakes(userId, ctx, text);
					}

					ctx.session.messages.push({role: openAi.roles.USER, content: text})

					this.informAboutTokens(ctx);

					// Getting ChatGPT response
					const gptResponse = await openAi.chat(ctx.session.messages)
					// const gptResponse = {content: 'текст'}
					ctx.session.messages.push({role: openAi.roles.ASSISTANT, content: gptResponse.content})
					// Sending ChatGPT response to user
					// await ctx.reply(gptResponse.content)
					// Save statistics
					utils.pushStatistics(ctx.message.from, text, gptResponse.content, 'voice')
					// Voice response
					if (telegramBot.userSettings.get('responseMode') !== 'text') await ctx.reply(code(`Ожидаем голосового ответа...`))
					const responseVoicePath = await this.voiceResponse(userId, gptResponse, ctx)
					// Save history
					await this.saveHistory(ctx.message.from, text, filePath, gptResponse, responseVoicePath)
					Logger.info(`User id:${userId} received a response`, 'bot.handlers', 'voice', 'INFO')
					//
				} else {
					await ctx.reply(code(`Извините, ${ctx.message.from.first_name}, у Вас нет разрешения на использование бота.`))
					Logger.info(`User: ${ctx.message.from.first_name} id: ${ctx.message.from.id}`, 'bot.handlers', '', 'NO ACCESS', 'x')
				}
			} catch (err) {
				Logger.error('Voice processing', 'bot.handlers', '', err.message, 'ERROR', err);
			}
		})
	}

	text(telegramBot) {
		telegramBot.bot.on(message('text'), async ctx => {
			try {
				if (!ctx.session) ctx.session = telegramBot.SESSION

				if (JSON.stringify(telegramBot.whitelist).includes(ctx.message.from.username)) {
					if (ctx.session.messages.length === 0) {
						const practiceLanguage = process.env.PRACTICE_LANGUAGE ?? "English";
						const systemMessage = `
							You are the chatbot helping the user practice ${practiceLanguage}.
							Use some humor. 
						`;

						ctx.session.messages.push({role: openAi.roles.SYSTEM, content: systemMessage})
					}

					// Getting the userID
					const userId = String(ctx.message.from.id)
					// // Set user settings
					// await telegramBot.setUserSettings(userId)
					await ctx.reply(code('Идет обработка сообщения...'))
					ctx.session.messages.push({role: openAi.roles.USER, content: ctx.message.text})

					if (process.env.IS_MISTAKES_MESSAGE === 'true') {
						await this.informAboutMistakes(userId, ctx, ctx.message.text);
					}

					this.informAboutTokens(ctx);

					// Getting ChatGPT response
					const gptResponse = await openAi.chat(ctx.session.messages)
					ctx.session.messages.push({role: openAi.roles.ASSISTANT, content: gptResponse.content})
					// Sending ChatGPT response to user
					await ctx.reply(gptResponse.content)
					// Save statistics
					utils.pushStatistics(ctx.message.from, ctx.message.text, gptResponse.content, 'text')
					// Voice response
					if (telegramBot.userSettings.get('responseMode') !== 'text') await ctx.reply(code(`Ожидаем голосового ответа...`))
					const responseVoicePath = await this.voiceResponse(userId, gptResponse, ctx)
					// Save history
					await this.saveHistory(ctx.message.from, ctx.message.text, null, gptResponse, responseVoicePath)
					Logger.info(`User id:${userId} received a response`, 'bot.handlers', 'text', 'INFO')
				} else {
					await ctx.reply(code(`Извините, ${ctx.message.from.first_name}, у Вас нет разрешения на использование бота.`))
					Logger.info(`User: ${ctx.message.from.first_name} id: ${ctx.message.from.id}`, 'bot.handlers', '', 'NO ACCESS', 'x')
				}
			} catch (err) {
				Logger.error('Text processing', 'bot.handlers', '', err.message, 'ERROR', err);
			}
		})
	}

	async voiceResponse(userId, gptResponse, ctx, voice = null) {
		try {
			let response;
			const dirRes = `./audio/response/${userId}`
			if (!fs.existsSync(dirRes)) fs.mkdirSync(dirRes)

			if (config.get('VOICE_RESPONSE') === 'true') {
				const userSettings = telegramBot.userSettings
				const text = JSON.stringify(gptResponse.content)
				// TODO: Add translation settings to env or telegram settings
				// const translation = await googleTranslator.translate(text, {to: 'ru'})
				if (config.get('TEXT_TO_SPEECH_MODE') === 'any') {
					// Text to speech
					const gptVoiceResponseYandexPath = await yandexSpeech.textToSpeech(userId, userSettings, text)
					await ctx.replyWithAudio({source: gptVoiceResponseYandexPath})
					response = await googleTranslator.textToSpeech(ctx.message.from.id, text)
					await ctx.replyWithAudio({source: response})
					if (config.get('SAVE_VOICE_HISTORY') === 'request' || config.get('SAVE_VOICE_HISTORY') === 'false') {
						await utils.deleteFile(gptVoiceResponseYandexPath)
						await utils.deleteFile(response)
						await utils.deleteDir(dirRes)
					}
				}
				if (config.get('TEXT_TO_SPEECH_MODE') === 'yandex') {
					// Text to speech
					response = await yandexSpeech.textToSpeech(userId, userSettings, text)
					await ctx.replyWithAudio({source: response})
					if (config.get('SAVE_VOICE_HISTORY') === 'request' || config.get('SAVE_VOICE_HISTORY') === 'false') {
						await utils.deleteFile(response)
						await utils.deleteDir(dirRes)
					}
				}
				if (config.get('TEXT_TO_SPEECH_MODE') === 'google') {
					// Text to speech
					response = await googleTranslator.textToSpeech(ctx.message.from.id, text)
					await ctx.replyWithAudio({source: response})
					if (config.get('SAVE_VOICE_HISTORY') === 'request' || config.get('SAVE_VOICE_HISTORY') === 'false') {
						await utils.deleteFile(response)
						await utils.deleteDir(dirRes)
					}
				}
				if (config.get('TEXT_TO_SPEECH_MODE') === 'openai') {
					response = await openAi.textToSpeech(ctx.message.from.id, text, voice);

					await ctx.replyWithAudio({source: response})
					if (config.get('SAVE_VOICE_HISTORY') === 'request' || config.get('SAVE_VOICE_HISTORY') === 'false') {
						await utils.deleteFile(response)
						await utils.deleteDir(dirRes)
					}
				}
			}
			return response
		} catch (err) {
			Logger.error('Voice Response processing', 'bot.handlers', '', err.message, 'ERROR', err);
		}
	}

	async saveHistory(from, text, filePath, gptResponse, responseVoicePath) {
		try {
			if (config.get('SAVE_CHAT_HISTORY')) {
				const userData = {
					message: text,
					path: config.get('SAVE_VOICE_HISTORY') === 'request' || config.get('SAVE_VOICE_HISTORY') === 'any' ? filePath : null
				}
				const assistantData = {
					message: gptResponse.content,
					path: config.get('SAVE_VOICE_HISTORY') === 'response' || config.get('SAVE_VOICE_HISTORY') === 'any' ? responseVoicePath : null
				}
				await utils.pushHistory(from, userData, assistantData)
			}
		} catch (err) {
			Logger.error('Save history', 'bot.handlers', '', err.message, 'ERROR', err);
		}
	}

	// Informing about the token count
	informAboutTokens(ctx, ) {
		const tokensSpent = utils.approximateTokens(ctx.session.messages);
		if (!ctx.session.totalTokensSpent) {
			ctx.session.totalTokensSpent = 0;
		}
		ctx.session.totalTokensSpent += tokensSpent;
		let nf = new Intl.NumberFormat('en-US');
		const tokensSpentFormatted = nf.format(tokensSpent);
		const totalTokensFormatted = nf.format(ctx.session.totalTokensSpent);
		ctx.reply(`Tokens: ${tokensSpentFormatted}. Total: ${totalTokensFormatted}`);
	}

	async informAboutMistakes(userId, ctx, text) {
		const isContainsMistakes = await this.isContainsMistakes(text);

		if (isContainsMistakes) {
			const mistakesResponse = await this.getMistakesResponse(text);

			const voice = process.env.OPENAI_MISTAKES_VOICE ?? 'ash';
			await this.voiceResponse(userId, mistakesResponse, ctx, voice);
		}
	}

	async isContainsMistakes(text) {
		const mistakesQuestionPrompt = `
			Does this text contain any serious grammatical mistakes?
			The speech can be informal. The text is a transcription from audio.

			Answer "Yes" or "No" and nothing else.

			Here is the text to check:

			"
			${text}
			"
		`;

		const isMistakesFoundResponse = await openAi.chatOneMessage(mistakesQuestionPrompt, process.env.OPENAI_IMPORTANT_MODEL);
		const isMistakesFoundString = isMistakesFoundResponse.content;

		return isMistakesFoundString.toLowerCase().includes('yes');
	}

	async getMistakesResponse(text) {
		const mistakesQuestion = `
			What serious grammatical mistakes does this text have.
			If there are more than 3 mistakes, choose the 3 most important.

			The speech can be informal. The text is a transcription from audio.

			Make your answer very short.

			Here is the text:

			"
			${text}
			"
		`;

		return await openAi.chatOneMessage(mistakesQuestion, process.env.OPENAI_IMPORTANT_MODEL);
	}
}

export const handlers = new BotHandlers()
