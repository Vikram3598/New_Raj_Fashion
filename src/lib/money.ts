const INR = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

export function paiseToInr(paise: number): string {
  return INR.format(paise / 100);
}

export function inrToPaise(amount: number): number {
  return Math.round(amount * 100);
}

export function rupeesFromPaise(paise: number): number {
  return paise / 100;
}
