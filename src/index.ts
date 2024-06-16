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

const handleContactList = (ctx: Context) => async (c: C) => {
  c.body = (
    await Promise.allSettled(
      ctx.bots.map(async (bot) => ({
        bot,
        list: await bot.getGuildList(),
      })),
    )
  ).flatMap((x) => {
    if (x.status === 'rejected') return []
    const bot = x.value.bot
    return x.value.list.data.map((guild) => ({
      ...guild,
      platform: bot.platform,
      selfId: bot.selfId,
      type: bot.features.includes('guild.plain')
        ? Channel.Type.TEXT
        : Channel.Type.CATEGORY,
    }))
  })

  c.status = 200
}
