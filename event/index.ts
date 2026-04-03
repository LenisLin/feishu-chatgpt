import config from '../config'
import { reply } from '../lib/reply'
import { getReplyMessage, replyMessage } from '../lib/helpter'

export const imMessageReceiveV1 = async (data: any) => {
  const { message } = data
  
  // 1. 解析消息文本
  let text = JSON.parse(message.content).text
  
  // 2. 判断触发状态
  // 是否提到了机器人
  const isBotMentioned = message.mentions?.some((x: any) => x.name === config.botName)
  // 是否提到了你本人
  const isUserMentioned = message.mentions?.some((x: any) => x.id.open_id === config.userOpenId)

  // 3. 拦截逻辑：在群聊中，既没提到机器人也没提到你，则忽略
  if (message.chat_type === 'group' && !isBotMentioned && !isUserMentioned) {
    return
  }

  // 4. 清理文本中的 @ 标签（移除所有提及标识，保留纯净问题）
  const content = text.replace(/@_user_\d+\s?/g, '').trim()

  // 5. 调用回复逻辑，传入标识判断是否为“代答模式”
  const replyContent = await reply([
    {
      role: 'user',
      content: content
    }
  ], isUserMentioned && !isBotMentioned) // 如果只提到了你，开启代答模式

  const { message_id } = await replyMessage(message.message_id, getReplyMessage(replyContent))
  return { message_id }
}
