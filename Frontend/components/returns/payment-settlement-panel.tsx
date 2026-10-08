"use client"

import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import {
  EXCHANGE_BALANCE_ACTIONS,
  type ExchangeBalanceAction,
} from "@/components/returns/constants"
import {
  formatMoney,
  type PaymentSettlementDetails,
} from "@/components/returns/utils"

interface PaymentSettlementPanelProps {
  settlement: PaymentSettlementDetails
  title?: string
  showSettlementMethod?: boolean
  exchangeBalanceAction?: ExchangeBalanceAction
  onExchangeBalanceActionChange?: (value: ExchangeBalanceAction) => void
  className?: string
}

export function PaymentSettlementPanel({
  settlement,
  title = "Payment details",
  showSettlementMethod = false,
  exchangeBalanceAction,
  onExchangeBalanceActionChange,
  className,
}: PaymentSettlementPanelProps) {
  const {
    originalOrderAmount,
    returnedItemsValue,
    returnedItemsGrossValue,
    orderDiscountApplied,
    replacementItemsValue,
    replacementItemsGrossValue,
    exchangeOrderDiscountApplied,
    transactionType,
    returnTypeLabel,
    finalBalanceType,
    finalBalanceLabel,
    finalBalanceAmount,
    balanceDue,
  } = settlement

  const hasProratedDiscount = (orderDiscountApplied ?? 0) > 0.005
  const hasExchangeOrderDiscount = (exchangeOrderDiscountApplied ?? 0) > 0.005

  const finalBoxClass =
    finalBalanceType === "refund"
      ? "border-green-300 bg-green-50"
      : finalBalanceType === "collect"
        ? "border-amber-300 bg-amber-50"
        : "border-blue-300 bg-blue-50"

  return (
    <div className={cn("rounded-lg border bg-white p-4 space-y-4", className)}>
      <div>
        <h4 className="font-semibold text-base">{title}</h4>
        <p className="text-xs text-gray-500 mt-0.5">{returnTypeLabel}</p>
      </div>

      <div className="space-y-2 text-sm">
        <div className="flex items-center justify-between rounded-md bg-gray-50 px-3 py-2">
          <span className="text-gray-700">Original order amount</span>
          <span className="font-semibold">{formatMoney(originalOrderAmount)}</span>
        </div>

        {returnedItemsValue > 0.005 && (
          <>
            <div className="flex items-center justify-between px-1">
              <span className="text-gray-600">
                {transactionType === "EXCHANGE"
                  ? "Credit from old dress"
                  : settlement.returnScope === "FULL"
                    ? "Full return value"
                    : "Partial return value"}
              </span>
              <span className="font-semibold text-red-600">
                {formatMoney(returnedItemsValue)}
              </span>
            </div>
            {hasProratedDiscount && (
              <>
                <div className="flex items-center justify-between px-1 text-xs">
                  <span className="text-gray-500">Tag price of returned dress</span>
                  <span className="text-gray-500">{formatMoney(returnedItemsGrossValue)}</span>
                </div>
                <div className="flex items-center justify-between px-1">
                  <span className="text-gray-600">
                    Minus discount on original bill
                  </span>
                  <span className="font-semibold text-gray-600">
                    − {formatMoney(orderDiscountApplied)}
                  </span>
                </div>
              </>
            )}
          </>
        )}

        {transactionType === "RETURN" && returnedItemsValue > 0.005 && (
          <div className="flex items-center justify-between px-1 border-t pt-2">
            <span className="text-gray-600">Refund to customer</span>
            <span className="font-semibold text-green-700">
              {formatMoney(returnedItemsValue)}
            </span>
          </div>
        )}

        {transactionType === "EXCHANGE" && (
          <>
            {replacementItemsValue > 0.005 && (
              <>
                {hasExchangeOrderDiscount && (
                  <>
                    <div className="flex items-center justify-between px-1 text-xs">
                      <span className="text-gray-500">New dresses total (before extra discount)</span>
                      <span className="text-gray-500">
                        {formatMoney(replacementItemsGrossValue ?? replacementItemsValue)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between px-1">
                      <span className="text-gray-600">Extra discount on new dresses</span>
                      <span className="font-semibold text-gray-600">
                        − {formatMoney(exchangeOrderDiscountApplied ?? 0)}
                      </span>
                    </div>
                  </>
                )}
                <div className="flex items-center justify-between px-1">
                  <span className="text-gray-600">New dresses total (after discounts)</span>
                  <span className="font-semibold">{formatMoney(replacementItemsValue)}</span>
                </div>
              </>
            )}
            {returnedItemsValue > 0.005 && replacementItemsValue > 0.005 && (
              <div className="flex items-center justify-between px-1 border-t border-dashed pt-2">
                <span className="text-gray-600">Old dress credit applied</span>
                <span className="font-semibold text-green-700">
                  -{formatMoney(returnedItemsValue)}
                </span>
              </div>
            )}
          </>
        )}
      </div>

      <div className={cn("rounded-lg border-2 px-4 py-3", finalBoxClass)}>
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-600">
          Final balance
        </p>
        <p className="text-lg font-bold mt-1">{finalBalanceLabel}</p>
        {finalBalanceAmount > 0.005 && (
          <p className="text-2xl font-bold mt-0.5">{formatMoney(finalBalanceAmount)}</p>
        )}
        {transactionType === "EXCHANGE" &&
          returnedItemsValue > 0.005 &&
          replacementItemsValue > 0.005 && (
            <p className="text-xs text-gray-600 mt-2">
              {formatMoney(replacementItemsValue)} (new items) −{" "}
              {formatMoney(returnedItemsValue)} (return credit) ={" "}
              {balanceDue > 0.005
                ? `${formatMoney(balanceDue)} to collect`
                : balanceDue < -0.005
                  ? `${formatMoney(Math.abs(balanceDue))} refund`
                  : "no difference"}
            </p>
          )}
        {transactionType === "RETURN" &&
          settlement.returnScope === "PARTIAL" &&
          returnedItemsValue > 0.005 && (
            <p className="text-xs text-gray-600 mt-2">
              Refund based on {formatMoney(returnedItemsValue)} of selected returned items
              (original order {formatMoney(originalOrderAmount)})
            </p>
          )}
      </div>

      {showSettlementMethod &&
        transactionType === "EXCHANGE" &&
        Math.abs(balanceDue) > 0.005 &&
        exchangeBalanceAction &&
        onExchangeBalanceActionChange && (
          <div className="space-y-2">
            <Label>How to handle the difference</Label>
            <Select
              value={exchangeBalanceAction}
              onValueChange={(v) =>
                onExchangeBalanceActionChange(v as ExchangeBalanceAction)
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXCHANGE_BALANCE_ACTIONS.filter((action) =>
                  balanceDue > 0 ? action.value === "collect" : action.value !== "collect",
                ).map((action) => (
                  <SelectItem key={action.value} value={action.value}>
                    {action.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
    </div>
  )
}
