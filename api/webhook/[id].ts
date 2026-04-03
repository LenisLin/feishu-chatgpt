import * as lark from '@larksuiteoapi/node-sdk'
import { VercelRequest, VercelResponse } from '@vercel/node'

import config from '../../config'
import eventHandles from '../../event'
import { cache } from '../../lib/cache'

function createLarkClient(appId: string, appSecret: string): lark.Client {
  let client = cache[appId]
  if (client) {
    return client
  }
  client = new lark.Client({
    appId,
    appSecret,
  })
  return client
}

type Bot = {
  open_id: string;
  app_name: string;
}

async function getBot(client: lark.Client): Promise<Bot | undefined> {
  const key = `Bot:${client.appId}`
  let bot = cache.get(key) as Bot
  if (bot) {
    return bot
  }
  bot = await client.request({ url: '/open-apis/bot/v3/info' }).then(o => o.bot).catch(() => {})
  if (bot) {
    cache.set(key, bot)
  }
  return bot
}

function isDuplicateId(id: string): boolean {
  const key = `Event:${id}`
  if (cache.get(key)) {
    return true
  }
  cache.set(key, true, {
    ttl: 24 * 3600 * 1000,
  })
  return false
}

export default async function webhook(
  request: VercelRequest,
  response: VercelResponse
) {
  const { id } = request.query
  const body = request.body || {}
  console.log(JSON.stringify(body, null, 2))

  const app = config.app[id as string]

  if (!app) {
    return response.status(404).send(`App ${id} Not Found`)
  }
  if (body.challenge) {
    return response.json({ challenge: body.challenge })
  }

  const client = createLarkClient(app.appId, app.appSecret)
  const bot = await getBot(client)

  // 更新拦截逻辑：只有在既没有@机器人，也没有@你本人的情况下，才忽略群聊消息
  const mentions = body?.event?.message?.mentions || []
  const isBotMentioned = mentions.some((m: any) => m.id.open_id === bot?.open_id)
  const isUserMentioned = mentions.some((m: any) => m.id.open_id === config.userOpenId)

  if (body?.event?.message?.chat_type === 'group' && !isBotMentioned && !isUserMentioned) {
    return response.json({
      mention: false,
    })
  }

  if (!body || !body.header) {
    console.error('Invalid request body structure', body);
    return response.json({ error: 'invalid payload' });
  }
  
  const eventId = body.header.event_id;
  if (isDuplicateId(eventId)) {
    return response.json({
      retry: true,
    })
  }

  await eventHandles[body.header.event_type]?.(body, { client, app })

  return response.json({
    done: true,
  })
}
