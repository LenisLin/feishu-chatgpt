import config from '../config'
import { sample } from 'midash'
import { retry as pRetry } from '@shanyue/promise-utils'

type ChatMessage = { role: 'system' | 'user' | 'assistant', content: string }

const errorMessages = ['抱歉，我发生了一点小意外，请稍后再试。']

export async function reply(messages: ChatMessage[]): Promise<string> {
  const apiKey = sample(config.apiKey)?.trim() // 确保 key 没有多余空格
  
  const payload = {
    model: config.model || 'gpt-3.5-turbo', 
    messages: messages,
    stream: true // 强行开启流式，满足代理商要求
  }
  
  // 核心检测点：只要在 Zeabur 日志看到这段话，证明新代码绝对生效了
  console.log('\n====== 核心调试日志 ======')
  console.log('目标URL:', `${config.baseURL}/v1/chat/completions`)
  console.log('流式状态:', payload.stream)
  console.log('==========================\n')

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
        
        // 保留未闭合的残缺数据片段，等待下一次循环拼接
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
            } catch (e) {
              // 忽略碎片解析错误，继续处理数据流
            }
          }
        }
      }
      if (done) break
    }
    
    if (!fullText) throw new Error('流解析未提取到有效内容')
    return fullText
  }

  return pRetry(getReply, { times: 2 }).catch((e: any) => {
    console.error('API调用彻底失败:', e.message || e)
    return errorMessages[0]
  })
}
