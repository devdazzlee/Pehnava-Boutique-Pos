"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Award, BadgePercent, Gift, Loader2, Ticket, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import apiClient from "@/lib/apiClient";

/* Promotions, coupon codes, loyalty points and gift cards on the New Sale screen.
 * The server re-checks everything at checkout; this only previews the numbers. */

type Line = { productId: string; quantity: number; price: number };
type Applied = { id: string; name: string; code: string | null; amount: number };
type Loyalty = { enabled: boolean; balance: number; pointValue: number; minRedeem: number; maxRedeemPct: number; tier: { name: string } };
type AppliedCard = { code: string; amount: number; balance: number };

const money = (v: number) => `Rs ${Math.round(v).toLocaleString("en-PK")}`;
const apiError = (e: unknown) => {
  const err = e as { response?: { data?: { message?: string } }; message?: string };
  return err?.response?.data?.message || err?.message || "Something went wrong";
};

export function useSaleExtras({ lines, subtotal, manualDiscount, customerId, branchId }: { lines: Line[]; subtotal: number; manualDiscount: number; customerId: string | null; branchId?: string | null }) {
  const [applied, setApplied] = useState<Applied[]>([]);
  const [promoDiscount, setPromoDiscount] = useState(0);
  const [promoLoading, setPromoLoading] = useState(false);
  const [code, setCode] = useState("");
  const [codeStatus, setCodeStatus] = useState<string | null>(null);
  const [loyalty, setLoyalty] = useState<Loyalty | null>(null);
  const [redeemPoints, setRedeemPoints] = useState(0);
  const [cards, setCards] = useState<AppliedCard[]>([]);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const update = () => setOnline(typeof navigator === "undefined" ? true : navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  // Live promotion preview, debounced on cart changes.
  const key = useMemo(() => JSON.stringify([lines.map((l) => [l.productId, l.quantity, l.price]), code, branchId]), [lines, code, branchId]);
  useEffect(() => {
    if (!online || !lines.length) {
      setApplied([]);
      setPromoDiscount(0);
      setCodeStatus(null);
      return;
    }
    let live = true;
    setPromoLoading(true);
    const t = setTimeout(() => {
      apiClient
        .post("/promotions/preview", { items: lines, code: code || null, branchId: branchId || null })
        .then((r) => {
          if (!live) return;
          setApplied(r.data.data.applied);
          setPromoDiscount(r.data.data.discount);
          setCodeStatus(r.data.data.codeStatus);
        })
        .catch(() => {
          if (!live) return;
          setApplied([]);
          setPromoDiscount(0);
        })
        .finally(() => live && setPromoLoading(false));
    }, 350);
    return () => {
      live = false;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, online]);

  // Customer's points.
  useEffect(() => {
    setRedeemPoints(0);
    if (!customerId || !online) {
      setLoyalty(null);
      return;
    }
    let live = true;
    apiClient
      .get(`/loyalty/customers/${customerId}`)
      .then((r) => live && setLoyalty(r.data.data))
      .catch(() => live && setLoyalty(null));
    return () => {
      live = false;
    };
  }, [customerId, online]);

  const promo = Math.min(promoDiscount, Math.max(0, subtotal - manualDiscount));
  const afterPromo = Math.max(0, subtotal - manualDiscount - promo);
  const loyaltyCap = loyalty?.enabled ? Math.floor((afterPromo * loyalty.maxRedeemPct) / 100 / Math.max(0.0001, loyalty.pointValue)) : 0;
  const maxPoints = loyalty?.enabled ? Math.min(loyalty.balance, loyaltyCap) : 0;
  const points = Math.min(redeemPoints, maxPoints);
  const loyaltyDiscount = loyalty?.enabled ? Math.round(points * loyalty.pointValue * 100) / 100 : 0;
  const afterLoyalty = Math.max(0, afterPromo - loyaltyDiscount);
  const giftCardTotal = Math.min(afterLoyalty, cards.reduce((t, c) => t + c.amount, 0));

  // Keep gift card amounts within the bill when the cart shrinks.
  useEffect(() => {
    const total = cards.reduce((t, c) => t + c.amount, 0);
    if (total > afterLoyalty + 0.005 && cards.length) {
      let left = afterLoyalty;
      setCards((cs) =>
        cs
          .map((c) => {
            const amount = Math.max(0, Math.min(c.amount, left));
            left -= amount;
            return { ...c, amount };
          })
          .filter((c) => c.amount > 0),
      );
    }
  }, [afterLoyalty, cards]);

  const reset = useCallback(() => {
    setCode("");
    setCodeStatus(null);
    setRedeemPoints(0);
    setCards([]);
  }, []);

  const payload = {
    ...(code && codeStatus === "APPLIED" ? { promotionCode: code } : {}),
    ...(points > 0 ? { loyaltyPoints: points } : {}),
    ...(cards.length ? { giftCards: cards.map((c) => ({ code: c.code, amount: Math.round(c.amount * 100) / 100 })) } : {}),
  };

  return {
    online,
    applied,
    promoDiscount: promo,
    promoLoading,
    code,
    setCode,
    codeStatus,
    loyalty,
    redeemPoints: points,
    setRedeemPoints,
    maxPoints,
    loyaltyDiscount,
    cards,
    setCards,
    giftCardTotal,
    remainingForCards: Math.max(0, afterLoyalty - giftCardTotal),
    /** Discounts applied by the server (promotion + points). */
    extraDiscount: promo + loyaltyDiscount,
    payload,
    active: promo > 0 || loyaltyDiscount > 0 || giftCardTotal > 0 || !!code,
    reset,
  };
}

export type SaleExtras = ReturnType<typeof useSaleExtras>;

export function SaleExtrasPanel({ extras }: { extras: SaleExtras }) {
  const { toast } = useToast();
  const [codeInput, setCodeInput] = useState("");
  const [cardCode, setCardCode] = useState("");
  const [cardBusy, setCardBusy] = useState(false);
  const [pointsInput, setPointsInput] = useState("");
  const pointsRef = useRef<HTMLInputElement>(null);

  if (!extras.online) {
    return <p className="text-[11px] text-slate-400">Offline — promotions, points and gift cards are available once you&apos;re back online.</p>;
  }

  const applyCard = async () => {
    const code = cardCode.trim().toUpperCase();
    if (!code) return;
    if (extras.cards.some((c) => c.code === code)) return toast({ title: "This card is already applied" });
    setCardBusy(true);
    try {
      const r = await apiClient.get(`/gift-cards/check/${encodeURIComponent(code)}`);
      const card = r.data.data as { code: string; balance: number; usable: boolean; status: string };
      if (!card.usable) {
        toast({ variant: "destructive", title: `Gift card is ${card.status === "ACTIVE" ? "empty" : card.status.toLowerCase()}` });
        return;
      }
      const amount = Math.min(card.balance, extras.remainingForCards);
      if (amount <= 0) {
        toast({ title: "Nothing left to pay on this bill" });
        return;
      }
      extras.setCards([...extras.cards, { code: card.code, amount, balance: card.balance }]);
      setCardCode("");
      toast({ title: `Gift card applied: ${money(amount)}`, description: `Balance ${money(card.balance)}` });
    } catch (e) {
      toast({ variant: "destructive", title: "Gift card not found", description: apiError(e) });
    } finally {
      setCardBusy(false);
    }
  };

  return (
    <div className="space-y-1.5">
      {extras.applied.map((a) => (
        <div key={a.id} className="flex items-center justify-between gap-2 text-xs font-medium text-emerald-700">
          <span className="flex min-w-0 items-center gap-1">
            {a.code ? <Ticket className="h-3 w-3 shrink-0" /> : <BadgePercent className="h-3 w-3 shrink-0" />}
            <span className="truncate">{a.name}</span>
            {a.code && (
              <button type="button" onClick={() => extras.setCode("")} className="text-slate-400 hover:text-rose-600" title="Remove coupon">
                <X className="h-3 w-3" />
              </button>
            )}
          </span>
          <span className="tabular-nums">−{money(a.amount)}</span>
        </div>
      ))}

      {extras.loyaltyDiscount > 0 && (
        <div className="flex items-center justify-between text-xs font-medium text-emerald-700">
          <span className="flex items-center gap-1">
            <Award className="h-3 w-3" />
            {extras.redeemPoints.toLocaleString()} points
            <button type="button" onClick={() => extras.setRedeemPoints(0)} className="text-slate-400 hover:text-rose-600" title="Remove">
              <X className="h-3 w-3" />
            </button>
          </span>
          <span className="tabular-nums">−{money(extras.loyaltyDiscount)}</span>
        </div>
      )}

      {extras.cards.map((c) => (
        <div key={c.code} className="flex items-center justify-between text-xs font-medium text-violet-700">
          <span className="flex items-center gap-1">
            <Gift className="h-3 w-3" />
            <span className="font-mono">{c.code}</span>
            <button type="button" onClick={() => extras.setCards(extras.cards.filter((x) => x.code !== c.code))} className="text-slate-400 hover:text-rose-600" title="Remove">
              <X className="h-3 w-3" />
            </button>
          </span>
          <span className="tabular-nums">−{money(c.amount)}</span>
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-0.5">
        {extras.promoLoading && <Loader2 className="h-3 w-3 animate-spin text-slate-400" />}
        <Popover>
          <PopoverTrigger asChild>
            <button type="button" className="text-[11px] font-medium text-blue-600 hover:text-blue-700">
              {extras.code ? `Coupon ${extras.code}` : "+ Coupon"}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-3" align="start">
            <div className="mb-2 text-xs font-semibold text-slate-700">Coupon code</div>
            <div className="flex gap-1.5">
              <Input value={codeInput} onChange={(e) => setCodeInput(e.target.value.toUpperCase())} placeholder="EID20" className="h-8 font-mono uppercase" onKeyDown={(e) => e.key === "Enter" && extras.setCode(codeInput.trim())} />
              <Button size="sm" className="h-8" onClick={() => extras.setCode(codeInput.trim())}>
                Apply
              </Button>
            </div>
            {extras.code && extras.codeStatus && extras.codeStatus !== "APPLIED" && (
              <p className="mt-2 text-xs text-rose-600">{extras.codeStatus === "NOT_ELIGIBLE" ? "This bill doesn't qualify for the coupon." : "Coupon not found or expired."}</p>
            )}
            {extras.code && extras.codeStatus === "APPLIED" && <p className="mt-2 text-xs text-emerald-700">Coupon applied.</p>}
          </PopoverContent>
        </Popover>

        {extras.loyalty?.enabled && extras.loyalty.balance > 0 && (
          <Popover onOpenChange={(o) => o && setTimeout(() => pointsRef.current?.focus(), 50)}>
            <PopoverTrigger asChild>
              <button type="button" className="text-[11px] font-medium text-blue-600 hover:text-blue-700">
                + Points ({extras.loyalty.balance.toLocaleString()})
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-3" align="start">
              <div className="mb-1 text-xs font-semibold text-slate-700">
                Redeem points · {extras.loyalty.tier.name}
              </div>
              <p className="mb-2 text-[11px] text-slate-500">
                {extras.loyalty.balance.toLocaleString()} points = {money(extras.loyalty.balance * extras.loyalty.pointValue)}. Up to {extras.maxPoints.toLocaleString()} on this bill (min {extras.loyalty.minRedeem}).
              </p>
              <div className="flex gap-1.5">
                <Input ref={pointsRef} type="number" min={0} value={pointsInput} onChange={(e) => setPointsInput(e.target.value)} placeholder="Points" className="h-8" />
                <Button
                  size="sm"
                  className="h-8"
                  disabled={!extras.maxPoints}
                  onClick={() => {
                    const p = Math.min(extras.maxPoints, Math.max(0, parseInt(pointsInput, 10) || 0));
                    if (p && extras.loyalty && p < extras.loyalty.minRedeem) return toast({ variant: "destructive", title: `Redeem at least ${extras.loyalty.minRedeem} points` });
                    extras.setRedeemPoints(p);
                  }}
                >
                  Use
                </Button>
              </div>
              {extras.maxPoints > 0 && (
                <button type="button" onClick={() => { setPointsInput(String(extras.maxPoints)); extras.setRedeemPoints(extras.maxPoints); }} className="mt-2 text-[11px] font-medium text-blue-600">
                  Use maximum ({extras.maxPoints.toLocaleString()})
                </button>
              )}
            </PopoverContent>
          </Popover>
        )}

        <Popover>
          <PopoverTrigger asChild>
            <button type="button" className="text-[11px] font-medium text-blue-600 hover:text-blue-700">
              + Gift card
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-3" align="start">
            <div className="mb-2 text-xs font-semibold text-slate-700">Pay with a gift card</div>
            <div className="flex gap-1.5">
              <Input value={cardCode} onChange={(e) => setCardCode(e.target.value.toUpperCase())} placeholder="GC-XXXX-XXXX" className="h-8 font-mono uppercase" onKeyDown={(e) => e.key === "Enter" && applyCard()} />
              <Button size="sm" className="h-8" onClick={applyCard} disabled={cardBusy}>
                {cardBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Apply"}
              </Button>
            </div>
          </PopoverContent>
        </Popover>

        {extras.loyalty?.enabled && extras.loyalty.balance === 0 && <span className="text-[11px] text-slate-400">{extras.loyalty.tier.name} · 0 points</span>}
      </div>
    </div>
  );
}
