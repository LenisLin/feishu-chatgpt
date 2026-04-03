import config from '../config'
import { reply } from '../lib/reply'

export default {
  'im.message.receive_v1': async (body: any, { client, app }: any) => {
    const message = body.event.message
    const rawText = JSON.parse(message.content).text

    // 解析提及状态
    const mentions = message.mentions || []
    const isBotMentioned = mentions.some((m: any) => m.name === config.botName)
    const isUserMentioned = mentions.some((m: any) => m.id.open_id === config.userOpenId)

    // 清理文本中的 @ 标签
    const text = rawText.replace(/@_user_\d+\s?/g, '').trim()

    // 逻辑判定：当且仅当群里@了你，且没有@机器人时，开启代答模式
    const isAssistantMode = isUserMentioned && !isBotMentioned

    const answer = await reply([
      {
        role: 'user',
        content: `${app.prompt || ''} ${text}`,
      },
    ], isAssistantMode)

    await client.im.message.create({
      params: {
        receive_id_type: 'chat_id',
      },
      data: {
        receive_id: message.chat_id,
        content: JSON.stringify({ text: answer }),
        msg_type: 'text',
      },
    })
  },
}
