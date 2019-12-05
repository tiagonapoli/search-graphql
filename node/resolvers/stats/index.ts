import { searchUrlsCount, SORT } from "./searchUrlsCount"

export const queries = {
  searchUrlsCount: async (
    _: any,
    args: { limit: number, sort?: SORT },
    ctx: Context
  ) => {
    const { clients: { vbase } } = ctx
    return searchUrlsCount(vbase, args.limit, args.sort)
  },
}
