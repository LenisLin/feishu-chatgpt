import config from '../config'
import { sample } from 'midash'
import { retry as pRetry } from '@shanyue/promise-utils'

type ChatMessage = { role: 'system' | 'user' | 'assistant', content: string }

const errorMessages = ['抱歉，我现在不方便处理这条消息。']

// 增强：增加 isAssistantMode 参数
export async function reply(messages: ChatMessage[], isAssistantMode: boolean = false): Promise<string> {
  const apiKey = sample(config.apiKey)?.trim()
  
  // 如果是代答模式，注入一段系统指令
  if (isAssistantMode) {
    messages.unshift({
      role: 'system',
      content: '你现在是我的AI私人助理。群里有人@我（你的主人）了，但我现在不在。请你以助理的口吻，礼貌、专业地根据对方的问题进行回复，并说明你会将消息转达给我。'
    })
  }

  const payload = {
    model: config.model || 'gpt-5.4',
    messages: messages,
    stream: true
  }

  const getReply = async () => {
    const response = await fetch(`${config.baseURL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(payload)
    })

    if (!response.ok) {
      const errText = await response.text()
      throw new Error(`[HTTP ${response.status}] ${errText}`)
    }

    const reader = response.body?.getReader()
    if (!reader) throw new Error('流读取器初始化失败')

    const decoder = new TextDecoder('utf-8')
    let fullText = ''
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (value) {
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const line of lines) {
          const trimmedLine = line.trim()
          if (!trimmedLine || trimmedLine === 'data: [DONE]') continue
          if (trimmedLine.startsWith('data: ')) {
            try {
              const dataStr = trimmedLine.slice(6)
              const data = JSON.parse(dataStr)
              const content = data.choices?.[0]?.delta?.content
              if (content) fullText += content
            } catch (e) {}
          }
        }
      }
      if (done) break
    }
    return fullText || '未获取到内容'
  }

  return pRetry(getReply, { times: 2 }).catch((e: any) => {
    console.error('API调用失败:', e.message)
    return errorMessages[0]
  })
}
