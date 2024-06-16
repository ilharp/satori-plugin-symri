import type {} from '@cordisjs/plugin-server'
import type Router from '@koa/router'
import type { Context } from '@satorijs/core'
import { Schema } from '@satorijs/core'
import { Channel } from '@satorijs/protocol'
import type {
  DefaultContext,
  DefaultState,
  Next,
  ParameterizedContext,
} from 'koa'

export const name = 'symri'

export const inject = {
  required: ['server'],
}

export interface Config {
  path: string
  token: string
}

export const Config: Schema<Config> = Schema.intersect([
  Schema.object({
    path: Schema.string().default('/symri'),
    token: Schema.string().default(''),
  }),
])

type C = ParameterizedContext<
  DefaultState,
  DefaultContext & Router.RouterParamContext<DefaultState, DefaultContext>,
  unknown
>

export function apply(ctx: Context, config: Config) {
  ctx.server.post(
    `${config.path}/v1/contact.list`,
    handleAuth(config),
    handleContactList(ctx),
  )
}

const handleAuth = (config: Config) => (c: C, next: Next) => {
  if (
    config.token &&
    !(
      c.headers.authorization?.slice(0, 7) === 'Bearer ' &&
      c.headers.authorization.slice(7) === config.token
    )
  ) {
    c.status = 401
    c.body = '401 unauthorized'

    return
  }

  return next()
}

export interface Contact {
  id: string
  name?: string
  avatar?: string
  platform: string
  logins: {
    selfId: string
  }[]
  type: Channel.Type
}

const handleContactList = (ctx: Context) => async (c: C) => {
  const result: Record<string, Contact> = {}

  const guildLists = await Promise.allSettled(
    ctx.bots.map(async (bot) => ({
      bot,
      list: await bot.getGuildList(),
    })),
  )

  for (const guildList of guildLists) {
    if (guildList.status === 'rejected') continue

    const { bot, list } = guildList.value

    for (const guild of list.data) {
      const key = `${bot.platform}:${guild.id}`
      result[key] ||= {
        logins: [],
      } as unknown as Contact
      const contact = result[key]!

      Object.assign(contact, guild)

      // Modify contact
      contact.platform = bot.platform
      contact.type = bot.features.includes('guild.plain')
        ? Channel.Type.TEXT
        : Channel.Type.CATEGORY

      let login = contact.logins.find((x) => x.selfId === bot.selfId)
      if (!login) {
        login = {
          selfId: bot.selfId,
        }
        contact.logins.push(login)
      }

      // Modify login
    }
  }

  c.body = Object.values(result)
  c.status = 200
}
