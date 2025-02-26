import { propOr } from 'ramda'

const InstallmentsCriteria = {
  ALL: 'ALL',
  MAX: 'MAX',
  MIN: 'MIN',
}

const gte = (a: number, b: number) => a > b
const lte = (a: number, b: number) => a < b

export const resolvers = {
  Offer: {
    Installments: (
      { Installments }: CommertialOffer,
      { criteria, rates }: { criteria?: string; rates?: boolean }
    ) => {
      if (criteria === InstallmentsCriteria.ALL || Installments.length === 0) {
        return Installments
      }
      const filteredInstallments = !rates
        ? Installments
        : Installments.filter(({ InterestRate }) => !InterestRate)

      const compareFunc = criteria === InstallmentsCriteria.MAX ? gte : lte
      const value = filteredInstallments.reduce(
        (acc, currentValue) =>
          compareFunc(
            currentValue.NumberOfInstallments,
            acc.NumberOfInstallments
          )
            ? currentValue
            : acc,
        filteredInstallments[0]
      )
      return [value]
    },
    teasers: propOr([], 'Teasers'),
    giftSkuIds: propOr([], 'GiftSkuIds'),
    discountHighlights: propOr([], 'DiscountHighLight'),
  },
}
