import {
  compose,
  last,
  map,
  omit,
  prop,
  propOr,
  reject,
  split,
  toPairs,
  pathOr,
} from 'ramda'

import { getBenefits } from '../benefits'
import { buildCategoryMap } from './utils'

type MaybeRecord = false | Record<string, any>
const objToNameValue = (
  keyName: string,
  valueName: string,
  record: Record<string, any>
) =>
  compose<Record<string, any>, [string, any][], MaybeRecord[], MaybeRecord>(
    reject<MaybeRecord>(value => typeof value === 'boolean' && value === false),
    map<[string, any], MaybeRecord>(
      ([key, value]) =>
        typeof value === 'string' && { [keyName]: key, [valueName]: value }
    ),
    toPairs
  )(record)

type SearchProductWithCache = SearchProduct & { cacheId?: string }
enum ItemsFilterEnum {
  ALL = 'ALL',
  FIRST_AVAILABLE = 'FIRST_AVAILABLE',
  ALL_AVAILABLE = 'ALL_AVAILABLE',
}
interface ItemArg {
  filter?: ItemsFilterEnum
}

const isSellerAvailable = (seller: Seller) =>
  pathOr(0, ['commertialOffer', 'AvailableQuantity'], seller) > 0

const isAvailable = (item: SearchItem) => {
  return item.sellers.find(isSellerAvailable)
}

const knownNotPG = [
  'allSpecifications',
  'brand',
  'categoriesIds',
  'categoryId',
  'clusterHighlights',
  'productClusters',
  'items',
  'productId',
  'link',
  'linkText',
  'productReference',
]

const removeTrailingSlashes = (str: string) =>
  str.endsWith('/') ? str.slice(0, str.length - 1) : str

const removeStartingSlashes = (str: string) =>
  str.startsWith('/') ? str.slice(1) : str

const getLastCategory = compose<string, string, string[], string>(
  last,
  split('/'),
  removeTrailingSlashes
)

const treeStringToArray = compose(
  split('/'),
  removeTrailingSlashes,
  removeStartingSlashes
)

const findMainTree = (categoriesIds: string[], prodCategoryId: string) => {
  const mainTree = categoriesIds.find(
    treeIdString => getLastCategory(treeIdString) === prodCategoryId
  )
  if (mainTree) {
    return treeStringToArray(mainTree)
  }

  // If we are here, did not find the specified main category ID in given strings. It is probably a bug.
  // We will return the biggest tree we find

  const trees = categoriesIds.map(treeStringToArray)

  return trees.reduce(
    (acc, currTree) => (currTree.length > acc.length ? currTree : acc),
    []
  )
}

const productCategoriesToCategoryTree = async (
  { categories, categoriesIds, categoryId: prodCategoryId }: SearchProduct,
  _: any,
  { clients: { search }, vtex: { platform } }: Context
) => {
  if (!categories || !categoriesIds) {
    return []
  }

  const mainTreeIds = findMainTree(categoriesIds, prodCategoryId)

  if (platform === 'vtex') {
    return mainTreeIds.map(categoryId => search.category(Number(categoryId)))
  }
  const categoriesTree = await search.categories(mainTreeIds.length)
  const categoryMap = buildCategoryMap(categoriesTree)
  const mappedCategories = mainTreeIds
    .map(id => categoryMap[id])
    .filter(Boolean)

  return mappedCategories.length ? mappedCategories : null
}

export const resolvers = {
  Product: {
    benefits: ({ productId }: SearchProduct, _: any, ctx: Context) =>
      getBenefits(productId, ctx),

    categoryTree: productCategoriesToCategoryTree,

    cacheId: ({ linkText, cacheId }: SearchProductWithCache) =>
      cacheId || linkText,

    clusterHighlights: ({ clusterHighlights = {} }) =>
      objToNameValue('id', 'name', clusterHighlights),

    jsonSpecifications: (product: SearchProduct) => {
      const { Specifications = [] } = product
      const specificationsMap = Specifications.reduce(
        (acc: Record<string, string>, key: string) => {
          acc[key] = (product as any)[key]
          return acc
        },
        {}
      )
      return JSON.stringify(specificationsMap)
    },

    productClusters: ({ productClusters = {} }: SearchProduct) =>
      objToNameValue('id', 'name', productClusters),

    properties: (product: SearchProduct) =>
      map(
        (name: string) => ({ name, values: (product as any)[name] }),
        product.allSpecifications || []
      ),

    propertyGroups: (product: SearchProduct) => {
      const { allSpecifications = [] } = product
      const notPG = knownNotPG.concat(allSpecifications)
      return objToNameValue('name', 'values', omit(notPG, product))
    },

    recommendations: (product: SearchProduct) => product,

    titleTag: prop('productTitle'),

    specificationGroups: (product: SearchProduct) => {
      const allSpecificationsGroups = propOr<[], SearchProduct, string[]>(
        [],
        'allSpecificationsGroups',
        product
      ).concat(['allSpecifications'])
      const specificationGroups = allSpecificationsGroups.map(
        (groupName: string) => ({
          name: groupName,
          specifications: ((product as any)[groupName] || []).map(
            (name: string) => ({
              name,
              values: (product as any)[name] || [],
            })
          ),
        })
      )
      return specificationGroups || []
    },
    items: ({ items: searchItems }: SearchProduct, { filter }: ItemArg) => {
      if (filter === ItemsFilterEnum.ALL) {
        return searchItems
      }
      if (filter === ItemsFilterEnum.FIRST_AVAILABLE) {
        const firstAvailable = searchItems.find(isAvailable)
        return firstAvailable ? [firstAvailable] : [searchItems[0]]
      }
      if (filter === ItemsFilterEnum.ALL_AVAILABLE) {
        const onlyAvailable = searchItems.filter(isAvailable)
        return onlyAvailable.length > 0 ? onlyAvailable : [searchItems[0]]
      }
      return searchItems
    },
    priceRange: ({ items: searchItems }: SearchProduct) => {
      const offers = searchItems.reduce<CommertialOffer[]>(
        (acc, currentItem) => {
          for (const seller of currentItem.sellers) {
            if (isSellerAvailable(seller)) {
              acc.push(seller.commertialOffer)
            }
          }
          return acc
        },
        []
      )

      return { offers }
    },
  },
  OnlyProduct: {
    categoryTree: productCategoriesToCategoryTree,
  },
}
